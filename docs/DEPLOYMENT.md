# DEPLOYMENT.md

How to take a LUMA deployment to production, for any organization. `npm run setup` does
most of the mechanical work (env files, schema, first admin); this is the full picture and
the checklist around it.

Placeholders: `<app-domain>` is where LUMA is served (e.g. `luma.example.org`),
`<mail-domain>` is the domain emails are sent from, `<slug>` is an org's URL slug.
Your deployment's real values, runbooks and owner to-dos belong in your untracked
`instance/` folder — see [INSTANCE.md](INSTANCE.md).

---

## Stack snapshot

| Layer              | Default                   | Alternatives                                                                               |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| Frontend + SSR     | SvelteKit 2 / Svelte 5    | —                                                                                          |
| Hosting            | Vercel (`adapter-vercel`) | Node server or Docker (`adapter-node`, `ADAPTER=node`)                                     |
| Database + Auth    | Supabase Cloud            | Self-hosted Supabase; local Supabase CLI for development                                   |
| Email              | Resend                    | Server-side only, via Supabase Edge Functions; API key never reaches the browser           |
| Analytics + errors | PostHog (optional)        | Off when `PUBLIC_POSTHOG_KEY` is unset. Wiring + event guide: [ANALYTICS.md](ANALYTICS.md) |
| Calendar           | `.ics` attachments        | Google Calendar OAuth deferred                                                             |
| Storage            | Supabase Storage          | `org-assets` bucket (migration 00012)                                                      |

LUMA needs a Supabase API (PostgREST + GoTrue + Storage), not just Postgres — every data
call goes through `@supabase/supabase-js`. "Self-hosting the database" therefore means
self-hosting Supabase: <https://supabase.com/docs/guides/self-hosting/docker>.

---

## Environments

- **Production** — `<app-domain>`, branch `main`, production Supabase project, verified
  Resend domain, PostHog production project.
- **Preview** — every PR on Vercel gets a `*.vercel.app` URL. Point previews at a separate
  Supabase project if you can; sharing production means previews can dirty real data.
- **Local dev** — `npm run dev` with `.env` + `.env.local`. Never point local dev at
  production data you can't afford to change.

---

## 1. Accounts (once)

1. **Supabase** — create a project (or stand up your own stack). Note the URL, anon key
   and service role key.
2. **Resend** — account, API key, and `<mail-domain>` verified via the SPF/DKIM records it
   shows you. Until the domain shows "Verified", delivery fails or lands in spam.
3. **PostHog** (optional) — project, `phc_` ingest key, host.
4. **Hosting** — a Vercel project connected to the repo, or a server/container host.

## 2. Configure the instance

```bash
npm run setup
```

It asks for the database/auth backend, keys, hosting target, public URL and analytics,
writes `.env` and `.env.local`, applies migrations through the Supabase CLI, optionally
sets the Resend secrets and deploys the email functions, and creates the first platform
admin. It ends by opening `/admin/?tab=setup`, which shows what is configured and what
still needs attention. Re-run it any time — every prompt defaults to the current value.

Manual equivalent:

```bash
cp .env.example .env && cp .env.local.example .env.local   # then fill them in
supabase link --project-ref <ref> && supabase db push      # schema
supabase secrets set RESEND_API_KEY=re_... LUMA_FROM_EMAIL="Org <noreply@<mail-domain>>"
supabase functions deploy notify-interviews send-reminders
```

and, after signing up once at `/auth`, in the SQL editor:

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

## 3. Supabase Auth URLs

Authentication → URL Configuration:

- Site URL: `https://<app-domain>`
- Redirect URLs: `https://<app-domain>/auth/confirm`, `https://<app-domain>/auth/reset`,
  `https://<app-domain>/invite/*`

Supabase's built-in mailer is heavily rate limited; configure custom SMTP (Resend works)
under Authentication → SMTP before real recruiting volume.

## 4. Deploy

- **Vercel** — copy the variables from `.env` and `.env.local` into Project → Settings →
  Environment Variables (`SUPABASE_SERVICE_ROLE_KEY` server-only). Pushes to `main` deploy
  production; PRs get previews. Attach `<app-domain>` under Settings → Domains.
- **Node** — `ADAPTER=node npm run build && node build` (port `3000`, `PORT` to change),
  behind a reverse proxy that terminates TLS.
- **Docker** — `docker compose --env-file .env --env-file .env.local up -d --build`.
  `PUBLIC_*` values are passed as build args because SvelteKit inlines them at build time.

## 5. Configure organizations (in the app)

From `/admin` (platform admins) or `/private/<slug>/settings` (org admins):

1. **Create the org** — `/register`, or Admin → Organizations.
2. **Teams** — the teams applicants choose between (none = single-team org).
3. **Recruiting rules** — review thresholds, blinded review, scheduling defaults, email
   toggles, applicant email domain.
4. **Interview forms** — question bank and scored prompts for individual/group interviews.
5. **Members & invite links**, branding and logo.
6. **Job postings** — Settings → Manage Postings: the application form builder, team
   selection rules, availability windows.

## 6. Smoke test

- `https://<app-domain>` loads; `/apply/<slug>/<job_id>` renders the form.
- Submit a test application end to end: confirmation email arrives (not in spam), the
  application appears in `/private/<slug>/review`, PostHog records `application_submitted`.
- Delete or mark the test row afterwards.

---

## Rollback

1. **Code:** Vercel → Deployments → a previous green deploy → "Promote to Production"
   (or redeploy the previous image/tag when self-hosting).
2. **Data:** every migration is additive, so a code rollback is normally enough. Confirm
   point-in-time recovery is enabled on your Supabase plan.
3. **Email mistakes:** Resend has no recall. Find recipients in Resend → Logs (or the
   `email_log` table) and send a correction. Bounces arrive via `/api/email-webhook`.
4. **A recruiting rule misfiring:** fix it in the org's Settings → Recruiting Rules, or
   edit the job's question `reject_if` rules in the form builder.

## Monitoring (first week)

- **PostHog** — apply funnel; a >30% drop between started and submitted means a form bug.
- **Resend / `email_log`** — failed sends carry the error on `status = 'failed'` rows.
- **Hosting logs** — any 500 is a same-day fix.

---

## Environment variable reference

`.env` (instance settings, non-secret) and `.env.local` (keys). Templates:
`.env.example`, `.env.local.example`. Neither real file is committed.

| Variable                    | File         | Purpose                                                               |
| --------------------------- | ------------ | --------------------------------------------------------------------- |
| `LUMA_DB_PROVIDER`          | `.env`       | `supabase-cloud` / `supabase-self-hosted` / `supabase-local`          |
| `LUMA_AUTH_PROVIDER`        | `.env`       | `supabase` (only backend today)                                       |
| `ADAPTER`                   | `.env`       | `vercel` (default) or `node`                                          |
| `PUBLIC_APP_URL`            | `.env`       | Public URL; shown in Setup and used for auth redirect URLs            |
| `PUBLIC_POSTHOG_HOST`       | `.env`       | PostHog ingest host                                                   |
| `PUBLIC_SUPABASE_URL`       | `.env.local` | Supabase API URL                                                      |
| `PUBLIC_SUPABASE_ANON_KEY`  | `.env.local` | Supabase anon key                                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Optional, server-only: email webhook, first-admin bootstrap in setup  |
| `PUBLIC_POSTHOG_KEY`        | `.env.local` | Optional PostHog `phc_` ingest key                                    |
| `RESEND_API_KEY`            | Supabase     | Edge Function secret (`supabase secrets set`)                         |
| `LUMA_FROM_EMAIL`           | Supabase     | Edge Function secret, e.g. `"Org Recruiting <noreply@<mail-domain>>"` |

## DNS

| Record         | Type      | Value                                                    | For                  |
| -------------- | --------- | -------------------------------------------------------- | -------------------- |
| `<app-domain>` | CNAME / A | What Vercel (or your host) shows                         | The app              |
| (varies)       | TXT/CNAME | SPF/DKIM records from Resend → Domains                   | Email deliverability |
| `_dmarc`       | TXT       | `v=DMARC1; p=quarantine; rua=mailto:dmarc@<mail-domain>` | Recommended          |
