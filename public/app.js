(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const cfg = window.APP_CONFIG || {};

  // Column definitions – the "sheet" structure.
  const COLS = [
    { key: "influencer_email", label: "Influencer Email", type: "text", w: 200 },
    { key: "influencer_name", label: "Name", type: "text", w: 140 },
    { key: "campaign", label: "Campaign / Promotion", type: "text", w: 180 },
    { key: "link", label: "Link", type: "link", w: 200 },
    { key: "entry_date", label: "Date", type: "date", w: 140 },
    { key: "clicks", label: "Clicks", type: "int", w: 90, sum: true },
    { key: "leads", label: "Leads", type: "int", w: 90, sum: true },
    { key: "downloads", label: "Downloads", type: "int", w: 100, sum: true },
    { key: "conversions", label: "Conversions", type: "int", w: 110, sum: true },
    { key: "payments", label: "Payments", type: "int", w: 100, sum: true },
    { key: "amount", label: "Amount ₹", type: "money", w: 120, sum: true },
    { key: "payout", label: "Payout ₹", type: "money", w: 120, sum: true },
    { key: "status", label: "Status", type: "select", w: 110, options: ["Active", "Pending", "Paused", "Done", "Paid"] },
    { key: "notes", label: "Notes", type: "text", w: 220 },
  ];
  const NUMERIC = new Set(["int", "money"]);
  const letter = (i) => String.fromCharCode(65 + i);
  const fmtInt = new Intl.NumberFormat("en-IN");
  const fmtMoney = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const state = { rows: [], isAdmin: false, user: null, channel: null };

  const show = (id) => {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    $(id).classList.remove("hidden");
  };

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    show("#configView");
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- Auth ----------
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginMsg").textContent = "";
    const { error } = await sb.auth.signInWithPassword({
      email: $("#email").value.trim(),
      password: $("#password").value,
    });
    if (error) $("#loginMsg").textContent = error.message;
  });

  $("#logoutBtn").addEventListener("click", () => sb.auth.signOut());

  sb.auth.onAuthStateChange((_event, session) => {
    // Defer: Supabase recommends not awaiting other calls inside this callback.
    setTimeout(() => onSession(session), 0);
  });

  let currentUserId; // undefined until first auth event
  async function onSession(session) {
    const uid = session?.user?.id || null;
    if (uid === currentUserId) return;
    currentUserId = uid;
    if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }

    if (!session) {
      state.rows = [];
      $("#password").value = "";
      show("#loginView");
      return;
    }
    state.user = session.user;
    const { data, error } = await sb.rpc("is_admin");
    state.isAdmin = !error && data === true;

    $("#userEmail").textContent = session.user.email;
    $("#roleBadge").textContent = state.isAdmin ? "OWNER · EDIT" : "VIEW ONLY";
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !state.isAdmin));
    $("#filterInfluencer").classList.toggle("hidden", !state.isAdmin);
    show("#appView");
    await loadRows();

    if (!state.isAdmin) {
      // Influencers get live updates when the owner edits their data.
      let t;
      state.channel = sb
        .channel("ad_entries_live")
        .on("postgres_changes", { event: "*", schema: "public", table: "ad_entries" }, () => {
          clearTimeout(t);
          t = setTimeout(loadRows, 500);
        })
        .subscribe();
    }
  }

  // ---------- Data ----------
  async function loadRows() {
    setStatus("Loading…");
    const { data, error } = await sb
      .from("ad_entries")
      .select("*")
      .order("entry_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (error) { setStatus("Error: " + error.message, true); return; }
    state.rows = data || [];
    setStatus("");
    fillFilter();
    render();
  }

  function setStatus(text, isErr) {
    const el = $("#saveStatus");
    el.textContent = text;
    el.style.color = isErr ? "var(--err)" : "";
  }

  function fillFilter() {
    const sel = $("#filterInfluencer");
    const prev = sel.value;
    const emails = [...new Set(state.rows.map((r) => (r.influencer_email || "").trim()).filter(Boolean))].sort();
    sel.replaceChildren(new Option("All influencers", ""), ...emails.map((e) => new Option(e, e)));
    if (emails.includes(prev)) sel.value = prev;
  }

  function visibleRows() {
    const f = $("#filterInfluencer").value;
    const q = $("#search").value.trim().toLowerCase();
    return state.rows.filter((r) => {
      if (f && (r.influencer_email || "").trim() !== f) return false;
      if (!q) return true;
      return COLS.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q));
    });
  }

  // ---------- Render ----------
  function render() {
    const rows = visibleRows();
    const table = $("#sheet");
    const editable = state.isAdmin;

    // Header: Sheets-style column letters + labels
    const hr = document.createElement("tr");
    hr.append(th("", "rn"));
    COLS.forEach((c, i) => {
      const h = th(c.label);
      const s = document.createElement("small");
      s.textContent = letter(i);
      h.prepend(s);
      h.style.minWidth = c.w + "px";
      hr.append(h);
    });
    if (editable) hr.append(th(""));
    table.tHead.replaceChildren(hr);

    // Body
    const body = document.createDocumentFragment();
    rows.forEach((r, idx) => body.append(rowEl(r, idx + 1, editable)));
    table.tBodies[0].replaceChildren(body);

    // Footer totals
    const totals = sums(rows);
    const fr = document.createElement("tr");
    fr.append(td("Σ", "rn"));
    COLS.forEach((c, i) => {
      if (i === 0) { fr.append(td(rows.length + " rows")); return; }
      fr.append(c.sum ? td(fmt(c, totals[c.key]), "num") : td(""));
    });
    if (editable) fr.append(td(""));
    table.tFoot.replaceChildren(fr);

    $("#emptyMsg").classList.toggle("hidden", rows.length > 0);
    renderCards(totals);
  }

  function rowEl(r, n, editable) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    tr.append(td(String(n), "rn"));
    COLS.forEach((c) => {
      const cell = document.createElement("td");
      if (NUMERIC.has(c.type)) cell.className = "num";
      cell.append(editable ? editor(r, c, cell) : viewer(r, c));
      tr.append(cell);
    });
    if (editable) {
      const d = document.createElement("td");
      const b = document.createElement("button");
      b.className = "del";
      b.title = "Delete row";
      b.textContent = "×";
      b.addEventListener("click", () => deleteRow(r));
      d.append(b);
      tr.append(d);
    }
    return tr;
  }

  function viewer(r, c) {
    const v = r[c.key];
    if (c.type === "link" && /^https?:\/\//i.test(v || "")) {
      const a = document.createElement("a");
      a.className = "cell";
      a.href = v;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = v;
      return a;
    }
    const s = document.createElement("span");
    s.className = "cell";
    s.textContent = NUMERIC.has(c.type) ? fmt(c, v) : v ?? "";
    s.title = s.textContent;
    return s;
  }

  function editor(r, c, cellTd) {
    let el;
    if (c.type === "select") {
      el = document.createElement("select");
      const opts = c.options.includes(r[c.key]) ? c.options : [r[c.key], ...c.options];
      opts.forEach((o) => el.add(new Option(o, o)));
      el.value = r[c.key];
    } else {
      el = document.createElement("input");
      el.type = c.type === "date" ? "date" : "text";
      if (NUMERIC.has(c.type)) el.inputMode = "decimal";
      el.value = r[c.key] ?? "";
    }
    el.className = "cell";
    el.addEventListener("change", () => saveCell(r, c, el, cellTd));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (c.type === "select" && e.key !== "Enter") return;
        e.preventDefault();
        moveFocus(cellTd, e.key === "ArrowUp" ? -1 : 1);
      } else if (e.key === "Escape") {
        el.value = r[c.key] ?? "";
        el.blur();
      }
    });
    return el;
  }

  function moveFocus(cellTd, dir) {
    const tr = cellTd.parentElement;
    const col = [...tr.children].indexOf(cellTd);
    const next = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling;
    next?.children[col]?.querySelector(".cell")?.focus();
  }

  function parse(c, raw) {
    const s = String(raw).trim();
    if (c.type === "int") {
      const n = Math.round(Number(s.replace(/[, ]/g, "") || 0));
      return Number.isFinite(n) ? n : NaN;
    }
    if (c.type === "money") {
      const n = Number(s.replace(/[₹, ]/g, "") || 0);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
    }
    if (c.type === "date") return s || null;
    return s.slice(0, 2000);
  }

  async function saveCell(r, c, el, cellTd) {
    const val = parse(c, el.value);
    if (Number.isNaN(val)) {
      cellTd.classList.add("err");
      setStatus("Invalid number in " + c.label, true);
      return;
    }
    cellTd.classList.remove("err");
    cellTd.classList.add("saving");
    setStatus("Saving…");
    const { data, error } = await sb.from("ad_entries").update({ [c.key]: val }).eq("id", r.id).select().single();
    cellTd.classList.remove("saving");
    if (error) {
      cellTd.classList.add("err");
      setStatus("Save failed: " + error.message, true);
      return;
    }
    Object.assign(r, data);
    if (NUMERIC.has(c.type)) el.value = r[c.key];
    setStatus("Saved ✓");
    if (c.sum) refreshTotals();
    if (c.key === "influencer_email") fillFilter();
  }

  function refreshTotals() {
    const rows = visibleRows();
    const totals = sums(rows);
    const cells = $("#sheet").tFoot.rows[0]?.cells;
    if (cells) COLS.forEach((c, i) => { if (c.sum) cells[i + 1].textContent = fmt(c, totals[c.key]); });
    renderCards(totals);
  }

  async function addRow() {
    const f = $("#filterInfluencer").value;
    const base = f ? state.rows.find((r) => r.influencer_email === f) : null;
    setStatus("Adding…");
    const { data, error } = await sb
      .from("ad_entries")
      .insert({ influencer_email: f || "", influencer_name: base?.influencer_name || "" })
      .select()
      .single();
    if (error) { setStatus("Add failed: " + error.message, true); return; }
    state.rows.unshift(data);
    setStatus("Row added ✓");
    render();
    $("#sheet").tBodies[0].querySelector(`tr[data-id="${data.id}"] .cell`)?.focus();
  }

  async function deleteRow(r) {
    if (!confirm(`Delete row "${r.campaign || r.influencer_email || r.id}"?`)) return;
    const { error } = await sb.from("ad_entries").delete().eq("id", r.id);
    if (error) { setStatus("Delete failed: " + error.message, true); return; }
    state.rows = state.rows.filter((x) => x.id !== r.id);
    setStatus("Deleted ✓");
    fillFilter();
    render();
  }

  // ---------- Helpers ----------
  function sums(rows) {
    const t = {};
    COLS.filter((c) => c.sum).forEach((c) => {
      t[c.key] = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
    });
    return t;
  }

  function fmt(c, v) {
    const n = Number(v) || 0;
    return c.type === "money" ? "₹" + fmtMoney.format(n) : fmtInt.format(n);
  }

  function renderCards(t) {
    const conv = t.clicks ? ((t.conversions / t.clicks) * 100).toFixed(1) + "%" : "–";
    const items = [
      ["Clicks", fmtInt.format(t.clicks)],
      ["Leads", fmtInt.format(t.leads)],
      ["Downloads", fmtInt.format(t.downloads)],
      ["Conversions", fmtInt.format(t.conversions)],
      ["Conv. rate", conv],
      ["Payments", fmtInt.format(t.payments)],
      ["Amount", "₹" + fmtMoney.format(t.amount)],
      ["Payout", "₹" + fmtMoney.format(t.payout)],
    ];
    $("#cards").replaceChildren(
      ...items.map(([k, v]) => {
        const d = document.createElement("div");
        d.className = "stat";
        const a = document.createElement("div"); a.className = "k"; a.textContent = k;
        const b = document.createElement("div"); b.className = "v"; b.textContent = v;
        d.append(a, b);
        return d;
      })
    );
  }

  function th(text, cls) { const e = document.createElement("th"); e.textContent = text; if (cls) e.className = cls; return e; }
  function td(text, cls) { const e = document.createElement("td"); e.textContent = text; if (cls) e.className = cls; return e; }

  function exportCsv() {
    const esc = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [COLS.map((c) => esc(c.label)).join(",")];
    visibleRows().forEach((r) => lines.push(COLS.map((c) => esc(r[c.key])).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ad-panel-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Toolbar ----------
  $("#filterInfluencer").addEventListener("change", render);
  let searchT;
  $("#search").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(render, 150); });
  $("#refreshBtn").addEventListener("click", loadRows);
  $("#csvBtn").addEventListener("click", exportCsv);
  $("#addRowBtn").addEventListener("click", addRow);
})();
