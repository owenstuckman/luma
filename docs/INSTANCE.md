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

Plus a fifth, optional place for everything that isn't configuration: the untracked
`instance/` folder (below).

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

## The `instance/` folder

`/instance/` is gitignored. Use it for material that belongs to one deployment or one
organization and must not be published:

```
instance/
  <org-or-deployment>/
    data/        exports: applicant CSVs, interview invites, rejections
    docs/        runbooks, owner to-dos, room bookings, auth hand-offs, internal process docs
    *.sql        one-off seeds / settings for that org (run in the SQL editor)
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
- Migrations are forward-only, so four historical ones still carry the first tenant's seed
  data: `00015` and `00024` insert only `WHERE slug = 'archimedes'`, and `00028` / `00031`
  update one job posting by id. On a fresh database all four touch nothing, because
  migrations run before any org exists. New migrations must not seed org-specific data.
  Put that in `instance/<org>/*.sql`.
