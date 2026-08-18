# FEATURES.md

Authoritative feature inventory for LUMA V1. Status legend:

- ✅ **Done** — in repo, working, ship as-is
- 🔧 **Partial** — exists but needs work (see TODO.md)
- 🆕 **New** — not built yet
- ⏭️ **Deferred** — V1.1 or later

---

## Platform

| Feature                                            | Status | Notes                                                              |
| -------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Multi-tenant orgs (`organizations`, `org_members`) | ✅     | Slug routing under `/private/[slug]/*` works                       |
| RLS-enforced data isolation                        | ✅     | `is_org_member`, `has_org_role` helpers in migration 00003         |
| Platform admin panel                               | 🔧     | Exists at `/admin` — confirm it covers org provisioning            |
| Org branding (logo, colors)                        | ✅     | `organizations` has `logo_url`, `primary_color`, `secondary_color` |
| Org settings (JSONB)                               | 🔧     | Column exists; need typed `OrgSettings` interface + admin UI       |
| Custom domain per org                              | ⏭️     | V1 ships single domain (`luma.archimedesvt.org`)                   |

## Auth & Roles

| Feature                                       | Status | Notes                                                    |
| --------------------------------------------- | ------ | -------------------------------------------------------- |
| Supabase email/password auth (recruiter side) | ✅     | `/auth`                                                  |
| Org member invites                            | 🔧     | Functions exist (migration 00004) — verify UI            |
| Roles: owner/admin/recruiter/viewer           | ✅     | Existing `OrgRole`                                       |
| Roles: advisor, reviewer, interviewer alias   | 🔧     | `AppRole` + `org_members.roles[]` (00016); UI unenforced |
| Candidate magic-link auth (save & resume)     | 🆕     | Unblocked (Resend); needs the draft send path            |
| Multi-role membership                         | ✅     | `roles text[]` + `has_app_role()` helper (00016)         |

## Applicant Flow

| Feature                                                                  | Status | Notes                                         |
| ------------------------------------------------------------------------ | ------ | --------------------------------------------- |
| Org-slug application URL (`/apply/[slug]/[job_id]`)                      | ✅     | Replaces old `/applicant/*` flow              |
| Dynamic question rendering from JSON schema                              | ✅     | `QuestionRenderer.svelte`                     |
| Question types: input/textarea/radio/checkbox/dropdown/availability/dual | ✅     | All in `QuestionRenderer`                     |
| Team selector (choose 1-N teams to apply to)                             | ✅     | Step 2 of the form when the org has teams     |
| Conditional rendering (per-team questions)                               | ✅     | `visibleSteps()` in `utils/formSchema.ts`     |
| Auto-reject rules per question                                           | 🔧     | Evaluated on submit; move server-side (Ph. 2) |
| Save & resume partial application                                        | 🆕     | DB-backed draft + magic link                  |
| File upload question type                                                | ⏭️     | Supabase Storage buckets exist; defer V1.1    |
| Video link question                                                      | ✅     | Use existing URL input                        |
| Application submission email confirmation                                | 🔧     | Verify Resend wiring                          |

## Review (Manual Reject)

| Feature                                 | Status | Notes                                                  |
| --------------------------------------- | ------ | ------------------------------------------------------ |
| Review page (`/private/[slug]/review`)  | 🔧     | Needs per-reviewer assignment filter (Phase 3)         |
| Blinded reviewer view (hide name/email) | 🔧     | Works; redaction is client-side — move to server load  |
| Fixed reviewer pool assignment per job  | 🆕     | `job_reviewers` table now exists; UI not built yet     |
| Configurable approve/reject thresholds  | ✅     | `OrgSettings.review_thresholds` + `thresholdOutcome()` |
| Approve/reject voting + comments        | ✅     | Vote buttons on candidate page; last vote wins         |
| Weighted average scoring                | ✅     | `org_members.metadata.review_weight`, defaults to 1    |
| Auto-advance on threshold               | 🔧     | Fires on vote; no sweep for bulk-comment crossings     |

## Candidate Profiles

| Feature                                          | Status | Notes                                                                       |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| Org-wide candidate roster (`/[slug]/candidates`) | ✅     | Every applicant across every job, with pipeline stage                       |
| Shared list component                            | ✅     | `CandidateList.svelte`, mounted on `/candidates` and `/review`              |
| Card + table view toggle                         | ✅     | Table adds stage/rating/decision columns                                    |
| Derived pipeline stage                           | ✅     | `deriveStage()` in `src/lib/utils/candidates.ts`                            |
| Candidate timeline on profile page               | ✅     | `getCandidateTimeline()` unions drafts, interviews, evals, decisions, email |
| Dual-team hire conflict flag                     | ✅     | Row flag + roster banner; reads `decisions`                                 |
| Filter roster by job / stage / status            | ✅     | Plus search, sort, CSV export                                               |
| Reviewer-scoped `/review` queue                  | 🔧     | Phase 3 narrows `/review` to the current user's assignments                 |
| Stage transition timestamps                      | 🔧     | `CommentEntry` still has no timestamp, so votes sort last on the timeline   |

## Scheduling

| Feature                                                        | Status | Notes                                               |
| -------------------------------------------------------------- | ------ | --------------------------------------------------- |
| Interviewer availability collection                            | 🔧     | `/private/[slug]/availability` exists               |
| Scheduling algorithms: greedy / round-robin / balanced / batch | ✅     | All four in `src/lib/scheduling/algorithms/`        |
| Algorithm picker per job                                       | 🔧     | Registry exists; verify admin UI exposes it         |
| Configurable buffer time (default 5min)                        | 🆕     | Setting at job or org level                         |
| Exclude advisors from R1 pool                                  | 🆕     | Auto-flag based on role                             |
| `prior_team` manual override                                   | 🆕     | Field on applicant; soft preference in scheduler    |
| Round 2: per-team auto-scheduling                              | 🆕     | Triggered from candidate page                       |
| Round 2: Calendly-style candidate-picks-slot link              | 🆕     | New flow; tokenized URL                             |
| Round 3: "Schedule Follow-Up" button                           | 🆕     | Reuses R2 UI, sets `metadata.round = 3`             |
| Schedule view (full + per-user)                                | ✅     | `/schedule/full`, `/schedule/my`                    |
| Schedule notification batch                                    | 🔧     | `/schedule/notify` exists; verify Resend send works |
| Interview violation tracking                                   | ✅     | Migration 00011                                     |

## Decisions & Selection

| Feature                                        | Status | Notes                |
| ---------------------------------------------- | ------ | -------------------- |
| Per-candidate Hire / Reject / Waitlist buttons | 🆕     | Per team             |
| Dual-team selection conflict flag (dashboard)  | 🆕     | Banner + row badge   |
| Decision-triggered email (admin toggle)        | 🆕     | Per-outcome template |
| Editable decision email templates              | 🆕     | Settings page        |

## Email

| Feature | Status | Notes |
| ------- | ------ | ----- |

**Provider: Resend** (decided 2026-08-16). EmailJS was never installed and is not coming back.

| Feature                                                   | Status | Notes                                                                    |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Resend integration                                        | ✅     | Edge functions `notify-interviews`, `send-reminders`; server-side only   |
| Interview + reminder emails                               | ✅     | `applicantEmail` / `interviewerEmail` in `lib/email/templates.ts`        |
| Application received / auto-rejected / decision templates | ✅     | Added 2026-08-16, 14 assertions covering tone and non-disclosure         |
| Send path for applicant confirmation                      | 🆕     | Unauthenticated at submit — needs a DB webhook or anon-key edge function |
| Decision email send path                                  | 🆕     | Can reuse the JWT-proxied `schedule/notify` pattern                      |
| Per-event send toggles                                    | 🔧     | `OrgSettings.email` exists; not yet wired to the send calls              |
| Email log table                                           | ✅     | Migration 00010 — log every Resend response                              |
| Email webhook handler (`/api/email-webhook`)              | ✅     | Resend-shaped; receives bounces and delivery events                      |
| ICS calendar attachments                                  | ✅     | `lib/email/ics.ts`; Resend supports attachments natively                 |
| Per-org sending domain config                             | 🆕     | Resend Domains + SPF/DKIM; single domain for V1                          |
| Google Calendar OAuth push                                | ⏭️     | Spike post-V1                                                            |

## Admin / Settings

| Feature                                         | Status | Notes                                                      |
| ----------------------------------------------- | ------ | ---------------------------------------------------------- |
| Org settings page (`/private/[slug]/settings`)  | ✅     | Exists                                                     |
| Job posting CRUD                                | 🔧     | `/settings/jobs` exists — verify create/edit/delete        |
| Form builder UI (visual question editor)        | ✅     | `/settings/jobs/[job_id]` — steps, questions, live preview |
| Per-question `team_scope`/`reject_if`/`blinded` | ✅     | Edited in the form builder; unset keys omitted from JSON   |
| Scheduling settings page                        | ✅     | `/settings/scheduling`                                     |
| Email template editor                           | 🆕     | Per-event templates                                        |
| Member management UI                            | 🔧     | Backend functions exist; verify UI                         |

## Observability

| Feature                   | Status | Notes                                  |
| ------------------------- | ------ | -------------------------------------- |
| PostHog product analytics | 🆕     | Apply funnel, time-to-decision metrics |
| PostHog error tracking    | 🆕     | Replaces need for Sentry               |
| Health endpoint           | ✅     | `/api/health`                          |

---

## Deferred to V1.1

- File / video upload question type (Supabase Storage)
- Google Calendar OAuth
- Custom rubric per round
- Self-hosted Docker deployment path
- Multi-domain org hosting
