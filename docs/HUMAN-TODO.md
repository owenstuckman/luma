# HUMAN-TODO.md

Things only Owen can do — accounts, DNS, secrets, decisions. Sorted by when they block engineering work. Don't start Phase 1 of `TODO.md` until everything under "Before any code ships" is done.

---

## Before any code ships (blockers)

### Accounts & API keys

- [ ] **Resend** — confirm you have an active account. Grab the API key. Put in Vercel env as `RESEND_API_KEY`.
- [ ] **Resend sending domain** — go to Resend → Domains → Add Domain → enter your Archimedes domain (e.g., `archimedesvt.org` or a subdomain like `mail.archimedesvt.org`). Resend gives you ~3 DNS records (SPF, DKIM, MX/return-path). Add them to your DNS provider. Wait for verification (usually <30 min, can take a few hours).
- [ ] **Decide sending address** — `recruitment@archimedesvt.org`? `noreply@archimedesvt.org`? Tell me which to use as default `FROM`.
- [X] **PostHog** — create account at posthog.com (free tier is fine). Create a project. Grab the **Project API Key** and the **Host URL** (usually `https://us.i.posthog.com`). Put in Vercel env as `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`.
- [x] **Supabase** — confirm `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in current `.env.local` point to the *production* project you actually want V1 to run on. If they point to a dev project, send me the prod values.
- [x] **Supabase service role key** — `SUPABASE_SERVICE_ROLE_KEY`. Needed for server-side admin actions (auto-reject writes, decision emails). Get from Supabase dashboard → Settings → API → `service_role` (secret). Put in Vercel env, NOT in `.env.local` if `.env.local` is committed (it shouldn't be).

### Vercel project setup

- [X] Confirm the Vercel project for `luma.archimedesvt.org` exists and is connected to this GitHub repo. If not, create it; import the repo; framework = SvelteKit; build command auto-detected.
- [X] Add the env vars above to Vercel → Settings → Environment Variables. Set them for **Production**, **Preview**, and **Development** (use placeholder values for preview/dev if you want to keep prod isolated).
- [X] Confirm the domain `luma.archimedesvt.org` is attached to the Vercel project under Settings → Domains. If not, add it (Vercel will show you the DNS CNAME / A record to add).
- [X] Add the DNS record Vercel asks for at your DNS provider (probably the same place as the Resend records).
- [X] Wait for SSL cert provisioning (Vercel does this automatically, takes <10 min after DNS resolves).

### Decisions I need from you

- [ ] **Sending email address** (see Resend item above).
- [ ] **Org name displayed in emails** — "Archimedes Society"? "Archimedes @ VT"?
- [ ] **Whether to wipe the current Supabase prod data** before V1 launch, or migrate it forward. (If you have real applicants in there, migration; if it's test data, wipe is easier.)
- [ ] **Who else gets admin access** to the production app on day 1? List emails — I'll seed them as admins.

---

## During build (not blocking, but needed before specific phases)

### Before Phase 2 (Form Builder)

- [ ] Send me the **actual question list** you want for the V1 Archimedes cycle: shared questions + per-team questions. Even a rough Google Doc works — I'll convert it to the JSON schema. If you want me to draft it from the V1 background doc + last year's CSVs, say so.
- [ ] Tell me your **auto-reject rules** in plain English (e.g., "if 'Are you 18+' = No → reject"). I'll wire them into the question schema.

### Before Phase 3 (Review)

- [ ] List of **reviewers** for the V1 cycle (names + emails). I'll create their accounts and assign them to the reviewer pool.
- [ ] Confirm **threshold defaults**: I'm planning 3 approves to advance, 2 rejects to deny. Override if you want different.

### Before Phase 4 (Scheduling)

- [ ] Tell me which **scheduling algorithm** is the default. I'm going with `greedy-first-available` unless you say otherwise.
- [ ] Will recruiters submit availability via the existing `/availability` page, or do you want to pre-import from a spreadsheet? If spreadsheet, send the format.

### Before Phase 5 (Decisions)

- [ ] Write the **hire / reject / waitlist email templates** (or give me last year's text and I'll adapt). These are user-facing and important — better to write them yourselves.

---

## Pre-launch (day-of)

- [ ] **DNS final check** — `dig luma.archimedesvt.org` resolves to Vercel, `dig _resend._domainkey.<your-domain>` returns DKIM TXT record.
- [ ] Send yourself a test email through the app's "submit application" flow — confirm it arrives, looks right, no spam folder.
- [ ] Add a real applicant test through the full flow on production. Then delete the test row.
- [ ] Announce go-live to advisors / eboard.

---

## Post-launch (week 1)

- [ ] Watch PostHog daily for the first week — drop-offs in the apply funnel are the first thing to fix.
- [ ] Check Resend dashboard for bounces / spam complaints.
- [ ] Be ready to manually un-reject if auto-reject rules fire wrong.
