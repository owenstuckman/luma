# LUMA Email Notifications Plan

## Overview

After interviews are scheduled (manually or via the auto-scheduler), participants need to be notified. This document outlines three complementary approaches in order of implementation complexity:

1. **Copy-paste email generator** — zero-infra, available now; recruiter copies text from the UI
2. **`.ics` calendar file download** — standard calendar invite format; works with any email client
3. **Transactional email sending** — automated delivery via Supabase Edge Function + email API (Resend recommended)

All three approaches share the same data model and template layer, so they can be built incrementally.

---

## Data Available Per Interview

Each row in the `interviews` table (plus joined data) provides:

| Field | Source | Notes |
|---|---|---|
| `startTime` | `interviews.startTime` | ISO datetime |
| `endTime` | `interviews.endTime` | ISO datetime |
| `location` | `interviews.location` | Room name |
| `type` | `interviews.type` | `'individual'` or `'group'` |
| `applicant` | `interviews.applicant` | Applicant email |
| `interviewer` | `interviews.interviewer` | Interviewer email |
| `job` | `interviews.job` → `job_posting.title` | Role name |
| `org_id` | `interviews.org_id` → `organizations.name` | Org name |
| Applicant name | `applicants.recruitInfo.name` or similar | From application JSON |
| Interviewer name | `org_members.full_name` or `auth.users.email` | From org membership |

Group interviews (multiple rows with the same `startTime`/`location`) require deduplication: group by `(startTime, location, applicant)` to build an applicant-centric view, or by `(startTime, location, interviewer)` for an interviewer-centric view.

---

## Approach 1 — Copy-Paste Email Generator

### What it does

After scheduling runs (or any time on the schedule pages), a UI panel generates plain-text or HTML email drafts that a recruiter can copy and paste into their email client. No external services required.

### Where to add it

- **`/private/[slug]/schedule/full`** — "Generate Emails" button opens a modal or side panel
- **`/admin` scheduling tab** — "Preview Emails" step after dry-run, before applying

### UI Flow

```
[Schedule Full Page]
  └─ "Generate Notification Emails" button
       └─ Modal: "Select Recipients"
            ├─ ○ All applicants
            ├─ ○ All interviewers
            ├─ ○ Both
            └─ [Filter by job / date range]
       └─ Generated output panel (tabbed: Applicants | Interviewers)
            ├─ Tab: one collapsed card per recipient
            │    ├─ To: <email>
            │    ├─ Subject: (pre-filled)
            │    ├─ Body: (editable textarea)
            │    └─ [Copy] button
            └─ [Copy All as JSON] for mail-merge tools
```

### Email Templates

Templates are plain TypeScript functions in `src/lib/email/templates.ts`:

```typescript
export function applicantInterviewEmail(params: {
  applicantName: string;
  orgName: string;
  jobTitle: string;
  startTime: Date;
  endTime: Date;
  location: string;
  type: 'individual' | 'group';
  interviewerNames: string[];  // empty for applicant emails (optional)
  timezone: string;
}): { subject: string; text: string; html: string }
```

**Applicant email — subject:**
```
Your Interview with [Org Name] — [Day, Month D, YYYY at H:MM AM/PM tz]
```

**Applicant email — body (text):**
```
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

**Interviewer email — body (text):**
```
Hi [Name],

You have [N] interview(s) scheduled for [Job Title] at [Org Name].

[Table: Time | Applicant | Location | Format]

Please review candidate materials in LUMA before your sessions.

Best,
[Org Name] Recruiting Team
```

### Implementation Files

```
src/lib/email/
  templates.ts          — template functions (text + HTML variants)
  generate.ts           — aggregate interviews → per-recipient email objects

src/lib/components/recruiter/
  EmailGeneratorModal.svelte   — modal UI (copy-paste panel)
```

---

## Approach 2 — `.ics` Calendar File Download

### What it does

Generates standard iCalendar (`.ics`) files that users import into Google Calendar, Outlook, Apple Calendar, etc. Can be generated per-interview, per-person (all their interviews in one file), or as a batch ZIP.

### iCalendar format overview

An `.ics` file is a plain-text RFC 5545 document:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//LUMA ATS//EN
BEGIN:VEVENT
UID:<unique-id>@luma
DTSTART:20251015T180000Z
DTEND:20251015T182000Z
SUMMARY:Interview – Software Engineer @ Archimedes
DESCRIPTION:Individual interview. Location: MCB230.
LOCATION:MCB230
ORGANIZER;CN=Archimedes Recruiting:mailto:recruiting@archimedes.org
ATTENDEE;CN=Jane Doe;RSVP=TRUE:mailto:jane@example.com
END:VEVENT
END:VCALENDAR
```

Key fields:
- `UID` — must be globally unique; use `crypto.randomUUID()` or `${interview.id}@luma`
- `DTSTART`/`DTEND` — UTC timestamps (`YYYYMMDDTHHMMSSZ`)
- `ORGANIZER` — the org's recruiting email (configurable per org)
- `ATTENDEE` — each participant; triggers calendar invites when emailed as attachment

### UI Flow

```
Schedule pages / Email Generator Modal
  └─ "Download .ics" section
       ├─ [Download All Applicant Invites (.zip)]
       ├─ [Download All Interviewer Invites (.zip)]
       └─ Per-row: [↓] button on each interview card → single .ics
```

### Implementation

**`src/lib/email/ics.ts`** — pure functions, no dependencies needed:

```typescript
export function interviewToVEvent(interview: {
  id: number;
  startTime: string;
  endTime: string;
  location: string;
  type: string;
  applicantEmail: string;
  applicantName: string;
  interviewerEmail: string;
  interviewerName: string;
  jobTitle: string;
  orgName: string;
  organizerEmail: string;
}): string

export function buildICSFile(vevents: string[]): string

export function downloadICS(filename: string, content: string): void
// uses: URL.createObjectURL(new Blob([content], { type: 'text/calendar' }))
```

**Batch ZIP download** uses the `JSZip` package (already a common front-end dep, or add it):

```typescript
// For each recipient, one .ics file with all their VEVENTs
// Zip: applicants/jane@example.com.ics, interviewers/john@org.com.ics
```

**Group interview deduplication:** group rows by `(startTime, location, applicant)` before generating VEVENTs to avoid duplicate calendar entries.

---

## Approach 3 — Automated Email Sending (Supabase Edge Function)

### What it does

Sends emails automatically after interviews are confirmed (applied) or on a scheduled trigger. Integrates with a transactional email API. Recruiters can also trigger sends manually from the UI.

### Recommended email provider: Resend

- Free tier: 3,000 emails/month, 100/day
- Official Supabase integration with Deno-compatible SDK
- Simple API; supports HTML + plain text
- Built-in webhook for delivery tracking
- Alternatives: SendGrid, Postmark, AWS SES

### Architecture

```
Browser (recruiter clicks "Send Emails")
  └─ POST /api/notify-interviews  (SvelteKit server route)
       └─ Validates session + org membership
       └─ Calls Supabase Edge Function: notify-interviews
            └─ Fetches interviews from DB
            └─ Builds emails from templates (shared templates.ts)
            └─ Calls Resend API
            └─ Logs results to new table: email_log
```

Alternatively, the Edge Function can be triggered by a Supabase Database Webhook on `interviews` INSERT (send on scheduling apply).

### New Database Table: `email_log`

```sql
CREATE TABLE public.email_log (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at  timestamptz DEFAULT now(),
  org_id      bigint REFERENCES organizations(id),
  interview_id bigint REFERENCES interviews(id),
  recipient   text NOT NULL,       -- email address
  type        text NOT NULL,       -- 'applicant_confirmation' | 'interviewer_schedule' | 'reminder'
  provider_id text,                -- Resend message ID for tracking
  status      text DEFAULT 'sent', -- 'sent' | 'failed' | 'bounced'
  error       text
);

-- RLS: org members can select; edge function service role inserts
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view email log"
  ON public.email_log FOR SELECT
  USING (is_org_member(org_id));
```

### Edge Function: `notify-interviews`

**File:** `supabase/functions/notify-interviews/index.ts`

```typescript
import { Resend } from 'npm:resend';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applicantInterviewEmail, interviewerScheduleEmail } from '../_shared/templates.ts';

// Request body:
// { orgId: number, jobId?: number, recipientType: 'applicants' | 'interviewers' | 'both', interviewIds?: number[] }

Deno.serve(async (req) => {
  // 1. Auth: verify JWT, check org membership
  // 2. Fetch interviews (+ applicant names, interviewer names, job title, org name)
  // 3. Group by recipient
  // 4. Build email per recipient using shared templates
  // 5. Send via Resend
  // 6. Log results to email_log
  // 7. Return { sent: N, failed: M, errors: [...] }
});
```

**Shared templates** live in `supabase/functions/_shared/templates.ts` (same logic as `src/lib/email/templates.ts`; Deno-compatible, no Node APIs).

### Environment Variables (Supabase Secrets)

```
RESEND_API_KEY=re_...
LUMA_FROM_EMAIL=recruiting@yourdomain.com   # or per-org from organizations table
```

### Sending Triggers

| Trigger | When | Type |
|---|---|---|
| Manual "Send Emails" button | Recruiter clicks after scheduling | Confirmation |
| Auto on scheduling apply | `interviews` INSERT webhook | Confirmation |
| Scheduled reminder (cron) | 24h before interview start | Reminder |
| Manual re-send | Recruiter selects specific interviews | Confirmation |

For the cron reminder, add a Supabase cron job (pg_cron):

```sql
-- Run daily at 8 AM ET, send reminders for interviews starting in 24h
SELECT cron.schedule(
  'interview-reminders',
  '0 12 * * *',  -- 8 AM ET = 12:00 UTC
  $$
    SELECT net.http_post(
      url := current_setting('app.edge_function_url') || '/notify-interviews',
      body := '{"reminderMode": true}'::jsonb
    );
  $$
);
```

---

## Email Template Content Reference

### Types of emails

| Email type | Recipient | Trigger |
|---|---|---|
| `applicant_confirmation` | Applicant | After scheduling |
| `interviewer_schedule` | Interviewer | After scheduling (digest: all their interviews) |
| `applicant_reminder` | Applicant | 24h before interview |
| `interviewer_reminder` | Interviewer | 24h before interview |

### Template parameters (derived from DB)

```typescript
interface ApplicantConfirmationParams {
  applicantName: string;
  orgName: string;
  jobTitle: string;
  interviews: {         // applicant may have multiple rounds
    startTime: Date;
    endTime: Date;
    location: string;
    type: 'individual' | 'group';
    timezone: string;
  }[];
  replyToEmail: string;
}

interface InterviewerScheduleParams {
  interviewerName: string;
  orgName: string;
  jobTitle: string;
  interviews: {
    startTime: Date;
    endTime: Date;
    location: string;
    applicantName: string;
    applicantEmail: string;
    type: 'individual' | 'group';
  }[];
}
```

---

## Implementation Phases

### Phase 1 — Copy-Paste Generator (no external deps)

- [ ] `src/lib/email/templates.ts` — text/HTML template functions
- [ ] `src/lib/email/generate.ts` — group interviews by recipient, call templates
- [ ] `src/lib/components/recruiter/EmailGeneratorModal.svelte` — UI modal
- [ ] Wire into `/private/[slug]/schedule/full` and admin scheduling tab

**Estimated scope:** ~3 files, ~400 lines

### Phase 2 — `.ics` Download

- [ ] `src/lib/email/ics.ts` — `interviewToVEvent`, `buildICSFile`, `downloadICS`
- [ ] Add ZIP batch download (add `jszip` to `package.json` if not present)
- [ ] Add download buttons to `EmailGeneratorModal.svelte` (extend Phase 1 modal)

**Estimated scope:** ~1 new file, ~150 lines; 1 dependency

### Phase 3 — Automated Sending

- [ ] Create `email_log` table + migration (`00010_email_log.sql`)
- [ ] `supabase/functions/_shared/templates.ts` — Deno-compatible templates (or port from Phase 1)
- [ ] `supabase/functions/notify-interviews/index.ts` — Edge Function
- [ ] SvelteKit API route: `src/routes/private/[slug]/schedule/notify/+server.ts`
- [ ] Add "Send Emails" button to schedule full page (calls API route)
- [ ] Set Supabase secrets: `RESEND_API_KEY`, `LUMA_FROM_EMAIL`
- [ ] (Optional) Database webhook to auto-send on `bulkCreateInterviews`
- [ ] (Optional) pg_cron reminder job

**Estimated scope:** ~4 new files; requires Resend account + DNS setup for custom sender domain

---

## Per-Org Configuration

Add an `email_settings` column (or separate table) to `organizations`:

```typescript
interface OrgEmailSettings {
  fromEmail: string;       // "Archimedes Recruiting <recruiting@archimedes.vt.edu>"
  replyToEmail: string;
  sendOnSchedule: boolean; // auto-send when scheduling is applied
  reminderHoursBefore: number; // 0 = disabled
  emailFooter: string;     // org-specific footer text
}
```

Store as `organizations.email_settings jsonb`. Editable in `/private/[slug]/settings`.

---

## Notes and Caveats

- **Group interview rows**: The `interviews` table stores one row per (applicant, interviewer) pair. Before generating emails, deduplicate by grouping on `(startTime, location, applicant)` to build applicant-centric views.
- **Timezone handling**: `interviewer_availability` stores a `timezone` field per availability entry. Standardize on UTC storage (`startTime` ISO strings in DB) and format for display using the org or user's preferred timezone (default `America/New_York`).
- **Applicant names**: Currently stored in `applicants.recruitInfo` as a JSON blob. The template layer needs a helper to extract `name` from the question map — or a dedicated `name` column can be added to `applicants`.
- **Bounces and delivery**: Phase 3 logs provider message IDs. Wire Resend webhooks to a `/api/email-webhook` endpoint to update `email_log.status` on bounce/open events.
- **Unmatched applicants**: Consider a separate email type `applicant_unmatched` — notifies applicants who could not be scheduled, prompting them to contact recruiting directly.
- **Rate limits**: For 400+ applicants, send in batches (Resend supports up to 100 recipients per API call via BCC, or use their batch endpoint).
