# TODO.md — V1 Build Tasks (Claude)

Engineering work tracked here. Human-side work (DNS, accounts, etc.) lives in `HUMAN-TODO.md`. Deployment plan in `DEPLOYMENT.md`.

Order is roughly the build order — earlier phases unblock later ones. Within a phase, items can parallelize.

---

## Phase 0 — Audit & Cleanup ✅ (complete)

- [x] **Git status assessed.** 89/93 "modified" files were pure CRLF noise from Windows/WSL line endings; only the 4 docs we edited had real changes. No commit/revert needed — `npm run format` normalized everything. _(Recurred afterward; permanently fixed in Phase 1.6 with `.gitattributes`.)_
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

**✅ Applied 2026-08-16** via the Supabase MCP server, each migration registered separately
in Supabase's migration history. All four V1 tables exist with RLS + policies, the Archimedes
teams are seeded, and security advisors report 0 ERROR-level findings. See `HUMAN-TODO.md`
for the full verification. **Everything gated on "migrations not applied" is now unblocked.**

## Phase 1.5 — Candidate Profiles & Roster ✅ (complete)

Added to scope mid-build: a single place to see every candidate and click through
to their full history.

- [x] **`src/lib/utils/candidates.ts`** — the only module that joins the pipeline tables.
      `getCandidates(orgId, jobId?)` returns `CandidateRow` (applicant + job name, team
      names, interview/evaluation counts, avg rating, decisions, derived stage, hire-conflict
      flag). `getCandidateTimeline(orgId, applicant)` unions `application_drafts`,
      `applicants`, `interviews` (scheduled / held / evaluated), `decisions`, `email_log`,
      and inline comments into one sorted `TimelineEvent[]`. Queries against V1 tables are
      failure-tolerant so an un-migrated deployment degrades instead of erroring.
- [x] **`CandidateList.svelte`** — shared list owning search / stage+status filter / sort /
      pagination / selection, with card and table views. Host pages supply toolbar buttons
      via the `actions` slot and bulk UI via `bulk` / `bulk-panels`.
- [x] **`/private/[slug]/candidates`** — org-wide roster: stage-count strip, hire-conflict
      banner, job filter, bulk status update, CSV export.
- [x] **`/review` refactored onto `CandidateList`** — keeps its job picker, realtime toast,
      and all four bulk actions; gains stage/rating/decision columns. Realtime INSERT now
      re-fetches instead of pushing the raw row (the list needs enriched state).
- [x] **Timeline card on `/review/candidate`** — chronological pipeline history with
      per-kind icons/colors. Back link honors `?from=candidates`.
- [x] **Sidebar** — new "Candidates" item (`currentStep === 8`), desktop + mobile drawer.

Known gaps, deliberately left for later phases:

- Inline comments have no stored timestamp, so they sort to the end of the timeline
  labeled "No timestamp". Fix when Phase 3 replaces them with timestamped votes.
- Round numbers are derived by ordering interviews on `start_time`. Switch to
  `interview.metadata.round` once Phase 4 writes it.
- Stage transitions aren't recorded as events (no audit table); stage is derived at
  read time from current state.
- `/candidates` shows all org candidates to any member. Revisit if Phase 3 blinded
  review needs to apply here too.

## Phase 1.6 — Cross-platform dev environment ✅ (complete)

The repo lives on a Windows drive and is used from both PowerShell and WSL, which share
one `node_modules` and one working tree. Two recurring failures came from that:

- [x] **`npm run dev` failed in PowerShell.** Rollup, esbuild, and lightningcss each ship
      their native binary as a separate platform-specific package, and `npm install` only
      fetches the one matching the installing OS. Phase 0 reinstalled from WSL, so only
      `rollup-linux-x64-gnu` / `@esbuild/linux-x64` / `lightningcss-linux-x64-gnu` were
      present and Windows died with `Cannot find module @rollup/rollup-win32-x64-msvc`.
      Fixed by installing both platforms' binaries side by side — they're inert on the OS
      they don't match, since each library resolves from `process.platform` at runtime.
- [x] **`scripts/cross-platform-deps.mjs` + `npm run deps:cross`** — restores the other
      platform's binaries after any `npm install`, pinned to the installed host versions.
      Uses `--no-save --force` so the manifests stay byte-identical (verified by diff).
      Deliberately not a `postinstall` hook: Vercel builds on Linux.
- [x] **`.gitattributes` (`* text=auto eol=lf`)** — ends the recurring CRLF churn that
      showed ~17 migration/Dockerfile/CSV files as fully modified whenever the OS changed.
      Adding it cleared them from `git status` immediately, with no renormalize commit
      needed (the index was already LF).
- [x] **Docs refreshed** — root `CLAUDE.md` had stale routing (`/applicant/1_verification`,
      `/private/recruiter/*`), a stale table list, a claim that no Svelte stores exist, and a
      reference to the deleted `archive/`. README gained the cross-platform section, the
      candidate-roster feature, and the V1 tables.

**Open issue surfaced here, resolved 2026-08-16:** the docs specified **EmailJS** while all
shipped code used **Resend**. Owen chose Resend — zero rewrite. See Phase 4.5.

## Phase 2 — Form Builder + Application Flow (2-3 days; critical path) — 🔧 in progress

Done:

- [x] **`src/lib/utils/formSchema.ts`** — pure, DB- and DOM-free schema logic, so the same
      code runs on the client (hiding questions live) and on a server endpoint later.
      Exports `isQuestionVisible` / `visibleSteps` (team_scope) and
      `matchesRule` / `evaluateRejectRules` / `describeRejectMatch` (reject_if).
      **Safety property:** apart from `falsy`, no rule fires on an unanswered question —
      auto-reject is silent and destructive, so "skipped it" must never be treated as
      "gave the disqualifying answer".
- [x] **Verified with 33 assertions** (`esbuild` transpile + `node:assert`; no test runner
      is installed — see the open question below). This caught a real bug before it shipped:
      `Number('')` is `0`, so a `lt` rule on GPA auto-rejected every applicant who left the
      field blank. Fixed by rejecting blank input in `toNumber`.
- [x] **Team picker step** on `/apply/[slug]/[job_id]` — inserted after Personal Info, only
      when the org has teams. Selection persists to `localStorage` and is validated before
      advancing. Slugs that no longer exist are dropped on load.
- [x] **team_scope honored** — later steps render only questions in scope for the picked
      teams, and steps emptied by filtering are skipped rather than shown blank.
- [x] **Auto-reject on submit** — evaluated against _visible_ questions only, so a rule on a
      team the applicant didn't pick can't reject them. Sets `status: 'denied'` and writes
      `metadata.auto_rejected` / `auto_reject_reasons` / `auto_rejected_at` for the audit trail.
- [x] **Graceful degradation** — `getTeams()` returns `[]` if the `teams` table is missing,
      and `selected_team_slugs` is only sent when non-empty. An org without migrations
      `00015`/`00020` keeps a working application form instead of 400-ing on unknown columns.
      Verified against the live DB, which currently has neither table.

Remaining:

- [ ] Form builder UI at `/private/[slug]/settings/jobs/[id]/builder` — drag-to-reorder questions, edit per-question metadata (type, title, options, `team_scope`, `reject_if`, `blinded`). **This is the largest remaining piece of Phase 2.**
- [ ] Save-and-resume — ⛔ blocked on the email-provider decision (the magic link has to be sent by something):
  - [ ] Magic-link endpoint: `POST /api/applicant/start` → emails resume link
  - [ ] Draft autosave on form change (debounced 1s) → `application_drafts`
  - [ ] Resume route loads draft by token, prefills form
- [ ] Confirmation email on submit — ⛔ same blocker.
- [ ] Update `/apply/[slug]/[job_id]/success/+page.svelte` to handle both happy path and auto-rejected (different copy if admin enables auto-reject email).
- [ ] **Move auto-reject enforcement server-side.** It currently runs in the browser, so a
      crafted request could skip it. Severity is low — the existing `sendApplication()` already
      trusts the client for name, email, and every answer, so this is consistent with the
      current trust model rather than a new hole, and the fallback is that a human reviews
      the applicant instead. Harden with the rest of the submit path.

**Open question — no unit test runner.** `formSchema.ts` is exactly the kind of pure logic
that wants unit tests, and its first version shipped a real bug that assertions caught.
`npm test` only runs Playwright. Recommend adding `vitest` (Vite is already present, so it's
near-zero config) and committing the 33 assertions as a real suite. Not done unprompted
because it adds a dev dependency.

## Phase 3 — Review Stage (1-2 days) — 🔧 in progress

Done:

- [x] **`src/lib/utils/review.ts`** — pure review logic: `normalizeVote`, `tallyVotes`,
      `thresholdOutcome`, `votesRemaining`, `buildWeightMap`, `redactApplicant`, `shouldBlind`.
      **Verified with 29 assertions.**
- [x] **Approve/reject voting + auto-advance** on the candidate page. Votes are stored as
      comments (so they appear in the existing thread and the timeline) and crossing a
      threshold updates `applicants.status` immediately — the auto-advance option from the
      Open Decisions list.
- [x] **Last vote wins per reviewer.** A reviewer who changes their mind is counted once;
      without this they'd be double-counted and could cross a threshold alone.
- [x] **Split votes never advance.** Rejection is evaluated first, so an applicant meeting
      both thresholds is denied rather than silently advanced into interviews.
- [x] **Legacy vote spellings normalized** — `positive`/`accepted`/`yes` and
      `negative`/`denied`/`no` all count, so comments written before Phase 3 still tally.
- [x] **Weighted scoring** — reads `org_members.metadata.review_weight`; missing, non-numeric,
      or negative values fall back to 1 so a bad value can't erase someone's vote. Weights key
      off real emails via the `get_org_members_with_email` RPC (`org_members` only stores `user_id`).
- [x] **Blinded review** — plain reviewers see `Applicant #<id>`, a hidden email, and `[hidden]`
      for any answer whose question is flagged `blinded`. Advisors/admins/owners/eboard always
      see the real record. Redaction copies rather than mutates the source object.
- [x] **Per-question `blinded` / `team_scope` / `reject_if` controls in the form builder**
      (`settings/jobs/[job_id]`) — completes the Phase 2 builder item. Keys are omitted from
      the stored JSON when unset, and the reject operand is validated before the question can
      be added. Badges + a one-line summary surface the metadata on collapsed rows.

Remaining:

- [ ] Reviewer pool assignment UI on job edit page (needs `job_reviewers`, migration 00018).
- [ ] `/private/[slug]/review` — filter the list to the current user's assigned applications.
- [ ] **Move blinding server-side.** It is currently a client-side redaction, so the
      un-blinded record still reaches the browser. Fine for an honest-reviewer model, not for
      a hostile one — do it in a `+page.server.ts` load before launch.
- [ ] Auto-advance currently runs only when a vote is cast from the candidate page. A
      applicant whose threshold is crossed by a bulk comment won't advance until someone
      opens them. Consider a DB trigger or a nightly sweep.

## Phase 4 — Scheduling Polish (1-2 days)

- [ ] Verify all four algorithms run end-to-end against real data. Write a smoke test per algorithm.
- [ ] Algorithm picker dropdown on job scheduling page (likely already there — confirm).
- [ ] Buffer-time setting on job (default 5min from `org.settings`).
- [ ] Advisor exclusion: scheduler reads `org_members.roles` — if includes `advisor`, exclude from R1 candidate pool unless explicitly overridden.
- [ ] `prior_team_id` admin override UI on candidate row. Pass to scheduler as soft preference.
- [ ] R2 trigger: "Schedule Round 2" button on candidate page → modal with two options: auto-schedule | candidate-picks-slot link.
- [ ] Candidate-picks-slot flow: tokenized URL `/schedule/pick/[token]` → shows available slots → writes interview on selection.
- [ ] R3 "Schedule Follow-Up" button — same modal, sets `interview.metadata.round = 3`.

## Phase 4.5 — Email layer on Resend ✅ (templates done)

Provider decided 2026-08-16: **Resend**. No code changed — everything already used it.

- [x] All EmailJS references purged from `docs/CLAUDE.md`, `docs/DEPLOYMENT.md`,
      `docs/HUMAN-TODO.md`. `DEPLOYMENT.md`'s env-var and DNS tables now describe
      `RESEND_API_KEY` / `LUMA_FROM_EMAIL` as Supabase Edge Function secrets.
- [x] **Three new templates** in `src/lib/email/templates.ts`, matching the existing
      plain-text `EmailDraft` style: `applicationReceivedEmail`, `autoRejectedEmail`,
      `decisionEmail` (hire / reject / waitlist, with an optional admin-authored override).
      **Verified with 14 assertions**, including two deliberate guarantees: - the auto-reject email **never says which rule fired** — naming the disqualifying
      answer just teaches people how to game a resubmit; - **reject and waitlist share a subject line**, so the outcome isn't spoiled in the
      inbox preview before the applicant opens it.
- [x] Fixed a typo in `.env.local`: `UPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
      (missing leading `S`). Any server code reading the correct name was getting `undefined`.

Remaining — the **send path**, which is an architecture decision, not just wiring:

- [ ] Interview emails already send via the `notify-interviews` edge function, proxied
      through `/private/[slug]/schedule/notify` with the recruiter's JWT. Decision emails
      can reuse that pattern directly (recruiter-authenticated).
- [ ] The **application confirmation is different** — it fires for an _unauthenticated_
      applicant at submit time, so it cannot go through the JWT-proxied endpoint. Options:
      (a) a new edge function invoked with the anon key, (b) a Postgres webhook on
      `applicants` INSERT, or (c) a SvelteKit server endpoint holding the Resend key.
      (b) is the most robust — it can't be skipped by a client that never calls it.
- [ ] Wire `OrgSettings.email` toggles to each send.
- [ ] Record every send in `email_log` (table exists, migration 00010).

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
