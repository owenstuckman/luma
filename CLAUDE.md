# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LUMA is an open-source Applicant Tracking System (ATS) built with SvelteKit. It handles applicant submissions, recruiter review, and interview scheduling. Originally built for Virginia Tech's Archimedes Society (processed 400+ applicants, scheduled 250+ interviews in Fall 2025).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (Vercel adapter) |
| `npm run preview` | Preview production build |
| `npm run check` | Type-check with svelte-check |
| `npm run lint` | Prettier + ESLint check |
| `npm run format` | Auto-format with Prettier |
| `npm test` | Run Playwright E2E tests (builds first) |

## Environment Variables

Requires a `.env.local` with:
- `PUBLIC_SUPABASE_URL` — Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` — Supabase public anon key

## Architecture

**Stack**: SvelteKit 2 + Svelte 5, TypeScript (strict), Supabase (auth + DB), Vite 6, deployed to Vercel.

### Routing

- `/` — Landing page (applicant/recruiter/admin entry points)
- `/applicant/1_verification` through `/applicant/7_submit` — Multi-step application form (public, no auth)
- `/auth` — Recruiter login/signup (Supabase Auth)
- `/private/recruiter/*` — Auth-protected recruiter dashboard (home, review, schedule, evaluate, settings)
- `/admin` — Admin view

Auth guard in `src/hooks.server.ts` redirects unauthenticated users from `/private/*` to `/auth` and authenticated users from `/auth` to `/private`.

### State Management

- **Applicant flow**: Form state persists in `localStorage` (one key per question). On step 7 (`/applicant/7_submit`), all entries are collected into a `recruitInfo` JSON object and sent to Supabase via `sendApplication()`.
- **Recruiter side**: Data fetched directly from Supabase. No Svelte stores are used anywhere.

### Supabase

- Client-side utilities in `src/lib/utils/supabase.ts` (uses `createBrowserClient` from `@supabase/ssr`)
- Server-side client created in `src/hooks.server.ts` (uses `createServerClient` with cookie auth)
- In server files, access Supabase via `event.locals.supabase`
- Tables: `job_posting`, `applicants`, `interviews`, `notes`

### Styling

Two style systems coexist — **Bootstrap 5 + SCSS is dominant**; Tailwind CSS v4 is minimally used.

- Color tokens: `src/styles/col.scss` — import per-component with `@use` and adjust relative path depth
- Global Bootstrap theme: `src/styles/luma.scss` (imported in root `+layout.svelte`)
- Layout uses CSS Grid with named areas: `navbar`, `sidebar`, `content`
- Icons: Flaticon Uicons (`fi fi-br-*` classes)
- Font: Inter

### Component Patterns

Svelte 5 is installed but **most components use Svelte 4 patterns** (`export let`, `createEventDispatcher`, `$:` reactivity). The root layout uses Svelte 5 runes (`$props()`, `$derived()`, `{@render}`). Be consistent with the style of the file you're editing.

**Applicant page template** — each step follows:
```svelte
<div class="layout">
  <div class="content">
    <h4>Step Title</h4>
    <!-- Card components from $lib/components/card/ -->
    <Footer backNav="/applicant/prev" nextNav="/applicant/next"/>
  </div>
  <Navbar/>
  <Sidebar currentStep={N}/>
</div>
```

**Recruiter page template** — uses `content-left` instead of `content`, plus recruiter `Navbar` and `Sidebar`.

**Form card components** (`src/lib/components/card/`): Reusable input components (Input, Checkbox, Radio, Dropdown, InputArea, InputDual) that dispatch `change` events.

### Key Directories

- `src/lib/components/applicant/` — Applicant flow UI (Navbar, Sidebar, Footer, AvailabilityGrid)
- `src/lib/components/recruiter/` — Recruiter dashboard UI (Navbar, Sidebar)
- `src/lib/components/card/` — Reusable form input card components
- `src/styles/` — SCSS files (Bootstrap theme + color tokens)
- `archive/` — Legacy page copies, not part of active routing
- `e2e/` — Playwright E2E tests
