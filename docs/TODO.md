# TODO.md — V1 Build Tasks (Claude)

Engineering work tracked here. Human-side work (DNS, accounts, etc.) lives in `HUMAN-TODO.md`. Deployment plan in `DEPLOYMENT.md`.

Order is roughly the build order — earlier phases unblock later ones. Within a phase, items can parallelize.

---

## Phase 0 — Audit & Cleanup (do first, ~half day)

- [ ] Read every file in current `git status` modified list; confirm what's actually in HEAD vs working tree. There are dozens of dirty files — decide what to commit and what to revert before building on top.
- [ ] Run `npm install && npm run check && npm run lint`; fix any existing errors before adding new code.
- [ ] Open the app locally against current Supabase, walk: signup → create org → create job → submit application → review → schedule. Note every broken thing in a scratch list.
- [ ] Verify migrations 00001-00013 are all applied to the current Supabase project. If not, apply them.
- [ ] Confirm `archive/` is truly dead code — delete it. The dirty diff has changes to archive files which suggests it's still being touched accidentally.
- [ ] Delete `docs/v0/` (already removed per git status — confirm).

## Phase 1 — Schema & Types Foundation (1 day)

- [ ] Migration `00014_v1_question_schema.sql`: extend question JSON to support `team_scope`, `reject_if`, `blinded`. No schema change strictly required (it's JSONB) — add a typed validator instead.
- [ ] Migration `00015_v1_teams.sql`: add `teams` table (org-scoped) with `name`, `description`, `slug`. Seed Infinitum/Astra/Terra/Juvo for Archimedes org.
- [ ] Migration `00016_v1_member_roles.sql`: add `roles` text[] on `org_members` (alongside existing `role`). Backfill from singular `role`. Update RLS helpers.
- [ ] Migration `00017_v1_application_drafts.sql`: `application_drafts` table for save-and-resume (`email`, `job_id`, `data` JSONB, `magic_token`, `expires_at`).
- [ ] Migration `00018_v1_reviewer_pool.sql`: `job_reviewers` join table; `org_settings.review_thresholds` JSON shape documented.
- [ ] Migration `00019_v1_decisions.sql`: `decisions` table (`applicant_id`, `team_id`, `outcome`, `decided_by`, `decided_at`, `email_sent_at`).
- [ ] Migration `00020_v1_applicant_prior_team.sql`: `prior_team_id` nullable on applicants.
- [ ] Update `src/lib/types/index.ts`: add `Team`, `OrgSettings`, `ApplicationDraft`, `Decision`, extend `FormQuestion` with new fields, extend `OrgMember` with `roles`.
- [ ] Add `src/lib/types/orgSettings.ts` with the canonical settings shape + zod validator (or hand-rolled validator if avoiding deps).

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
