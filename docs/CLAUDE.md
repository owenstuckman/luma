# CLAUDE.md — V1 Context

This file is the working context for V1 development. The root `/CLAUDE.md` is the general project guide; this one captures **decisions, scope, and conventions specific to the V1 rebuild** (driven by `docs/v1/background.md` and `docs/Questions.md`).

If anything here contradicts the root `CLAUDE.md`, this file wins for V1 work. When V1 ships, fold relevant pieces back into root `CLAUDE.md` and delete this file.

---

## V1 Mission

Rebuild LUMA into a **generalized, multi-tenant ATS** that handles Archimedes' four-subteam recruitment flow end-to-end: application → auto-reject → manual review → R1 interviews (auto-scheduled) → per-team R1 reject → R2 (per-team) → optional R3 follow-ups → team selection → automated decision emails.

**Target deployment:** `luma.archimedesvt.org` on Vercel + existing Supabase project. Live ASAP, quality bar high.

---

## Non-negotiables (from Questions.md answers)

1. **Multi-tenant stays.** Do not collapse `organizations` / `org_members` / `slug` routing. Generalize anything Archimedes-specific behind org settings — no hardcoded team names, no hardcoded counts.
2. **Archimedes is just the first tenant.** Teams (Infinitum, Astra, Terra, Juvo) are seed data for the Archimedes org, *not* schema constants.
3. **Everything configurable per-org** by an admin: review thresholds (approves + rejects), auto-reject rules, scheduling algorithm, buffer time, email-on-decision toggles, blinded-review toggle.
4. **Scrap the cohort scheduler** from `docs/v1/LUMA Auto-Scheduler Problem.pdf`. R1 is simple: 1 applicant per interview slot, scheduled against interviewer availability.
5. **Quality > velocity if forced to choose**, but velocity is preferred. No half-finished features merged.

---

## Roles

System roles (extend existing `OrgRole` if needed):

- `owner` — billing/org settings (existing)
- `admin` — configures rules, scheduling, emails, members
- `eboard` — same as admin in practice; coordination role, no extra perms (offline distinction)
- `advisor` — per-team; sees own team's candidates, runs R2/R3, owns selection decisions
- `interviewer` (`recruiter` in current schema — keep alias) — runs R1 interviews, submits scores
- `reviewer` — sees blinded applications in manual reject stage, casts approve/reject votes
- `viewer` — read-only (existing)
- `candidate` — applicant; auth via magic link for save-and-resume

Multi-role users are common (e.g., advisor + interviewer). Use a many-to-many membership table or a roles array; do **not** model each role as a separate user row.

---

## Application Form Model

- **One** application per job posting / recruitment cycle.
- Applicant selects 1-N teams up front. Form dynamically renders shared questions + per-team questions for selected teams only.
- Questions are JSON-schema-driven (`job_posting.questions` → `QuestionRenderer.svelte`). Already exists — extend it, don't rebuild it.
- Add to schema: `team_scope: 'shared' | { teams: string[] }`, `reject_if: <rule>`, `blinded: boolean`.
- All question types from current `QuestionRenderer` (`input`, `input_dual`, `textarea`, `radio`, `checkbox`, `checkbox_image`, `dropdown`, `availability`) plus: file upload (defer to V1.1 — see FEATURES.md), video link (URL input is fine for V1), scale 1-5 (use radio).
- **Save & resume:** magic-link auth for candidates. Partial responses persist to DB (not localStorage). Existing localStorage flow stays as a fallback for unauth'd typing-in-progress.

---

## Auto-Reject Rules

Admin-configurable per question. UI: when editing a question in the form builder, an "Auto-reject if..." section lets you pick an answer condition (e.g., dropdown answer = "No", checkbox includes "Under 18"). Stored as `reject_if: { op: 'eq'|'in'|'lt'|...', value: ... }` on the question.

On submit, server evaluates all `reject_if` rules → if any fire, applicant status set to `denied` with `metadata.auto_reject_reason`. No email triggered unless admin enables it.

---

## Review Stage (manual reject)

- **Blinded by default** — reviewers don't see name/email/year. Toggle off per-org if desired.
- **Fixed reviewer pool** assigned per job posting (not round-robin).
- Admin sets `approve_threshold` and `reject_threshold` (e.g., 3 approves → advance, 2 rejects → out). When either fires, applicant moves to next state.
- Reviewers can leave comments (existing `CommentEntry` type).

---

## Scheduling

- Keep all four algorithms (`greedy-first-available`, `round-robin`, `balanced-load`, `batch-scheduler`). Admin picks per job / per round.
- Default buffer: **5 minutes**, override per job.
- Advisors excluded from R1 interviewer pool by default (flag on member: `exclude_from_r1: true` auto-set when role includes advisor).
- `prior_team` is a manual override at the applicant level — surface in admin UI, pass as a soft preference to the scheduler.
- **Round 1:** auto-schedule against interviewer availability. One applicant per slot. No cohorts.
- **Round 2:** advisors trigger from candidate page. Two options:
  1. Auto-schedule another round (same algorithms, smaller candidate pool)
  2. Generate a Calendly-style picker link for the candidate
- **Round 3:** "Schedule Follow-Up" button on candidate page → opens the R2-style scheduler modal. No new round entity needed; just `interview.metadata.round = 3`.

---

## Selection & Decisions

- Per-candidate action buttons: **Hire / Reject / Waitlist** (per team).
- Dual-team selection conflict → dashboard flag (banner on dashboard, badge on candidate row).
- Decision triggers email **only if admin has enabled "auto-send decision emails"**. Templates per outcome, editable in settings.

---

## Email & Calendar

- **Resend** is the provider (existing). DNS controlled by user — sending domain configurable per-org in settings.
- Outbound email events: application received, auto-rejected (optional), advanced to interview, interview scheduled, decision (hire/reject/waitlist).
- **Calendar:** ship `.ics` attachments first (already implemented in `src/lib/email/ics.ts`). Spike Google OAuth as a follow-up — see FEATURES.md. Don't block V1 on it.

---

## Observability

- **PostHog** — both product analytics (funnel: apply → submit → interview → decision) and error tracking via PostHog's error tracking. One vendor for V1.

---

## Code conventions (V1-specific additions to root CLAUDE.md)

- New code uses **Svelte 5 runes** (`$state`, `$derived`, `$props`). Don't migrate existing Svelte 4 components unless touching them for V1 reasons.
- All new DB access goes through `src/lib/utils/supabase.ts`. No inline `supabase.from(...)` in components.
- Org-scoping is **mandatory** — every new query filters by `org_id` (or relies on RLS). When in doubt, verify with `is_org_member()`.
- Settings are stored on `organizations.settings` JSONB. Define a TS type `OrgSettings` in `src/lib/types/index.ts` and use it everywhere — never read raw `settings.foo`.
- Migrations are forward-only and additive. Don't consolidate the existing 13; add 14+ for V1 changes.

---

## Out of scope for V1 (explicit)

- Cohort-based group/individual interview pairing (the deck's model)
- Custom rubrics per round
- Modeling eboard↔advisor coordination assignments (offline)
- Video/artifact upload as a *required* field (URL link is fine)
- Self-hosted Docker path (Dockerfile stays in repo, untested)
- Migration consolidation
