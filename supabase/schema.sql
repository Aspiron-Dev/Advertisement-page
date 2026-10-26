-- =====================================================================
-- Advertisement Panel – Supabase schema (run in a NEW Supabase project)
-- SQL Editor > New query > paste all > Run
-- =====================================================================

-- 1) Admins (owner). Only these emails can add / edit / delete data.
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- No policies on admins => nobody can read/write it through the API.

-- >>> CHANGE THIS to your own login email, then run <<<
insert into public.admins (email) values ('YOUR_EMAIL@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) Data sheet
create table if not exists public.ad_entries (
  id               bigint generated always as identity primary key,
  influencer_email text    not null default '',
  influencer_name  text    not null default '',
  campaign         text    not null default '',
  link             text    not null default '',
  entry_date       date             default current_date,
  clicks           integer not null default 0,
  leads            integer not null default 0,
  downloads        integer not null default 0,
  conversions      integer not null default 0,
  payments         integer not null default 0,
  amount           numeric(14,2) not null default 0,
  payout           numeric(14,2) not null default 0,
  status           text    not null default 'Active',
  notes            text    not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ad_entries_email_idx on public.ad_entries (lower(influencer_email));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ad_entries_touch on public.ad_entries;
create trigger ad_entries_touch before update on public.ad_entries
for each row execute function public.touch_updated_at();

-- 3) Row Level Security: admin = full access, influencer = read own rows only
alter table public.ad_entries enable row level security;
revoke all on public.ad_entries from anon;

drop policy if exists "read own or admin" on public.ad_entries;
create policy "read own or admin" on public.ad_entries
  for select to authenticated
  using (
    public.is_admin()
    or lower(influencer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "admin insert" on public.ad_entries;
create policy "admin insert" on public.ad_entries
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin update" on public.ad_entries;
create policy "admin update" on public.ad_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin delete" on public.ad_entries;
create policy "admin delete" on public.ad_entries
  for delete to authenticated using (public.is_admin());

-- 4) Live updates for influencers (optional, safe – RLS still applies)
do $$
begin
  alter publication supabase_realtime add table public.ad_entries;
exception when duplicate_object then null;
end $$;
