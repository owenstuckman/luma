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
| `npm run setup`   | Guided first-time setup                 |

**Node 22+ is required** (`engines.node: ">=22"`). `@supabase/realtime-js` needs a native
global `WebSocket`, which arrived in Node 22 and which it version-gates on; under Node 20
`createServerClient` throws in `src/hooks.server.ts` and every SSR route 500s. PowerShell
and WSL have separate Node installs — check `node -v` in both.

If the repo is used from both PowerShell and WSL, run `npm run deps:cross` after any
`npm install` — see the README section "Working from both Windows and WSL". It places a
correctly-versioned native binary next to _every_ copy of rollup/esbuild/lightningcss in
the tree, including nested ones, since each copy rejects a version-mismatched binary.

## Environment Variables

Requires a `.env.local` with:

- `PUBLIC_SUPABASE_URL` — Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` — Supabase public anon key

## Repo layout

Root stays deliberately thin, but most config files there **cannot** move — the tools look
for them in the project root and moving them costs a flag on every invocation:

| File(s)                                             | Why it's at the root                                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte.config.js`, `vite.config.ts`                | SvelteKit and Vite resolve these from the project root only                                                                                                                                                |
| `tsconfig.json`                                     | Extends `.svelte-kit/tsconfig.json`; `svelte-check` points at it                                                                                                                                           |
| `eslint.config.js`                                  | Flat-config discovery walks up to the root                                                                                                                                                                 |
| `package.json`, `package-lock.json`, `.npmrc`       | npm                                                                                                                                                                                                        |
| `.prettierrc`, `.prettierignore`                    | Prettier discovery; the ignore file must be a real file                                                                                                                                                    |
| `.gitattributes`, `.gitignore`                      | git                                                                                                                                                                                                        |
| `.nvmrc`                                            | Node version pin (see the Node requirement above)                                                                                                                                                          |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Conventional root placement — `docker build .` and `docker compose up` work with no flags. The self-hosted path is out of scope for V1 and untested; leaving it conventional is cheaper than relocating it |

Everything that _can_ live elsewhere already does: docs in `docs/`, E2E specs in `e2e/`,
one-off scripts in `scripts/`, SQL in `supabase/migrations/`.

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
- `/auth` — Recruiter login/signup (Supabase Auth), plus `/auth/confirm`, `/auth/reset`
- `/private/[slug]/*` — Auth-protected, org-scoped recruiter dashboard:
  `dashboard`, `review`, `review/candidate`, `candidates`, `schedule/my`,
  `schedule/full`, `evaluate`, `availability`, `settings`, `settings/jobs`,
  `settings/scheduling`
- `/admin` — Platform admin view (cross-org)
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
  `src/lib/utils/formSchema.ts` (question `team_scope` visibility, `reject_if` auto-reject
  evaluation) and `src/lib/utils/review.ts` (vote tallying, thresholds, weighted scoring,
  blinded redaction). Keep them side-effect free — the plan is to reuse them server-side.
- Server-side client created in `src/hooks.server.ts` (uses `createServerClient` with cookie auth)
- In server files, access Supabase via `event.locals.supabase`
- New DB access belongs in `src/lib/utils/*.ts`, not inline `supabase.from()` in components
- Tables: `organizations`, `org_members`, `job_posting`, `applicants`, `interviews`,
  `interviewers`, `interviewer_availability`, `scheduling_config`, `email_log`,
  `platform_admins`, `platform_settings`, `platform_activity_log`, plus the V1 additions
  `teams`, `application_drafts`, `job_reviewers`, `decisions`
- Migrations are forward-only and additive (`supabase/migrations/00001`–`00020`)
- RLS helpers: `is_org_member()`, `has_org_role()`, `has_app_role()`

### Styling

Two style systems coexist — **Bootstrap 5 + SCSS is dominant**; Tailwind CSS v4 is minimally used.

- Color tokens: `src/styles/col.scss` — import per-component with `@use` and adjust relative path depth
- Global Bootstrap theme: `src/styles/luma.scss` (imported in root `+layout.svelte`)
- Layout uses CSS Grid with named areas: `navbar`, `sidebar`, `content`
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
- `src/lib/components/admin/` — Platform admin UI
- `src/lib/components/card/` — Reusable form input card components
- `src/lib/scheduling/algorithms/` — The four interview scheduling algorithms
- `src/lib/email/` — Templates (`templates.ts`, provider-agnostic `EmailDraft` objects) and `.ics` generation
- `src/lib/types/` — `index.ts` (shared types), `orgSettings.ts` (`readOrgSettings()` normalizer)
- `src/styles/` — SCSS files (Bootstrap theme + color tokens)
- `supabase/migrations/` — Forward-only SQL migrations
- `scripts/` — `setup.mjs` (first-run setup), `cross-platform-deps.mjs` (Windows/WSL deps)
- `docs/` — all project documentation; start at `docs/README.md`. `v1/` holds the inputs
  that set V1 scope (`background.md`, `Questions.md`, last cycle's CSVs); `v0/` is the
  pre-rebuild app's docs, kept as history only
- `e2e/` — Playwright E2E tests

(`archive/` was deleted in Phase 0 — don't expect it.)
