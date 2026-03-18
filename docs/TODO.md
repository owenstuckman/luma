# TODO

---

## Human To-Do

Tasks that require manual setup, accounts, or configuration — not code changes.

- [ ] **Resend account setup** — Create a [Resend](https://resend.com) account, verify sending domain, generate API key
- [ ] **Set Supabase secrets** — `supabase secrets set RESEND_API_KEY=re_...` and `LUMA_FROM_EMAIL=...`
- [ ] **Deploy Edge Function** — `supabase functions deploy notify-interviews`
- [ ] **Configure email settings per org** — Set From/Reply-To email in org Settings page
- [ ] **Test email sending** — Verify the "Send Emails" button works end-to-end after Edge Function is deployed
- [ ] **Set up Resend webhook** (optional) — Point Resend delivery webhooks to a `/api/email-webhook` endpoint for bounce tracking
- [ ] **Set up pg_cron** (optional) — Configure scheduled reminder emails 24h before interviews

---

## Code To-Do

Features and tech debt that require code changes.

### Email Notifications (Advanced)
- [ ] Resend webhook endpoint for bounce/delivery status tracking (`/api/email-webhook`)
- [ ] Email address verification check before sending
- [ ] Advanced email settings UI (custom templates, send limits)
- [ ] Scheduled reminder email Edge Function + pg_cron trigger

### Scheduling (Advanced)
- [ ] Custom algorithm editor (paste JS function in browser, sandboxed execution)
- [ ] Edge Function for cron-triggered auto-scheduling

### Tech Debt
- [ ] Fix column naming inconsistency: `interviews.startTime` (camelCase) vs `interviewer_availability.start_time` (snake_case)
- [ ] Migrate remaining Svelte 4 components to Svelte 5 runes
