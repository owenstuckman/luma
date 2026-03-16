# TODO

Remaining incomplete items and tech debt.

---

## Incomplete Features

### Email Notifications
- [ ] Add Resend webhook endpoint for bounce/delivery status tracking
- [ ] Validate that email addresses are verified with the sending provider
- [ ] Advanced email settings UI (bounce address, custom templates, send limits)

**Files:** `src/lib/email/`, `supabase/functions/notify-interviews/`, `src/routes/private/[slug]/schedule/notify/+server.ts`, `src/routes/private/[slug]/settings/+page.svelte`

### Auto-Scheduling
- [ ] Document how to use auto-scheduling from admin panel
- [ ] Build recruiter-side scheduling UI (beyond manual interview creation)
- [ ] Test scheduling preview/apply flow in admin panel with real data
- [ ] Exercise batch scheduler attribute matching rules

**Files:** `src/lib/scheduling/`, `src/routes/admin/+page.svelte` (scheduling tab)

---

## Tech Debt

- [ ] Fix Sass deprecation warnings (`lighten()` usage, `@import`) — will break in Dart Sass 3.0
- [ ] Fix column naming inconsistency: `interviews.startTime` (camelCase) vs `interviewer_availability.start_time` (snake_case)
- [ ] Migrate all components from Svelte 4 patterns to Svelte 5 runes (currently mixed)
