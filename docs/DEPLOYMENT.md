# DEPLOYMENT.md

Concrete, step-by-step deployment plan for LUMA V1 → `luma.archimedesvt.org` on Vercel + Supabase + Resend + PostHog.

Read top-to-bottom. Each step says **who** runs it (HUMAN = Owen, CLAUDE = me) and **how to verify** it.

---

## Stack snapshot

| Layer | Tool | Notes |
|---|---|---|
| Frontend + SSR | SvelteKit 2 / Svelte 5 | `@sveltejs/adapter-vercel` |
| Hosting | Vercel | Auto-deploys on push to `main` |
| Database + Auth | Supabase | Postgres + RLS + Auth (email + magic link) |
| Email | Resend | Transactional sends via API |
| Analytics + errors | PostHog | Single vendor, replaces Sentry |
| Calendar | `.ics` attachments | Google Calendar OAuth deferred |
| Storage | Supabase Storage | `org_assets` bucket exists (migration 00012) |

---

## Environments

- **Production** — `luma.archimedesvt.org`, branch `main`, real Supabase project, real Resend domain, PostHog production project.
- **Preview** — every PR / non-main branch, Vercel auto-generated `*.vercel.app` URL, separate Supabase project (or same prod with read-only intent — preferable to spin up a preview Supabase if you can afford it).
- **Local dev** — `npm run dev`, `.env.local`, points at preview Supabase by default. Never at prod.

For V1 with timeline pressure: it's acceptable to run with **one Supabase project** for prod + preview + dev, as long as you understand previews can dirty the data. Recommended once V1 is stable: split.

---

## Phase A — One-time setup (HUMAN, ~1 hour)

Everything in `HUMAN-TODO.md` → "Before any code ships". The short version:

1. **Resend** — account, API key, sending domain DNS verified.
2. **PostHog** — account, project, API key + host URL.
3. **Supabase** — confirm prod project URL + anon key + service role key.
4. **Vercel** — project exists, repo connected, env vars set, domain attached, SSL cert issued.

Verify Phase A:
```bash
# DNS
dig luma.archimedesvt.org +short        # → Vercel IP or CNAME
dig _resend._domainkey.archimedesvt.org TXT +short   # → DKIM record

# Reachability
curl -I https://luma.archimedesvt.org   # → 200 or 404 (404 is fine — means the domain works, just no content yet)
```

---

## Phase B — Schema apply (CLAUDE, ~15 min)

1. Apply all existing migrations (`00001` → `00013`) to the prod Supabase project if not already applied. Use Supabase CLI:
   ```bash
   supabase link --project-ref <prod-ref>
   supabase db push
   ```
2. Apply V1 migrations (`00014` → `00020`) as they land in PRs.
3. Seed the Archimedes org + four teams (Infinitum, Astra, Terra, Juvo) via a one-off SQL script or admin UI.

Verify:
```sql
-- Run in Supabase SQL editor
select * from organizations where slug = 'archimedes';
select * from teams where org_id = (select id from organizations where slug = 'archimedes');
-- Should return 1 org + 4 teams
```

---

## Phase C — Code deploy (CLAUDE → auto via Vercel)

1. Build each phase from `TODO.md` on a feature branch (`v1/phase-1-schema`, `v1/phase-2-form-builder`, etc.).
2. Open PR → Vercel auto-deploys preview → smoke test on preview URL → merge to `main`.
3. Merge to `main` → Vercel auto-deploys production within ~2 min.
4. **Never** push directly to `main` for V1 phases — always PR for the preview deploy.

Verify each deploy:
```bash
# Vercel CLI (optional)
vercel ls                         # see recent deploys
vercel logs <deployment-url>      # tail logs for errors
```
Or just check Vercel dashboard → Deployments tab.

---

## Phase D — Cutover (joint, day-of go-live)

Order matters. Don't reorder.

1. **HUMAN** — confirm DNS, SSL, Resend domain, PostHog all green.
2. **HUMAN** — confirm `luma.archimedesvt.org` is the production domain on the Vercel project (not the `.vercel.app` URL).
3. **CLAUDE** — merge final V1 PR to `main`. Wait for Vercel deploy to succeed.
4. **CLAUDE** — run smoke test on production:
   - Visit `https://luma.archimedesvt.org` — landing loads.
   - Visit `https://luma.archimedesvt.org/apply/archimedes/<job_id>` — application form renders.
   - Sign in to `/private/archimedes/dashboard` as Owen — dashboard loads.
5. **HUMAN** — submit a real test application end-to-end. Confirm:
   - Confirmation email arrives.
   - Application visible in `/review`.
   - PostHog "application_submitted" event fires.
6. **HUMAN** — delete the test row (or mark as test) via Supabase SQL.
7. **HUMAN** — announce go-live to advisors and eboard with the apply URL.

---

## Phase E — Rollback plan

If something is on fire after cutover:

1. **Code rollback:** Vercel dashboard → Deployments → previous green deploy → "Promote to Production". Takes ~30 seconds.
2. **Data rollback:** Supabase doesn't have one-click rollback. Mitigations:
   - Daily PITR snapshots are on by default for paid plans — confirm yours is on.
   - For schema migrations, every V1 migration in `TODO.md` is **additive** (no drops, no renames of populated columns) → safe to leave forward, code rollback is sufficient.
3. **Email blast mistake:** Resend → Logs → identify recipients → manually email correction. There is no recall.
4. **Auto-reject mis-firing:** flip the org setting `auto_reject_enabled = false` in Supabase SQL editor:
   ```sql
   update organizations
   set settings = settings || '{"auto_reject_enabled": false}'::jsonb
   where slug = 'archimedes';
   ```

---

## Phase F — Post-launch monitoring (week 1)

- **PostHog** — daily check of the apply funnel. Drop-off between "started" and "submitted" > 30% means a form bug.
- **Resend** — daily check of bounce rate. > 5% bounce means bad email domain reputation.
- **Vercel** — function execution logs. Any 500s → fix same-day.
- **Supabase** — query the `email_log` table for failed sends. Migration 00010 set this up.

---

## Env var reference (final)

Set in Vercel for Production. Mirror in `.env.local` (with non-prod values where applicable) for local dev. Never commit `.env.local`.

| Variable | Where to get it | Used by |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Client + server |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon public | Client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role (secret) | Server only |
| `RESEND_API_KEY` | Resend → API Keys | Server only |
| `RESEND_FROM_EMAIL` | You decide (e.g., `recruitment@archimedesvt.org`) | Server only |
| `PUBLIC_POSTHOG_KEY` | PostHog → Project Settings → Project API Key | Client |
| `PUBLIC_POSTHOG_HOST` | PostHog → Project Settings → API Host (usually `https://us.i.posthog.com`) | Client |
| `PUBLIC_APP_URL` | `https://luma.archimedesvt.org` | Client + server (for magic links, ics URLs) |

---

## Domain & DNS final layout

At your DNS provider for `archimedesvt.org`:

| Record | Type | Value | Provided by |
|---|---|---|---|
| `luma` | CNAME | `cname.vercel-dns.com` (or A record Vercel shows) | Vercel |
| `@` or `mail` | TXT | `v=spf1 include:_spf.resend.com ~all` | Resend |
| `resend._domainkey` | TXT | (long DKIM key) | Resend |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; rua=mailto:dmarc@archimedesvt.org` | (optional but recommended) |

---

## Done-criteria for "V1 is live"

All true:
- `https://luma.archimedesvt.org` serves the landing page over HTTPS.
- A real applicant can complete the full Archimedes application from a fresh browser without errors.
- Auto-reject fires correctly for at least one tested rule.
- Confirmation email arrives in inbox (not spam) from the configured sending domain.
- An admin (Owen) can log in, see the applicant in the review queue, vote, and watch them advance to scheduling.
- An interviewer can submit availability and the auto-scheduler produces a valid R1 schedule.
- PostHog shows the `application_submitted` event for the test applicant.
