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

---

## Critical — Validation & Error Handling
- [ ] **Application form validation** — Require first name, last name, and email on step 0 before advancing. Validate email format. (`src/routes/apply/[slug]/[job_id]/+page.svelte`)
- [ ] **Slug uniqueness check on org create** — Check slug availability before submission, show clear error on collision (`src/routes/register/+page.svelte`)
- [ ] **Global error page** — Add `src/routes/+error.svelte` for 404/500 fallback instead of blank screens
- [ ] **Email send failure clarity** — Distinguish "dry run (no API key)" from "emails sent" in the UI. Show warning badge when RESEND_API_KEY is missing (`EmailGeneratorModal.svelte`, review page bulk email)
- [ ] **Prevent scheduling interviews in the past** — Validate start time is in the future on manual interview creation (`src/routes/private/[slug]/schedule/full/+page.svelte`)

## High Priority — UX & Polish
- [ ] **Loading skeletons** — Add loading states to landing page, dashboard, review, schedule, and settings pages instead of blank-then-content flash
- [ ] **Pagination on applicant lists** — Review page and admin applicants tab need pagination for orgs with 500+ applicants
- [ ] **Availability grid: future weeks** — Allow interviewers to set availability for upcoming weeks, not just the current week (`src/routes/private/[slug]/availability/+page.svelte`)
- [ ] **Mobile responsive layouts** — Application form needs mobile progress indicator (sidebar hidden on small screens). Recruiter sidebar should collapse to hamburger menu on mobile.
- [ ] **Auth page loading state** — Show spinner while checking auth in `/private/+layout.svelte` instead of blank screen

## Medium Priority — Features
- [ ] **Evaluation summary per candidate** — Aggregate evaluations from all interviewers on the candidate review page (average rating, recommendation consensus)
- [ ] **Bulk schedule ICS export** — Download a single .ics file with all interviews for the org (useful for importing into Google Calendar / Outlook)
- [ ] **Form builder preview** — Show a live preview of the application form while editing questions in the job editor (`src/routes/private/[slug]/settings/jobs/[job_id]/+page.svelte`)
- [ ] **Comment decision vocabulary consistency** — Standardize decision labels across review page ("pending/interview/accepted/denied") and candidate page ("Pending/Approved/Rejected")
- [ ] **Admin panel component split** — Break the 2000+ line admin page into sub-components (one per tab) for maintainability

## Low Priority — Nice-to-Have
- [ ] **Accessibility** — Add ARIA labels to interactive elements, ensure color contrast meets WCAG AA, add keyboard navigation for modals and calendar
- [ ] **Migrate remaining Svelte 4 components to Svelte 5 runes** — Cosmetic; everything works as-is
- [ ] **Unused dependency cleanup** — Remove `mdsvex` (not used in routes), evaluate if both `adapter-node` and `adapter-vercel` are needed
- [ ] **Rate limiting** — Add basic rate limiting on auth endpoints and public application submission
- [ ] **Health check endpoint** — Add `/api/health` for Docker/monitoring (`Dockerfile` has no HEALTHCHECK)
