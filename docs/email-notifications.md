# Email Notifications

## Overview

LUMA sends interview notification emails via a Supabase Edge Function backed by the [Resend](https://resend.com) transactional email API. Emails can be triggered from the recruiter schedule page, the admin scheduling tab, or the review page (bulk email).

---

## Architecture

```
Browser (recruiter/admin)
  └─ POST /private/[slug]/schedule/notify  (SvelteKit server route)
       └─ Invokes Supabase Edge Function: notify-interviews
            └─ Fetches interviews + applicant/interviewer data
            └─ Builds emails from templates
            └─ Attaches .ics calendar invites (optional)
            └─ Sends via Resend API
            └─ Logs results to email_log table
```

---

## Email Types

| Type | Recipient | Trigger |
|---|---|---|
| Interview confirmation | Applicant | After scheduling (manual or auto) |
| Interview schedule | Interviewer | After scheduling (digest of all their interviews) |
| Custom email | Any | Bulk email from review page with `{name}`/`{email}` placeholders |

---

## Sending Emails

### From the Schedule Page

1. Go to **Schedule → Full** (`/private/[slug]/schedule/full`)
2. Click **Send Notification Emails**
3. The `EmailGeneratorModal` opens with tabs:
   - **Applicants** — one email per applicant with their interview details
   - **Interviewers** — one email per interviewer listing all their assigned interviews
4. Edit subject/body per recipient if needed
5. Click **Copy** (for manual paste) or **Send** (via Resend API)

### From Admin Auto-Scheduling

1. Go to **Admin → Scheduling** tab
2. Select org, configure algorithm, click **Preview**
3. Review proposed interviews, then click **Apply Schedule**
4. After applying, click **Send Emails** to open the email modal
5. The modal is pre-loaded with all interviews for the org

### From the Review Page (Bulk Email)

1. Go to **Review** (`/private/[slug]/review`)
2. Select applicants using checkboxes
3. Click **Bulk Email**
4. Compose a message using `{name}` and `{email}` placeholders
5. Click **Send** — emails are sent via the Edge Function with `recipientType: 'custom'`

---

## ICS Calendar Invites

Every notification email automatically attaches a `.ics` calendar file. Recipients can open it to add the interview to Google Calendar, Outlook, Apple Calendar, etc.

The ICS file includes:
- Event title: `Interview – [Job Title] @ [Org Name]`
- Start/end time (UTC)
- Location
- Organizer (org email)
- Attendees (applicant + interviewer)

ICS generation is in `src/lib/email/ics.ts` and `supabase/functions/notify-interviews/index.ts`.

---

## Email Templates

Templates are plain TypeScript functions in two locations:

| File | Environment | Used by |
|---|---|---|
| `src/lib/email/templates.ts` | Browser (SvelteKit) | EmailGeneratorModal preview |
| `supabase/functions/_shared/templates.ts` | Deno (Edge Function) | Actual sending |

Both produce the same output format: `{ subject: string; text: string }`.

### Applicant Template

```
Subject: Your Interview with [Org] — [Date at Time TZ]

Hi [Name],

We're excited to invite you to interview for [Job Title] at [Org Name].

Date:     [Day, Month D, YYYY]
Time:     [H:MM AM/PM] – [H:MM AM/PM] [Timezone]
Location: [Room]
Format:   [Individual / Group]

Please arrive 5 minutes early. Reply to this email if you have any questions.

Best,
[Org Name] Recruiting Team
```

### Interviewer Template

```
Subject: Your Interview Schedule for [Job Title] — [Org]

Hi [Name],

You have [N] interview(s) scheduled for [Job Title] at [Org Name]:

[Table: Time | Applicant | Location | Format]

Please review candidate materials in LUMA before your sessions.

Best,
[Org Name] Recruiting Team
```

---

## Email Log

All sent emails are logged to the `email_log` table:

| Column | Type | Description |
|---|---|---|
| `id` | bigint | Primary key |
| `created_at` | timestamptz | When the email was sent |
| `org_id` | bigint | Organization |
| `interview_id` | bigint | Related interview (nullable for custom emails) |
| `recipient` | text | Recipient email address |
| `type` | text | `applicant_confirmation`, `interviewer_schedule`, or `custom` |
| `provider_id` | text | Resend message ID |
| `status` | text | `sent` or `failed` |
| `error` | text | Error message if failed |

View the email log in **Settings** (`/private/[slug]/settings`) under the "Email Log" section.

---

## Setup

### Environment Variables

Set these as Supabase secrets (`supabase secrets set`):

```
RESEND_API_KEY=re_...
LUMA_FROM_EMAIL=recruiting@yourdomain.com
```

### Per-Org Email Settings

In **Settings** (`/private/[slug]/settings`), configure:
- **From Email** — sender address (must be verified with Resend)
- **Reply-To Email** — where replies go

### Resend Account Setup

1. Create a free account at [resend.com](https://resend.com) (3,000 emails/month free)
2. Add and verify your sending domain (DNS records)
3. Generate an API key
4. Set it as a Supabase secret: `supabase secrets set RESEND_API_KEY=re_...`

### Deploy the Edge Function

```bash
supabase functions deploy notify-interviews
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/email/templates.ts` | Browser-side email template functions |
| `src/lib/email/generate.ts` | Groups interviews by recipient, calls templates |
| `src/lib/email/ics.ts` | ICS calendar file generation |
| `src/lib/components/recruiter/EmailGeneratorModal.svelte` | Email preview/edit/send modal |
| `supabase/functions/notify-interviews/index.ts` | Edge Function: sends emails via Resend |
| `supabase/functions/_shared/templates.ts` | Deno-compatible email templates |
| `src/routes/private/[slug]/schedule/notify/+server.ts` | SvelteKit API route that invokes the Edge Function |
| `supabase/migrations/00010_email_log.sql` | Email log table migration |

---

## Future Enhancements

- Resend webhook endpoint for bounce/delivery status tracking
- Email address verification with sending provider
- Scheduled reminder emails (24h before interview via pg_cron)
- Per-org email templates (custom footer, branding)
- Send rate limiting for large batches
