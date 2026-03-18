# TODO

Remaining incomplete items and tech debt.

---

## Features

### Email Notifications (Advanced)
- [ ] Resend webhook endpoint for bounce/delivery status tracking
- [ ] Email address verification with sending provider
- [ ] Advanced email settings UI (bounce address, custom templates, send limits)
- [ ] Scheduled reminder emails (24h before interview via pg_cron)

### Scheduling (Advanced)
- [ ] Custom algorithm editor (paste JS function in browser)
- [ ] Edge Function for cron-triggered auto-scheduling

---

## Tech Debt

- [ ] Fix column naming inconsistency: `interviews.startTime` (camelCase) vs `interviewer_availability.start_time` (snake_case)
- [ ] Migrate remaining Svelte 4 components to Svelte 5 runes
