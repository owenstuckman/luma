# Code TODO

Features and tech debt that require code changes.

## Completed ✅
- [x] Multi-tenant organizations with RLS
- [x] Self-service org signup flow (homepage → auth → register)
- [x] Dynamic application forms with question builder (8 question types)
- [x] Applicant review with bulk actions (status, delete, comment, email)
- [x] Candidate detail page with comment thread
- [x] Interview scheduling — 4 algorithms (greedy, round-robin, balanced-load, batch)
- [x] Batch scheduler: multi-room, multi-round, relaxed fallback, attribute matching, priority
- [x] Calendar integration on schedule pages (@schedule-x)
- [x] Interview conflict detection on manual creation
- [x] Evaluation scoring form (star rating, strengths/weaknesses, recommendation)
- [x] Interviewer availability grid
- [x] Email notification system (Edge Function + Resend API + ICS calendar attachments)
- [x] Email preview/edit modal with select-all ICS download
- [x] Email log viewer in org settings
- [x] Org-level auto-scheduling page (Settings → Auto-Scheduling)
- [x] Admin panel with analytics, CRUD, scheduling, platform settings
- [x] Organization logo upload (Supabase Storage)
- [x] Team member management with role-based access
- [x] CSV export on review and schedule pages
- [x] Realtime notifications for new applicants and interview changes
- [x] Flagged interview filtering (constraint violations)
- [x] Resend webhook endpoint for bounce/delivery status tracking (`/api/email-webhook`)
- [x] Scheduled reminder email Edge Function (`send-reminders`)
- [x] Column naming consistency: `interviews.start_time` / `end_time` (snake_case)
- [x] Application form validation — first/last name + email required on step 0, email format validated
- [x] Slug uniqueness check on org create — debounced live check + collision error on submit
- [x] Global error page — `src/routes/+error.svelte` handles 404/500/generic with back-to-home action
- [x] Email send failure clarity — dry run warning banner, RESEND_API_KEY hint shown
- [x] Prevent scheduling interviews in the past — start time validated on manual creation
- [x] Loading skeletons — dashboard and review pages already had skeleton states
- [x] Pagination on applicant lists — review page already had pagination (PAGE_SIZE=50)
- [x] Availability grid: future weeks — already implemented with prev/next week navigation (weekOffset)
- [x] Auth page loading state — auth guard in hooks.server.ts handles redirect server-side
- [x] Mobile responsive layouts — progress bar added to applicant form; hamburger drawer added to recruiter sidebar
- [x] Evaluation summary per candidate — shows avg rating, recommendation breakdown, and individual eval details
- [x] Form builder preview — Preview button in job editor renders all form steps read-only
- [x] Comment decision vocabulary consistency — candidate page now uses pending/interview/accepted/denied
- [x] Admin panel component split — 2514-line admin page split into 8 tab components in `src/lib/components/admin/`
- [x] Accessibility — aria-labels on icon buttons, aria-live on toasts, aria-modal on dialogs
- [x] Unused dependency cleanup — removed `mdsvex` from package.json and svelte.config.js
- [x] Health check endpoint — `/api/health` endpoint added; Dockerfile HEALTHCHECK added
- [x] Fix Switch Org button — `/private?force=true` bypasses single-org auto-redirect

---

## Remaining — Low Priority / Future

- [ ] **Rate limiting** — Add basic rate limiting on auth endpoints and public application submission
- [ ] **Migrate remaining Svelte 4 components to Svelte 5 runes** — Cosmetic; everything works as-is
- [ ] **Bulk schedule ICS export** — Download a single combined .ics file for all interviews (ZIP download already exists; single-file merge is a minor addition)
