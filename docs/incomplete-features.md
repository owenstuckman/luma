# Incomplete & Missing Features

Last audited: 2026-03-12

Overall assessment: **~95% complete** — core ATS workflow is production-ready. The gaps below are secondary features or missing polish.

---

## Feature Status

### Fully Functional

| Feature | Notes |
|---------|-------|
| Application form submission | All 8 question types, localStorage persistence, multi-step |
| Applicant review & filtering | Search, sort, filter by status/job, bulk status updates |
| Applicant comments | Per-applicant comment threads |
| Manual interview creation | Modal on full schedule page, saves to DB |
| Interview calendar views | Week/day/month via @schedule-x |
| Interviewer availability grid | Date/time range selection, save/load |
| Post-interview evaluations | Star ratings, strengths/weaknesses, recommendation |
| Team management | Invite by email, role assign/change/remove |
| Job posting CRUD | Create, edit, toggle active, delete |
| Form builder | Add/remove/reorder steps and questions, all question types |
| CSV export | Applicants (review + admin), schedule (full schedule page) |
| Org settings | Name, slug, colors, email from/reply-to |
| Admin panel (core) | Org CRUD, user management, platform admins, analytics |
| Auth (email/password) | Signup, login, email confirmation |

---

### Partially Implemented

#### 1. Email Notifications
**What works:** Template generation, ICS calendar file generation, notify endpoint proxies to Supabase Edge Function, UI to preview/send emails from schedule page.

**What's missing:**
- Requires `RESEND_API_KEY` in Supabase Edge Function secrets — fails silently if not set
- `email_log` table exists but no UI to view sent email history
- ICS files are generated but not auto-attached to emails (downloadable separately)
- No bounce/delivery status tracking

**Files:** `src/lib/email/`, `supabase/functions/notify-interviews/`, `src/routes/private/[slug]/schedule/notify/+server.ts`

#### 2. Auto-Scheduling Algorithms
**What works:** Four algorithms implemented (greedy-first-available, round-robin, balanced-load, batch-scheduler). Registry pattern, type system, utility functions all solid. Admin panel has a scheduling config UI.

**What's missing:**
- Admin scheduling UI is complex and under-tested — no clear user-facing documentation on how to run it
- Batch scheduler attribute matching rules are rarely exercised
- No scheduling UI on the recruiter-side (`/private/[slug]/schedule/`) — only manual interview creation
- Scheduling preview/apply flow in admin panel needs more testing with real data

**Files:** `src/lib/scheduling/`, `src/routes/admin/+page.svelte` (scheduling tab)

#### 3. Schedule Conflict Detection
**What works:** `violations` type defined, batch scheduler can generate violations during relaxed placement. Migration added for `interviews.violations` column.

**What's missing:**
- Violations are not actively displayed or flagged in the schedule UI
- No real-time conflict check when manually creating interviews
- CSV export doesn't include violations

**Files:** `src/lib/scheduling/algorithms/batch-scheduler.ts`, `src/routes/private/[slug]/schedule/full/+page.svelte`

#### 4. Email Settings
**What works:** `email_settings` JSONB column on `organizations`, UI for `fromEmail` and `replyToEmail` in org settings.

**What's missing:**
- No UI for advanced settings (bounce address, custom templates, send limits)
- No validation that email addresses are verified with the sending provider

**Files:** `src/routes/private/[slug]/settings/+page.svelte`, `supabase/migrations/00010_email_log.sql`

#### 5. Bulk Actions on Review Page
**What works:** Bulk status update, bulk selection via checkboxes.

**What's missing:**
- No bulk email from selection
- No bulk comment/note addition
- No bulk delete from recruiter view (only available in admin panel)

**Files:** `src/routes/private/[slug]/review/+page.svelte`

---

### Not Implemented

#### 1. Password Reset
- No password reset flow exists
- Supabase Auth supports it but no UI/endpoint has been built
- Would need: reset request page, email template config in Supabase dashboard, reset confirmation page

#### 2. Magic Link Auth
- Not implemented — only email/password auth
- Supabase supports it natively; would need a UI toggle on the auth page

#### 3. Organization Logo Upload
- `organizations.logo_url` column exists in DB
- Logo is displayed in applicant-facing pages if URL is set
- No upload UI exists — logo URL can only be set manually in DB or via admin panel text field
- Needs: file upload component, Supabase Storage bucket, upload handler

#### 4. Email Log Viewer
- `email_log` table exists with proper schema (recipient, type, status, error, provider_id)
- Edge Function writes to it on send
- No UI anywhere to view sent emails or delivery status

#### 5. Real-Time Notifications
- No WebSocket/realtime subscriptions for live updates
- Dashboard requires manual refresh to see new applicants
- Supabase Realtime is available but not wired up

---

## Pre-Existing Code Issues

These aren't missing features but are worth addressing:

| Issue | Location | Impact |
|-------|----------|--------|
| 9 TypeScript errors | Various files | `svelte-check` reports type mismatches (null vs undefined, unknown props) |
| Sass deprecation warnings | `lighten()` usage, `@import` | Will break in Dart Sass 3.0 |
| Column naming inconsistency | `interviews.startTime` (camelCase) vs `interviewer_availability.start_time` (snake_case) | Confusing for contributors |
| Silent error swallowing | Multiple `catch` blocks log to console but don't show UI feedback | Users see blank/loading state on failure |
| Svelte 4/5 pattern mixing | Most files use Svelte 4, root layout uses Svelte 5 runes | Should pick one and migrate |

---

## Priority Recommendations

**High priority (blocks common workflows):**
1. Add password reset flow — users will forget passwords
2. Surface email send errors in UI — silent failures are confusing
3. Add real-time conflict check for manual interview creation

**Medium priority (improves experience):**
4. Build email log viewer in settings or schedule page
5. Add logo upload component
6. Document how to use auto-scheduling from admin panel
7. Fix TypeScript errors for clean `svelte-check`

**Low priority (nice to have):**
8. Magic link auth option
9. Realtime subscriptions for dashboard
10. Advanced email settings UI
11. Migrate all components to Svelte 5 runes
