# TODO

---

## Human To-Do

Tasks that require manual setup, accounts, or configuration — not code changes.

### Email Setup (Required for sending)
- [ ] **Resend account setup** — Create a [Resend](https://resend.com) account, verify sending domain, generate API key
- [ ] **Set Supabase secrets** — `supabase secrets set RESEND_API_KEY=re_...`
- [ ] **Deploy Edge Functions** — `supabase functions deploy notify-interviews` and `supabase functions deploy send-reminders`
- [ ] **Configure email settings per org** — Set From/Reply-To email in each org's Settings page
- [ ] **Test email sending** — Verify end-to-end after Edge Function is deployed (use "Send Emails" button on Full Schedule page or Settings → Auto-Scheduling)

### Webhook & Reminders (Optional)
- [ ] **Set up Resend webhook** — Point Resend delivery webhooks to `https://<your-domain>/api/email-webhook` for bounce/delivery tracking
- [ ] **Set up pg_cron for reminders** — Schedule the `send-reminders` Edge Function to run daily:
  ```sql
  SELECT cron.schedule('send-interview-reminders', '0 8 * * *',
    $$SELECT net.http_post(
      url := '<SUPABASE_URL>/functions/v1/send-reminders',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
      body := '{}'::jsonb
    )$$);
  ```
- [ ] **Set `PRIVATE_SUPABASE_SERVICE_KEY` env var** — For the webhook endpoint to bypass RLS when updating email_log (optional — works without it if email_log has permissive policies)

### Deployment
- [ ] **Configure production environment** — Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in Vercel/hosting env vars
- [ ] **Set up custom domain** — Point domain to Vercel deployment
- [ ] **Run migrations on production** — Apply all `supabase/migrations/*.sql` files to production Supabase project (including `00013_rename_interview_columns.sql`)

---

## Code To-Do

Features and tech debt that require code changes.

### Completed Features ✅
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
- [x] Column naming consistency: `interviews.start_time` / `end_time` (snake_case, matching `interviewer_availability`)

### Remaining (Nice-to-Have)
- [ ] Migrate remaining Svelte 4 components to Svelte 5 runes (cosmetic — everything works as-is)
