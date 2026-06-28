# FEATURES.md

Authoritative feature inventory for LUMA V1. Status legend:
- ✅ **Done** — in repo, working, ship as-is
- 🔧 **Partial** — exists but needs work (see TODO.md)
- 🆕 **New** — not built yet
- ⏭️ **Deferred** — V1.1 or later

---

## Platform

| Feature | Status | Notes |
|---|---|---|
| Multi-tenant orgs (`organizations`, `org_members`) | ✅ | Slug routing under `/private/[slug]/*` works |
| RLS-enforced data isolation | ✅ | `is_org_member`, `has_org_role` helpers in migration 00003 |
| Platform admin panel | 🔧 | Exists at `/admin` — confirm it covers org provisioning |
| Org branding (logo, colors) | ✅ | `organizations` has `logo_url`, `primary_color`, `secondary_color` |
| Org settings (JSONB) | 🔧 | Column exists; need typed `OrgSettings` interface + admin UI |
| Custom domain per org | ⏭️ | V1 ships single domain (`luma.archimedesvt.org`) |

## Auth & Roles

| Feature | Status | Notes |
|---|---|---|
| Supabase email/password auth (recruiter side) | ✅ | `/auth` |
| Org member invites | 🔧 | Functions exist (migration 00004) — verify UI |
| Roles: owner/admin/recruiter/viewer | ✅ | Existing `OrgRole` |
| Roles: advisor, reviewer, interviewer alias | 🆕 | Extend `OrgRole` or add a parallel roles array |
| Candidate magic-link auth (save & resume) | 🆕 | Supabase magic links — new |
| Multi-role membership | 🆕 | A user can be advisor + interviewer; design array column |

## Applicant Flow

| Feature | Status | Notes |
|---|---|---|
| Org-slug application URL (`/apply/[slug]/[job_id]`) | ✅ | Replaces old `/applicant/*` flow |
| Dynamic question rendering from JSON schema | ✅ | `QuestionRenderer.svelte` |
| Question types: input/textarea/radio/checkbox/dropdown/availability/dual | ✅ | All in `QuestionRenderer` |
| Team selector (choose 1-N teams to apply to) | 🆕 | First step of every multi-team form |
| Conditional rendering (per-team questions) | 🆕 | Extend schema with `team_scope` |
| Auto-reject rules per question | 🆕 | `reject_if` on question; server-eval on submit |
| Save & resume partial application | 🆕 | DB-backed draft + magic link |
| File upload question type | ⏭️ | Supabase Storage buckets exist; defer V1.1 |
| Video link question | ✅ | Use existing URL input |
| Application submission email confirmation | 🔧 | Verify Resend wiring |

## Review (Manual Reject)

| Feature | Status | Notes |
|---|---|---|
| Review page (`/private/[slug]/review`) | 🔧 | UI exists; needs blinded mode + threshold logic |
| Blinded reviewer view (hide name/email) | 🆕 | Toggle per-org in `OrgSettings` |
| Fixed reviewer pool assignment per job | 🆕 | New table or `job_posting.metadata.reviewers` |
| Configurable approve/reject thresholds | 🆕 | Per-org or per-job setting |
| Approve/reject voting + comments | 🔧 | `CommentEntry` exists; wire to vote tally |
| Weighted average scoring | 🆕 | Per-interviewer weight to normalize harsh/easy graders |
| Auto-advance on threshold | 🆕 | Trigger or scheduled job |

## Scheduling

| Feature | Status | Notes |
|---|---|---|
| Interviewer availability collection | 🔧 | `/private/[slug]/availability` exists |
| Scheduling algorithms: greedy / round-robin / balanced / batch | ✅ | All four in `src/lib/scheduling/algorithms/` |
| Algorithm picker per job | 🔧 | Registry exists; verify admin UI exposes it |
| Configurable buffer time (default 5min) | 🆕 | Setting at job or org level |
| Exclude advisors from R1 pool | 🆕 | Auto-flag based on role |
| `prior_team` manual override | 🆕 | Field on applicant; soft preference in scheduler |
| Round 2: per-team auto-scheduling | 🆕 | Triggered from candidate page |
| Round 2: Calendly-style candidate-picks-slot link | 🆕 | New flow; tokenized URL |
| Round 3: "Schedule Follow-Up" button | 🆕 | Reuses R2 UI, sets `metadata.round = 3` |
| Schedule view (full + per-user) | ✅ | `/schedule/full`, `/schedule/my` |
| Schedule notification batch | 🔧 | `/schedule/notify` exists; verify Resend send works |
| Interview violation tracking | ✅ | Migration 00011 |

## Decisions & Selection

| Feature | Status | Notes |
|---|---|---|
| Per-candidate Hire / Reject / Waitlist buttons | 🆕 | Per team |
| Dual-team selection conflict flag (dashboard) | 🆕 | Banner + row badge |
| Decision-triggered email (admin toggle) | 🆕 | Per-outcome template |
| Editable decision email templates | 🆕 | Settings page |

## Email

| Feature | Status | Notes |
|---|---|---|
| Resend integration | 🔧 | `src/lib/email/generate.ts` exists; verify env vars |
| Email log table | ✅ | Migration 00010 |
| Email webhook handler (`/api/email-webhook`) | ✅ | Resend events |
| ICS calendar attachments | ✅ | `src/lib/email/ics.ts` |
| Per-org sending domain config | 🆕 | DNS records via Resend |
| Google Calendar OAuth push | ⏭️ | Spike post-V1 |

## Admin / Settings

| Feature | Status | Notes |
|---|---|---|
| Org settings page (`/private/[slug]/settings`) | ✅ | Exists |
| Job posting CRUD | 🔧 | `/settings/jobs` exists — verify create/edit/delete |
| Form builder UI (visual question editor) | 🆕 | Biggest new build — drives everything |
| Scheduling settings page | ✅ | `/settings/scheduling` |
| Email template editor | 🆕 | Per-event templates |
| Member management UI | 🔧 | Backend functions exist; verify UI |

## Observability

| Feature | Status | Notes |
|---|---|---|
| PostHog product analytics | 🆕 | Apply funnel, time-to-decision metrics |
| PostHog error tracking | 🆕 | Replaces need for Sentry |
| Health endpoint | ✅ | `/api/health` |

---

## Deferred to V1.1

- File / video upload question type (Supabase Storage)
- Google Calendar OAuth
- Custom rubric per round
- Self-hosted Docker deployment path
- Multi-domain org hosting
