# TODO

Remaining incomplete items and tech debt.

---

## Incomplete Features

### Email Notifications
- [ ] Add Resend webhook endpoint for bounce/delivery status tracking
- [ ] Validate that email addresses are verified with the sending provider
- [ ] Advanced email settings UI (bounce address, custom templates, send limits)
- [ ] Scheduled reminder emails (24h before interview via pg_cron)

**Files:** `src/lib/email/`, `supabase/functions/notify-interviews/`, `src/routes/private/[slug]/schedule/notify/+server.ts`

### Scheduling Enhancements
- [ ] Relaxed constraint second pass (schedule unmatched with flagged violations)
- [ ] Attribute-based matching (pair applicants with interviewers by team/preference)
- [ ] Applicant priority weighting
- [ ] Custom algorithm editor (paste JS function in browser)
- [ ] Edge Function for cron-triggered auto-scheduling

**Files:** `src/lib/scheduling/`, see [scheduling-enhancements.md](scheduling-enhancements.md) for full plan

---

## Tech Debt

- [ ] Fix Sass deprecation warnings (`lighten()` usage, `@import`) — will break in Dart Sass 3.0
- [ ] Fix column naming inconsistency: `interviews.startTime` (camelCase) vs `interviewer_availability.start_time` (snake_case)
- [ ] Migrate all components from Svelte 4 patterns to Svelte 5 runes (currently mixed)
