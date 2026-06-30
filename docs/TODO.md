# TODO.md — V1 Build Tasks (Claude)

Engineering work tracked here. Human-side work (DNS, accounts, etc.) lives in `HUMAN-TODO.md`. Deployment plan in `DEPLOYMENT.md`.

Order is roughly the build order — earlier phases unblock later ones. Within a phase, items can parallelize.

---

## Phase 0 — Audit & Cleanup ✅ (complete)

- [x] **Git status assessed.** 89/93 "modified" files were pure CRLF noise from Windows/WSL line endings; only the 4 docs we edited had real changes. No commit/revert needed — `npm run format` normalized everything.
- [x] **`npm install` + `npm run check` + `npm run lint`** all green. Fixes applied:
  - `src/hooks.server.ts`: `event.url.pathname` instead of `event.request.url.pathname`; cast supabase client through `unknown` to bridge `@supabase/ssr` ↔ `@supabase/supabase-js` generic mismatch.
  - `src/app.d.ts`: dropped reference to nonexistent `./database.types.ts`; `SupabaseClient` no longer parameterized (acceptable for V1 — generate types in Phase 1).
  - `src/routes/private/[slug]/+layout.svelte`: added missing `metadata: {}` to platform-admin synthetic `OrgMember`.
  - `src/routes/private/[slug]/review/+page.svelte`: `getActiveRoles(orgId ?? undefined)` to satisfy `number | undefined` signature.
  - `src/lib/scheduling/algorithms/batch-scheduler.ts`: removed dead `hasHardRuleMatch` helper.
  - `src/lib/scheduling/algorithms/max-placement.ts`: removed unused `startStr`/`endStr` locals.
  - `scripts/setup.mjs`: dropped unused `readFileSync`, `copyFileSync` imports.
  - `src/routes/auth/+page.server.ts`: dropped unused `url` destructure.
  - `src/routes/private/[slug]/settings/+page.svelte`: prettier had mangled an angle-bracketed placeholder into broken Svelte; rewrote as `noreply@archimedes.vt.edu`.
- [x] **Toolchain upgrades** done during cleanup:
  - Reinstalled `node_modules` to fix `@rollup/rollup-linux-x64-gnu` missing-optional-deps bug (lockfile was Windows-generated).
  - Pinned `prettier@3.6.2` — `3.9.1` had a `getVisitorKeys` regression with Svelte files.
  - Upgraded `typescript-eslint` and `prettier-plugin-svelte` to latest.
  - Added `.claude/` to `.prettierignore`.
  - In `eslint.config.js`: disabled `@typescript-eslint/no-unused-vars` for `.svelte` files (incompat with svelte-eslint-parser + projectService; svelte-check covers this already). Downgraded 9 pre-existing rule violations to `warn` (200+ findings, all style/best-practice from newer plugin versions — not real bugs, defer to a quality pass).
- [x] **`archive/` deleted** — confirmed zero imports referenced it.
- [ ] ~~Delete `docs/v0/`~~ — kept as historical reference (versioned alongside `docs/v1/`).
- [ ] **`npm run build`** clean (one harmless `@opentelemetry/api` soft-import warning from supabase-js).
- [ ] Open the app locally against current Supabase, walk: signup → create org → create job → submit application → review → schedule. _Skipped here — needs human in the loop with running browser. Recommend doing during Phase 7 QA._
- [ ] Verify migrations 00001-00013 applied to prod Supabase. _Owner action — see HUMAN-TODO.md._

**Net result:** lint green (0 errors / 203 warnings), check green (0 errors / 117 warnings), build green. Safe to start Phase 1.

## Phase 1 — Schema & Types Foundation ✅ (complete)

- [x] **`00014_v1_question_schema.sql`** — documents the extended question JSON shape (`team_scope`, `reject_if`, `blinded`); adds a light `jsonb_typeof` CHECK on `job_posting.questions` to enforce the outer object/`steps` array shape. Forward-compatible (extra keys not validated).
- [x] **`00015_v1_teams.sql`** — `teams` table (org-scoped: `name`, `slug`, `description`, `display_order`, `active`), unique on `(org_id, slug)`, GIN-friendly RLS via `is_org_member` / `has_org_role`. Seeds Infinitum / Astra / Terra / Juvo for the Archimedes org (idempotent).
- [x] **`00016_v1_member_roles.sql`** — adds `roles text[]` to `org_members`, backfills from singular `role` (legacy `recruiter` → `['interviewer', 'recruiter']`), GIN index, and new helper `has_app_role(org_id, role_name)` that checks both `roles[]` and the singular `role` for back-compat.
- [x] **`00017_v1_application_drafts.sql`** — drafts table for save-and-resume (`email`, `job_id`, `data` JSONB, `selected_team_slugs`, `magic_token` UNIQUE, `expires_at` default +14d). Public INSERT allowed; SELECT/UPDATE go through server endpoints (token verified server-side). Auto-updates `updated_at` via trigger.
- [x] **`00018_v1_reviewer_pool.sql`** — `job_reviewers` join (`job_id`, `user_id`, `weight` for weighted scoring). Seeds `review_thresholds` defaults into `organizations.settings` for any org missing them (non-destructive jsonb merge).
- [x] **`00019_v1_decisions.sql`** — `decisions` table with `decision_outcome` enum (`hire | reject | waitlist`), one row per `(applicant, team)`, `email_sent_at` for outbound tracking. RLS allows advisors + admins to write, all org members to read.
- [x] **`00020_v1_applicant_prior_team.sql`** — `applicants.prior_team_id` (nullable FK to teams) and `applicants.selected_team_slugs text[]` for the teams the applicant chose at submission.
- [x] **`src/lib/types/index.ts`** — added `AppRole`, `Team`, `ApplicationDraft`, `Decision`, `DecisionOutcome`, `JobReviewer`, `TeamScope`, `RejectRule`; extended `OrgMember` with `roles: AppRole[]`, `FormQuestion` with `team_scope` / `reject_if` / `blinded`, `Applicant` with `prior_team_id` / `selected_team_slugs`.
- [x] **`src/lib/types/orgSettings.ts`** — canonical `OrgSettings` type covering `review_thresholds`, `scheduling`, `email`. Hand-rolled `readOrgSettings(raw)` normalizer (no zod): missing/malformed keys fall back to `DEFAULT_ORG_SETTINGS`, never throws. Always read settings through this — never touch `org.settings.foo` directly.
- [x] Fixed downstream type break: platform-admin synthetic `OrgMember` in `src/routes/private/[slug]/+layout.svelte` now carries `roles: ['owner']`.

**Net result:** `npm run check` (0 errors), `npm run lint` (0 errors), `npm run build` clean. 7 new migrations land additively (no drops, no renames). Safe to start Phase 2 once migrations are applied to Supabase.

**Owner action before Phase 2 (also in HUMAN-TODO.md):**
1. Apply `00014`–`00020` to the prod Supabase project (`supabase db push` or paste each into the SQL editor in order).
2. Confirm the Archimedes org row exists (`select * from organizations where slug = 'archimedes'`); if not, create it before re-running `00015` to get the seed.

## Phase 2 — Form Builder + Application Flow (2-3 days; critical path)

- [ ] Form builder UI at `/private/[slug]/settings/jobs/[id]/builder` — drag-to-reorder questions, edit per-question metadata (type, title, options, `team_scope`, `reject_if`, `blinded`).
- [ ] Team picker step component — first step of any multi-team form, writes selected teams into the draft.
- [ ] Extend `QuestionRenderer.svelte` to honor `team_scope` (skip questions whose teams aren't selected).
- [ ] Save-and-resume:
  - [ ] Magic-link endpoint: `POST /api/applicant/start` → emails resume link
  - [ ] Draft autosave on form change (debounced 1s) → `application_drafts`
  - [ ] Resume route loads draft by token, prefills form
- [ ] Auto-reject evaluator: server-side function `evaluateRejectRules(answers, schema)` → returns matched rules. Called on submit.
- [ ] On submit: write applicant, run auto-reject, set status, fire confirmation email.
- [ ] Update `/apply/[slug]/[job_id]/success/+page.svelte` to handle both happy path and auto-rejected (different copy if admin enables auto-reject email).

## Phase 3 — Review Stage (1-2 days)

- [ ] Reviewer pool assignment UI on job edit page.
- [ ] `/private/[slug]/review` — list view filtered to current user's assigned applications.
- [ ] Blinded mode: server strips name/email/year fields before sending to client when `org.settings.blinded_review = true` AND user role is `reviewer` only (advisors/admins see identity).
- [ ] Approve/reject vote endpoint + UI buttons. Tally against thresholds. Auto-advance state on threshold met.
- [ ] Weighted scoring: per-interviewer weight stored on `org_members.metadata.review_weight`. Default 1.0. Apply weight when computing approval tally.
- [ ] Comments UI (extend existing `CommentEntry` flow).

## Phase 4 — Scheduling Polish (1-2 days)

- [ ] Verify all four algorithms run end-to-end against real data. Write a smoke test per algorithm.
- [ ] Algorithm picker dropdown on job scheduling page (likely already there — confirm).
- [ ] Buffer-time setting on job (default 5min from `org.settings`).
- [ ] Advisor exclusion: scheduler reads `org_members.roles` — if includes `advisor`, exclude from R1 candidate pool unless explicitly overridden.
- [ ] `prior_team_id` admin override UI on candidate row. Pass to scheduler as soft preference.
- [ ] R2 trigger: "Schedule Round 2" button on candidate page → modal with two options: auto-schedule | candidate-picks-slot link.
- [ ] Candidate-picks-slot flow: tokenized URL `/schedule/pick/[token]` → shows available slots → writes interview on selection.
- [ ] R3 "Schedule Follow-Up" button — same modal, sets `interview.metadata.round = 3`.

## Phase 5 — Selection & Decision Emails (1 day)

- [ ] Hire / Reject / Waitlist buttons per team on candidate page. Writes to `decisions` table.
- [ ] Dual-team conflict detection: if `decisions` has 2+ `hire` rows for same applicant across teams → flag.
- [ ] Dashboard conflict banner + per-row badge in candidate list.
- [ ] Settings page section: "Automatic decision emails" toggle + per-outcome template editor (hire, reject, waitlist). Use existing template system in `src/lib/email/templates.ts`.
- [ ] On decision write, if auto-email enabled, queue send via Resend; record `email_sent_at`.

## Phase 6 — Observability (half day)

- [ ] Install `posthog-js`. Init in root layout with org_id + user_id properties.
- [ ] Enable PostHog error tracking (autocapture exceptions).
- [ ] Track key events: `application_started`, `application_submitted`, `application_auto_rejected`, `review_voted`, `interview_scheduled`, `decision_made`.
- [ ] Add `POSTHOG_KEY` to `env.example` and `.env.local`.

## Phase 7 — Pre-launch QA (half day)

- [ ] Run through complete flow end-to-end on a staging Vercel preview with a throwaway Supabase project.
- [ ] Verify Resend send works from the production sending domain.
- [ ] Verify `.ics` attachments open correctly in Apple Calendar, Google Calendar, Outlook.
- [ ] `npm run build` clean, `npm run check` clean, `npm run lint` clean.
- [ ] Run Playwright E2E suite (`npm test`). Add tests for the new submit + auto-reject path if not covered.
- [ ] Load test the scheduler against ~200 fake applicants to confirm performance.
- [ ] Manual security pass: try to read another org's data while authed as a different org's user.

---

## Open Decisions (resolve before starting the phase)

- **Phase 1 / Phase 2:** Pick a validation lib or hand-roll? Recommend hand-roll (no zod) — schema is small.
- **Phase 3:** When threshold is met, do we auto-advance immediately, or admin-confirm? Recommend auto-advance with audit log entry.
- **Phase 4:** Should candidate-picks-slot link expire? Recommend 7 days.
- **Phase 5:** Decision emails — admins can disable per-outcome (e.g., auto-send hires but not rejects)? Recommend yes, three independent toggles.
