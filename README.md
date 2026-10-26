# Ad Panel

A sheet-style advertisement panel.
- **Owner (admin):** can edit every cell (clicks, leads, downloads, conversions, payments, ₹ amount, payout, status, notes).
- **Influencer:** after login, sees **only their own rows** and cannot edit anything.
- Security is enforced on the database (Supabase Row Level Security), so it holds even if someone tampers with the browser code.

## Setup (one time)

1. **Supabase:** create a **new project** (leave the old project alone).
   SQL Editor → paste `supabase/schema.sql` → replace `YOUR_EMAIL@gmail.com` with your own email → Run.
2. **Supabase → Authentication → Sign In / Providers:** turn **Allow new users to sign up** OFF.
3. **Supabase → Authentication → Users → Add user:** add yourself and every influencer (email + password, tick "Auto confirm").
4. **Supabase → Project Settings → API:** copy the `Project URL` and the `anon public` key.
5. **GitHub repo → Settings → Secrets and variables → Actions → New secret:**
   `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
6. **GitHub repo → Settings → Pages → Source: GitHub Actions.**
7. Merge this branch into `main`. It deploys automatically, and the link shows under Actions/Pages.

## Usage
- Owner: **+ Add row**, write the influencer's email in the row, then fill in the data. Each cell saves automatically when you leave it.
- Influencers only see rows whose `Influencer Email` matches their login email.
