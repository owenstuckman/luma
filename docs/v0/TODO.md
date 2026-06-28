# TODO

Tasks that require manual setup, accounts, or configuration.

## Email Setup (Required for sending)
- [ ] **Resend account setup** — Create a [Resend](https://resend.com) account, verify sending domain, generate API key
- [ ] **Set Supabase secrets** — `supabase secrets set RESEND_API_KEY=re_...`
- [ ] **Deploy Edge Functions** — `supabase functions deploy notify-interviews` and `supabase functions deploy send-reminders`
- [ ] **Configure email settings per org** — Set From/Reply-To email in each org's Settings page
- [ ] **Test email sending** — Verify end-to-end after Edge Function is deployed (use "Send Emails" on Full Schedule or Settings → Auto-Scheduling)

## Webhook & Reminders (Optional)
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
- [ ] **Set `PRIVATE_SUPABASE_SERVICE_KEY` env var** — For the webhook endpoint to bypass RLS when updating email_log

## Deployment
- [ ] **Configure production environment** — Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in Vercel/hosting env vars
- [ ] **Set up custom domain** — Point domain to Vercel deployment
- [ ] **Run migrations on production** — Apply all `supabase/migrations/*.sql` files (including `00013_rename_interview_columns.sql`)

## Testing & QA
- [ ] **Test org creation flow** — Create a new org, verify slug uniqueness error is shown clearly
- [ ] **Test application flow on mobile** — Verify multi-step form works without sidebar
- [ ] **Test scheduling end-to-end** — Set availability → run auto-schedule → preview → apply → send emails
- [ ] **Verify color contrast** — Check yellow primary on white meets WCAG AA (especially buttons, badges)
- [ ] **Test with large dataset** — Load 500+ applicants and verify review page doesn't lag without pagination
