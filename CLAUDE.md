# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For V1 rebuild work, read `docs/CLAUDE.md` first** — it carries the V1-specific
> decisions, scope, and conventions, and overrides this file where they disagree.
> Feature status lives in `docs/FEATURES.md`; the build plan lives in `docs/TODO.md`.
> `docs/README.md` indexes everything under `docs/`.

## Project Overview

LUMA is an open-source Applicant Tracking System (ATS) built with SvelteKit. It handles applicant submissions, recruiter review, and interview scheduling. Originally built for Virginia Tech's Archimedes Society (processed 400+ applicants, scheduled 250+ interviews in Fall 2025).

## Commands

| Command           | Purpose                                 |
| ----------------- | --------------------------------------- |
| `npm run dev`     | Start dev server                        |
| `npm run build`   | Production build (Vercel adapter)       |
| `npm run preview` | Preview production build                |
| `npm run check`   | Type-check with svelte-check            |
| `npm run lint`    | Prettier + ESLint check                 |
| `npm run format`  | Auto-format with Prettier               |
| `npm test`        | Run Playwright E2E tests (builds first) |
| `npm run setup`   | Interactive instance setup              |
| `npm run tenant`  | Export/import org config + applicants   |

**Node 22+ is required** (`engines.node: ">=22"`). `@supabase/realtime-js` needs a native
global `WebSocket`, which arrived in Node 22 and which it version-gates on; under Node 20
`createServerClient` throws in `src/hooks.server.ts` and every SSR route 500s. PowerShell
and WSL have separate Node installs — check `node -v` in both.

If the repo is used from both PowerShell and WSL, run `npm run deps:cross` after any
`npm install` — see the README section "Working from both Windows and WSL". It places a
correctly-versioned native binary next to _every_ copy of rollup/esbuild/lightningcss in
the tree, including nested ones, since each copy rejects a version-mismatched binary.

## Environment Variables

Two untracked files, both written by `npm run setup` (templates: `.env.example`,
`.env.local.example`). Vite loads `.env` then `.env.local` on top.

`.env` — instance settings, non-secret:

- `LUMA_DB_PROVIDER` (`supabase-cloud` | `supabase-self-hosted` | `supabase-local`),
  `LUMA_AUTH_PROVIDER` (`supabase`), `ADAPTER` (`vercel` | `node`, read by
  `svelte.config.js`), `PUBLIC_APP_URL`, `PUBLIC_POSTHOG_HOST`

`.env.local` — keys:

- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — required
- `SUPABASE_SERVICE_ROLE_KEY` — optional, server-only (email webhook; setup's admin
  bootstrap). Read via `serviceRoleKey()` in `src/lib/server/instance.ts`, which also
  accepts the older `PRIVATE_SUPABASE_SERVICE_KEY`
- `PUBLIC_POSTHOG_KEY` — optional; unset means analytics silently no-ops. See
  `docs/ANALYTICS.md`

Note that a variable name wrapped in backticks or quotes is not exported by Vite at all —
and because analytics fails soft, that mistake looks exactly like "no events yet".

**Nothing org-specific is committed.** An org's name, domain, data, screenshots and
runbooks go in the gitignored `instance/` folder; per-org behaviour goes in org settings.
See `docs/INSTANCE.md`.

## Repo layout

Root stays deliberately thin, but most config files there **cannot** move — the tools look
for them in the project root and moving them costs a flag on every invocation:

| File(s)                                             | Why it's at the root                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `svelte.config.js`, `vite.config.ts`                | SvelteKit and Vite resolve these from the project root only                                                                                            |
| `tsconfig.json`                                     | Extends `.svelte-kit/tsconfig.json`; `svelte-check` points at it                                                                                       |
| `eslint.config.js`                                  | Flat-config discovery walks up to the root                                                                                                             |
| `package.json`, `package-lock.json`, `.npmrc`       | npm                                                                                                                                                    |
| `.prettierrc`, `.prettierignore`                    | Prettier discovery; the ignore file must be a real file                                                                                                |
| `.gitattributes`, `.gitignore`                      | git                                                                                                                                                    |
| `.nvmrc`                                            | Node version pin (see the Node requirement above)                                                                                                      |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Conventional root placement. `npm run setup` → Docker targets them; `PUBLIC_*` values go in as build args because SvelteKit inlines them at build time |
| `.env.example`, `.env.local.example`                | Templates for the two untracked env files `npm run setup` writes                                                                                       |
| `.mcp.example.json`                                 | Template for the untracked `.mcp.json` (holds a Supabase project ref)                                                                                  |

Everything that _can_ live elsewhere already does: docs in `docs/`, E2E specs in `e2e/`,
one-off scripts in `scripts/`, SQL in `supabase/migrations/`, and deployment-specific
material in the untracked `instance/`.

## Architecture

**Stack**: SvelteKit 2 + Svelte 5, TypeScript (strict), Supabase (auth + DB), Vite 6, deployed to Vercel.

The app is **multi-tenant**: every org gets a slug, and both the public and private
route trees are scoped by it.

### Routing

- `/` — Landing page (applicant/recruiter/admin entry points)
- `/register` — Org signup
- `/apply/[slug]` and `/apply/[slug]/[job_id]` — Public application form, rendered
  dynamically from the job's question schema. (The old `/applicant/1_verification`…
  `7_submit` step routes are gone.)
- `/auth` — Recruiter login/signup (Supabase Auth), plus `/auth/confirm`, `/auth/reset`.
  Both `login` and `signup` honour a `?redirect=` param, and signup carries it through the
  confirmation email so an invited user isn't stranded after confirming.
- `/invite/[token]` — Public invite landing page. Renders logged-out via the `anon`-granted
  `get_invite_details()`; the accept action joins the org and redirects to its dashboard.
- `/private/[slug]/*` — Auth-protected, org-scoped recruiter dashboard:
  `dashboard`, `review`, `review/candidate`, `candidates`, `schedule/my`,
  `schedule/full`, `evaluate`, `availability`, `settings`, `settings/jobs`,
  `settings/scheduling`
- `/admin` — Platform admin view (cross-org), gated on `is_platform_admin()`. The
  **Orgs** tab has a per-org **Settings** drawer; **Admins** manages platform admins;
  **Setup** (`/admin/?tab=setup`, where `npm run setup` lands) shows instance status
- `/api/health`, `/api/email-webhook` — Server endpoints

Auth guard in `src/hooks.server.ts` redirects unauthenticated users from `/private/*` to `/auth` and authenticated users from `/auth` to `/private`.

### State Management

- **Applicant flow**: Form state persists in `localStorage` (one key per question); on
  submit it is collected into a `recruitInfo` JSON object and sent via `sendApplication()`.
  V1 adds DB-backed drafts (`application_drafts`) for save-and-resume — see `docs/TODO.md`.
- **Recruiter side**: Data fetched directly from Supabase. Two small stores exist
  (`src/lib/stores/jobFilter.ts` for the selected job, `mobileMenu.ts` for the drawer);
  everything else is component-local.

### Supabase

- Client-side utilities in `src/lib/utils/supabase.ts` (uses `createBrowserClient` from `@supabase/ssr`)
- Aggregation across pipeline tables lives in `src/lib/utils/candidates.ts` — the roster
  and candidate timeline both read from there rather than joining inline
- Pure logic modules take no DB or DOM dependency so they can run on either side:
  `src/lib/utils/formSchema.ts` (question `team_scope` visibility, `per_team` expansion,
  `reject_if` auto-reject evaluation, and `splitSubmissionByTeam()` — the per-team
  application split) and `src/lib/utils/review.ts` (vote tallying, thresholds, weighted scoring,
  blinded redaction). Keep them side-effect free — the plan is to reuse them server-side.
- Server-side client created in `src/hooks.server.ts` (uses `createServerClient` with cookie auth)
- In server files, access Supabase via `event.locals.supabase`
- New DB access belongs in `src/lib/utils/*.ts`, not inline `supabase.from()` in components
- Tables: `organizations`, `org_members`, `job_posting`, `applicants`, `interviews`,
  `interviewers`, `interviewer_availability`, `scheduling_config`, `email_log`,
  `platform_admins`, `platform_settings`, `platform_activity_log`, plus the V1 additions
  `teams`, `application_drafts`, `job_reviewers`, `decisions`, `org_invites`,
  `org_invite_redemptions`
- Migrations are forward-only and additive (`supabase/migrations/00001`–`00040`), and hold
  schema only — tenant data (teams, forms, settings) goes in tenant files
  (`npm run tenant`, `docs/INSTANCE.md`)
- RLS helpers: `is_org_member()`, `has_org_role()`, `has_app_role()`
- Org settings render through the shared `OrgSettingsPanel.svelte` on both the org page and
  the admin panel. It takes the org as a **prop** — never resolve an org from a slug inside
  it, and never collapse "couldn't load" into "not authorized" (the page it replaced did
  exactly that, and the resulting misdiagnosis cost real debugging time)
- Anything a **non-member** must read goes through a `SECURITY DEFINER` function rather than
  a table read — RLS would otherwise hide the row from precisely the person who needs it.
  The invite flow (`get_invite_details`, `accept_org_invite`) is the reference case.
- Analytics is separate from DB access: `src/lib/analytics/posthog.ts`, never `posthog-js`
  directly. See `docs/ANALYTICS.md`.

### Styling

Two style systems coexist — **Bootstrap 5 + SCSS is dominant**; Tailwind CSS v4 is minimally used.

**Read `docs/DESIGN-SYSTEM.md` before writing any UI.** The whole app shares one visual
language, lifted from the platform admin panel. Three files, with distinct jobs:

- `src/styles/col.scss` — **tokens only** (colors, radii, shadows, chrome constants).
  `@use` it per component with `as *`, adjusting relative path depth. It must stay
  variables-only: ~30 components import it, so a rule here is emitted once per component.
- `src/styles/ui.scss` — **shared classes** (`.panel`, `.pill`, `.data-table`,
  `.empty-state`, `.page-head`, `.stat-card`, `.modal-panel`, …). Loaded once by
  `luma.scss`; never `@use` it from a component, just use the class names.
- `src/styles/luma.scss` — Bootstrap theme + global element styles. Imported in the root
  `+layout.svelte`.

Rules that matter: never write a raw hex in a component (add a token instead); never
redefine a shared class locally (extend it with a second class); wide tables go in
`.table-scroll`. `@use` must be the FIRST thing in a component `<style lang="scss">` block.

- Layout uses CSS Grid with named areas: `navbar`, `sidebar`, `content`
- Both the recruiter and admin sidebars mark the current page the same way: yellow label
  plus a 3px yellow left rule
- Icons: Flaticon Uicons (`fi fi-br-*` classes)
- Font: Inter

### Component Patterns

Svelte 5 is installed but **most components use Svelte 4 patterns** (`export let`, `createEventDispatcher`, `$:` reactivity). The root layout uses Svelte 5 runes (`$props()`, `$derived()`, `{@render}`). Be consistent with the style of the file you're editing.

Note that `Sidebar.svelte` in `recruiter/` has been migrated to runes; the rest of that
directory has not. When a new shared component must interop with Svelte 4 slots and
`createEventDispatcher` (as `CandidateList.svelte` does with `/review`), match the host
file rather than forcing runes.

**Recruiter page template**:

```svelte
<div class="layout">
	<div class="content-left">
		<h4>Page Title</h4>
		<!-- page content -->
	</div>
	<Navbar />
	<Sidebar currentStep={N} />
</div>
```

`Sidebar` `currentStep` values: 0 home, 1 review, 2 my schedule, 3 full schedule,
5 evaluate, 6 settings, 7 availability, 8 candidates.

**Applicant pages** use `content` instead of `content-left`, plus the applicant `Navbar`
and `Sidebar`. Questions render through `QuestionRenderer.svelte` from the job's JSON
schema rather than from hand-written step pages.

**Form card components** (`src/lib/components/card/`): Reusable input components (Input, Checkbox, Radio, Dropdown, InputArea, InputDual) that dispatch `change` events.

### Key Directories

- `src/lib/components/applicant/` — Applicant flow UI (Navbar, Sidebar, Footer, AvailabilityGrid)
- `src/lib/components/recruiter/` — Recruiter dashboard UI (Navbar, Sidebar, CandidateList, Toast, EmailGeneratorModal)
- `src/lib/components/admin/` — Platform admin UI (Svelte 5 runes throughout), including
  `OrgSettingsPanel.svelte`, which is **also** mounted by `/private/[slug]/settings`
- `src/lib/components/card/` — Reusable form input card components
- `src/lib/scheduling/algorithms/` — The four interview scheduling algorithms
- `src/lib/email/` — Templates (`templates.ts`, provider-agnostic `EmailDraft` objects) and `.ics` generation
- `src/lib/analytics/` — `posthog.ts`: init, `EVENTS` constants, capture helpers. No-ops
  when `PUBLIC_POSTHOG_KEY` is unset
- `src/lib/types/` — `index.ts` (shared types), `orgSettings.ts` (`readOrgSettings()` normalizer),
  `instance.ts` (Setup tab status types)
- `src/lib/utils/interviewForms.ts` — interview evaluation forms. Per-org via
  `settings.interview_forms`; read with `resolveInterviewForms(settings, orgName)`
- `src/lib/utils/orgConfig.ts` — writes for org settings sections (`saveOrgSettingsSection`)
  and teams
- `src/lib/utils/assets.ts` — tenant image uploads (`uploadOrgImage`) into `org-assets`
  under `orgs/<org_id>/…`; UI via `components/admin/ImageUpload.svelte`. Nothing
  org-specific goes in `static/`
- `src/lib/server/instance.ts` — `getInstanceStatus()` for `/admin` → Setup (no secrets)
- `src/styles/` — SCSS files (Bootstrap theme + color tokens)
- `supabase/migrations/` — Forward-only SQL migrations
- `scripts/` — `setup.mjs` (interactive instance setup: DB/auth provider, keys, hosting,
  schema, email, first admin; then opens `/admin/?tab=setup`), `cross-platform-deps.mjs`
  (Windows/WSL deps), `tenant.mjs` (tenant export/import and applicant import)
- `docs/` — all project documentation; start at `docs/README.md`. `v0/` is the
  pre-rebuild app's docs, kept as history only
- `instance/` — **untracked**: per-deployment data exports, internal docs, one-off SQL
- `e2e/` — Playwright E2E tests

(`archive/` was deleted in Phase 0 — don't expect it.)
