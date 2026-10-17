# INSTANCE.md — configuring a deployment

LUMA is multi-tenant and organization-agnostic: nothing in the repository is specific to
any one org. Everything that makes a deployment _yours_ lives in one of four layers, and
none of them is committed.

| Layer                 | Where                                            | Set by                                       | Examples                                                                                                        |
| --------------------- | ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Instance**          | `.env`, `.env.local`                             | `npm run setup` (terminal)                   | Supabase URL + keys, DB/auth provider, hosting adapter, public URL, PostHog                                     |
| **Platform**          | `platform_settings` table                        | `/admin` → Platform                          | Platform name, default colors, maintenance mode                                                                 |
| **Organization**      | `organizations` row + `.settings` JSONB, `teams` | Org Settings (org admins) or `/admin` → Orgs | Branding, teams, review thresholds, scheduling defaults, email toggles, applicant email domain, interview forms |
| **Recruitment cycle** | `job_posting.questions`                          | Settings → Manage Postings (form builder)    | Questions, per-team questions, auto-reject rules, team selection limits, availability windows                   |

The organization and recruitment-cycle layers can also be kept as **tenant files** and
imported with one command (below). Images (logos, team photos, job covers, question images)
are uploaded per tenant. Everything that isn't configuration goes in the untracked
`instance/` folder.

## First run

```bash
npm install
npm run setup
```

`setup` walks through, in order:

0. **Prerequisites** — Node 22+, dependencies.
1. **Database & auth** — Supabase Cloud (default), self-hosted Supabase, or local Supabase
   via the CLI (it can run `supabase init` / `supabase start` and read the keys itself).
   Auth is Supabase Auth; SSO providers are enabled inside it, not instead of it. The
   connection is checked before anything is saved.
2. **Hosting** — Vercel (default), Node server, or Docker; and the public URL.
3. **Analytics** — optional PostHog key.
4. **Writes** `.env` and `.env.local`, replacing only the keys it manages (previous files
   are kept as `*.bak`; both are gitignored).
5. **Schema** — `supabase db push` (cloud or self-hosted), or nothing for local, where
   `supabase start` already applied the migrations.
6. **Email** — optional Resend secrets + Edge Function deploy.
7. **First platform admin** — with a service role key it creates the account if needed and
   grants admin; without one it prints the SQL.
8. **Auth redirect URLs** to paste into Supabase.

Then it starts `npm run dev` on **`/admin/?tab=setup`**: a status board for the
deployment (database, schema freshness, auth, hosting, keys present, analytics, admins,
orgs) with links to every remaining setting. Re-run `npm run setup` any time; Enter keeps
each current value. Answers can also be piped in for automation
(`printf '1\n1\n…' | npm run setup -- --no-start`).

## Organization configuration

Everything an org needs is editable in the UI — no SQL:

- **Teams** — what applicants pick between. None = single-team org. Retire, never delete:
  applications reference them. Slugs are fixed once created (question rules use them).
- **Recruiting rules** — `review_thresholds`, `scheduling`, `email`, `application.email_domain`
  in `organizations.settings`. Read through `readOrgSettings()`; written one section at a
  time by `saveOrgSettingsSection()` so unrelated keys survive.
- **Interview forms** — `organizations.settings.interview_forms`: the two read-aloud
  questions, the success/failure question banks, and the scored prompts for individual and
  group interviews. `{org}` is replaced by the org's name. Prompt keys are what stored
  scores reference, so the editor never changes an existing key. Read through
  `resolveInterviewForms(settings, orgName)`; an org that never edits them gets
  `DEFAULT_INTERVIEW_FORMS`.

- **Images** — the org logo, a photo per team (shown on the application's team picker), a
  cover image per job posting (top of the application), and images on `checkbox_image`
  questions. All upload from the UI into the public `org-assets` bucket under
  `orgs/<org_id>/…` (logos: `logos/<org_id>/…`). Since migration `00040` only that org's
  admins, or a platform admin, can write there. A pasted URL works too.

## Tenant config files

An organization's whole configuration — profile, settings, teams, job postings with their
forms, and images — can live in files and move between databases:

```bash
npm run tenant -- export <slug>                     # → instance/<slug>/tenant/
npm run tenant -- import instance/<slug>/tenant --owner you@example.org
npm run tenant -- import instance/<slug>/tenant --dry-run   # show what would change
```

```
instance/<slug>/tenant/
  tenant.json        { "format": "luma-tenant", "version": 1, "organization", "teams", "jobs" }
  assets/…           images referenced from tenant.json by relative path
  applicants.json    only with --with-applicants (personal data — keep private)
```

- **Import is an upsert.** The org matches by slug (`--owner` is needed only to create
  it), teams by slug, job postings by name. Settings are merged section by section, so
  sections missing from the file are kept. Re-running is safe.
- **Images** given as relative paths are uploaded to the org's storage folder and replaced
  by their URL. Absolute URLs are stored as-is.
- **Export** downloads images held in this project's storage into `assets/`, so the folder
  can be imported into another Supabase project (`--keep-urls` to skip).
- A complete starting point with two teams, team-scoped and per-team questions, an
  auto-reject rule and an availability step lives in
  [`docs/examples/tenant/tenant.json`](examples/tenant/tenant.json).

Both commands use `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your env files.
The service role bypasses RLS, so run them only from a trusted machine.

### Importing existing applicants

```bash
npm run tenant -- import-applicants <slug> applicants.csv --job "Fall Recruitment" --dry-run
```

CSV or JSON. Recognised columns: `name` (or `first_name` + `last_name`), `email`, and
optionally `team` (slug or name), `status` (`pending` / `interview` / `accepted` /
`denied`), `created_at`, `team_rank`, `job` (per-row override of `--job`). **Every other
column is stored as an answer** on the application, keyed by its header, so name the
columns after your form's question ids to have them render as answers. One row per
application; give each team a row, as the app does. Applications already present
(same job, email and team) are skipped, so an import can be re-run. Interviews and
evaluations are not imported.

## The `instance/` folder

`/instance/` is gitignored. Use it for material that belongs to one deployment or one
organization and must not be published:

```
instance/
  <org-or-deployment>/
    tenant/      tenant.json + assets/ (see above)
    data/        exports: applicant CSVs, interview invites, rejections
    docs/        runbooks, owner to-dos, room bookings, auth hand-offs, internal process docs
    *.sql        one-off SQL for that org (run in the SQL editor)
```

Back it up somewhere private (a shared drive, a private repo) — it is not in git.

Also untracked and per-machine: `.mcp.json` (template: `.mcp.example.json`, holds your
Supabase project ref) and the Supabase CLI's local state (`supabase/config.toml`,
`supabase/.temp/`).

## Rules for contributors

- Never commit an org's name, domain, people, data or screenshots of real data. Example
  values use `example.org` / `example.edu`.
- A new per-org knob goes in `OrgSettings` (with a default that preserves current behaviour)
  and gets an editor in `OrgSettingsPanel` — not a constant, not SQL-only.
- A new instance-level knob goes in `.env.example` / `.env.local.example`, `setup.mjs`, and
  `getInstanceStatus()` so the Setup tab can report it. Secrets are reported only as
  present/absent.
- Migrations hold schema only, never tenant data. Teams, forms, settings and images for a
  particular org belong in a tenant file. (The first tenant's seed data was removed from
  `00015`, `00024`, `00028` and `00031`; those inserts and updates were keyed to that org's
  slug and job id, so they never did anything on any other database. `00031` is kept as an
  empty migration so the version history stays continuous.)
- Nothing org-specific in `static/` either — images are uploaded per tenant.
