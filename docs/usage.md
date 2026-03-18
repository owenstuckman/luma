# LUMA Usage Guide

## Overview

LUMA is a multi-tenant Applicant Tracking System. Each **organization** gets its own portal with custom job postings, application forms, and a recruiter dashboard. Applicants apply through public URLs; recruiters manage everything behind authentication.

---

## Route Map

### Public Routes (no auth required)

| Route | Purpose |
|---|---|
| `/` | Landing page — lists all organizations, links to apply or log in |
| `/apply/[slug]` | Job listing for a specific org (e.g. `/apply/archimedes-society`) |
| `/apply/[slug]/[job_id]` | Dynamic application form — multi-step, driven by the job's question JSON |
| `/apply/[slug]/[job_id]/success` | Confirmation page after submitting an application |
| `/auth` | Recruiter login/signup (email + password via Supabase Auth) |

### Authenticated Routes (requires login)

| Route | Purpose |
|---|---|
| `/private` | Org selector — auto-redirects to your dashboard if you belong to one org |
| `/register` | Create a new organization (you become the owner) |
| `/private/[slug]/dashboard` | Recruiter home — stat cards (total, pending, interview, accepted), quick links |
| `/private/[slug]/review` | Applicant list — search, filter by status, sort, bulk actions, CSV export |
| `/private/[slug]/review/candidate?id=N` | Individual applicant — responses, comments, status change |
| `/private/[slug]/schedule/my` | Your upcoming interviews (calendar view) |
| `/private/[slug]/schedule/full` | All interviews across interviewers, filterable by date/interviewer |
| `/private/[slug]/availability` | Submit your interviewer availability |
| `/private/[slug]/evaluate` | Post-interview evaluations — star rating, recommendation, notes |
| `/private/[slug]/settings` | Org settings — profile, colors, team members |
| `/private/[slug]/settings/jobs` | Job posting management — create, toggle active, delete |
| `/private/[slug]/settings/jobs/[job_id]` | Form builder — visually build application form steps and questions |

### Admin Route

| Route | Purpose |
|---|---|
| `/admin` | Platform super-admin — orgs, users, job postings, analytics, platform settings |

---

## User Roles

Each org member has one of these roles:

| Role | Can View | Can Review/Comment | Can Manage Jobs | Can Manage Members/Settings |
|---|---|---|---|---|
| **Viewer** | Yes | No | No | No |
| **Recruiter** | Yes | Yes | No | No |
| **Admin** | Yes | Yes | Yes | Yes |
| **Owner** | Yes | Yes | Yes | Yes (cannot be removed) |

---

## Workflows

### 1. Setting Up a New Organization

1. Go to `/auth` and sign up (or log in)
2. Go to `/register`
3. Enter your org name — the URL slug is auto-generated (e.g. "Archimedes Society" → `archimedes-society`)
4. Click **Create** — you're redirected to your dashboard as the owner

### 2. Creating a Job Posting

1. Go to **Settings → Manage Postings** (`/private/[slug]/settings/jobs`)
2. Click **New Posting** — enter a position name and description
3. Click **Edit Form** on the new posting
4. **Add Steps**: Each step becomes a page in the applicant's form
   - Give it a title (e.g. "Verification", "Free Response")
   - Pick an icon from the grid
5. **Add Questions** to each step:
   - **ID**: unique identifier (e.g. `major`, `why_us`) — used as the key in stored responses
   - **Type**: Text Input, Dual Input, Text Area, Radio, Checkbox, Checkbox with Image, Dropdown, or Availability Grid
   - **Title**: the question text shown to the applicant
   - **Options**: for Radio/Checkbox/Dropdown — enter one per line
   - **Required**: toggle whether the field is mandatory
6. Reorder steps and questions with the up/down arrows
7. Click **Save All Changes**
8. Back on the jobs list, make sure the posting is **Active**

Applicants will see this posting at `/apply/[slug]` and fill out the form at `/apply/[slug]/[job_id]`.

### 3. Inviting Team Members

1. Go to **Settings** (`/private/[slug]/settings`)
2. Under **Team Members**, enter the person's email and select their role
3. Click **Add Member**
4. The person must already have a LUMA account. If not, they need to sign up at `/auth` first.
5. Change roles with the dropdown next to each member
6. Remove members with the × button (owners cannot be removed)

### 4. Reviewing Applicants

1. Go to **Review** (`/private/[slug]/review`)
2. Use the search bar to find applicants by name or email
3. Filter by status: All, Pending, Interview, Accepted, Denied
4. Sort by date, name, or status
5. Use bulk select for mass status updates or CSV export
6. Click an applicant card to see their full application
7. On the candidate page:
   - View all their responses on the left
   - Read and add comments on the right
   - Change their status with the dropdown (Pending → Interview → Accepted/Denied)

### 5. Applicant Experience

1. Applicant visits `/apply/[slug]` and sees a list of open positions
2. Clicks a position → enters the multi-step form
3. **Step 0** (always present): Name and email
4. **Steps 1–N**: Custom questions defined in the form builder
5. **Final step**: Review and submit
6. On submission, the application is stored in the `applicants` table with:
   - `name`, `email`, `recruitInfo` (JSON of all answers keyed by question ID), `job`, `org_id`
7. Applicant sees a success confirmation page

### 6. Scheduling Interviews

#### Setting Interviewer Availability

1. Go to **My Availability** (`/private/[slug]/availability`)
2. The weekly grid shows Mon–Sun, 08:00–20:00
3. Click or drag to paint available time slots (green = available)
4. Click **Save Availability**
5. This data feeds into the auto-scheduler — interviewers without availability are skipped unless no one else is free

#### Manual Scheduling

1. Go to **Schedule → Full** (`/private/[slug]/schedule/full`)
2. Click a time slot on the calendar or use the **Create Interview** button
3. Fill in: applicant, interviewer, date/time, location, type (individual/group)
4. The system warns if there's a time conflict with existing interviews
5. Save — the interview appears on both **My Schedule** and **Full Schedule**

#### Auto-Scheduling (Admin)

1. Go to **Admin** (`/admin`) → **Scheduling** tab
2. Select the organization
3. Choose an algorithm:
   - **Greedy First Available** — fast, assigns first open slot per applicant
   - **Balanced Load** — distributes interviews evenly across interviewers
   - **Round Robin** — strict interviewer rotation
   - **Batch Scheduler** — multi-room, multi-round (for 100+ applicants)
4. Configure: slot duration, break time, max interviews per interviewer, location
5. Click **Preview** to see proposed interviews without saving
6. Review results: proposed matches, unmatched applicants, warnings
7. Click **Apply Schedule** to save all proposed interviews
8. Click **Send Emails** to notify participants (opens the email modal)
9. Use **Clear Auto-Scheduled** to remove all auto-generated interviews (manual interviews are never touched)

**Note:** Applicants who didn't submit availability are treated as available anytime — they'll be matched to any open interviewer slot.

### 7. Sending Email Notifications

#### After Scheduling

1. On the schedule page or admin scheduling tab, click **Send Emails**
2. The email modal shows two tabs: **Applicants** and **Interviewers**
3. Each recipient has a pre-filled email with their interview details
4. Edit subject or body if needed
5. Click **Copy** to copy to clipboard, or **Send** to send via Resend API
6. Emails include `.ics` calendar invites as attachments

#### Bulk Email from Review Page

1. Go to **Review** (`/private/[slug]/review`)
2. Select applicants with checkboxes
3. Click **Bulk Email**
4. Write your message using `{name}` and `{email}` placeholders
5. Click **Send**

#### Email Setup

To enable automated sending (not just copy-paste):
1. Create a [Resend](https://resend.com) account (free tier: 3,000 emails/month)
2. Verify your sending domain in Resend
3. Set the API key as a Supabase secret: `supabase secrets set RESEND_API_KEY=re_...`
4. Deploy the Edge Function: `supabase functions deploy notify-interviews`
5. Configure the From/Reply-To email in **Settings** → email fields

See [email-notifications.md](email-notifications.md) for full details.

### 8. Using the Admin Panel

The admin panel (`/admin`) is for platform super-admins. Access requires being in the `platform_admins` table.

**Tabs:**

| Tab | Features |
|---|---|
| Organizations | View all orgs, create new, edit, delete |
| Users | View all auth users, platform admin management |
| Job Postings | View/manage all job postings across orgs |
| Analytics | Platform-wide stats (orgs, users, applicants, interviews) |
| Scheduling | Auto-scheduling config and execution per org |
| Settings | Platform defaults (colors, maintenance mode) |

---

## Database Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `organizations` | Org profiles | `id`, `name`, `slug`, `primary_color`, `secondary_color`, `owner_id` |
| `org_members` | Who belongs to which org | `org_id`, `user_id`, `role` (owner/admin/recruiter/viewer) |
| `job_posting` | Job listings with form schemas | `org_id`, `name`, `description`, `questions` (JSON), `active_flg` |
| `applicants` | Submitted applications | `org_id`, `job`, `name`, `email`, `recruitInfo` (JSON), `status`, `comments` |
| `interviewers` | People conducting interviews | `org_id`, `name`, `email`, `uuid` |
| `interviews` | Scheduled interviews | `org_id`, `job`, `applicant`, `interviewer`, `startTime`, `endTime`, `location`, `source` |
| `interviewer_availability` | Interviewer available windows | `org_id`, `user_id`, `date`, `start_time`, `end_time`, `timezone` |
| `scheduling_config` | Per-org algorithm config | `org_id`, `job_id`, `algorithm_id`, `config` (JSON) |
| `email_log` | Sent email records | `org_id`, `interview_id`, `recipient`, `type`, `status`, `provider_id` |
| `platform_admins` | Super-admin users | `user_id` |
| `platform_settings` | Global platform config | `key`, `value` |
| `notes` | Interview evaluation notes | `org_id`, `interview_id`, `author`, `content` |

### Key JSON Schemas

**`job_posting.questions`** — defines the application form:
```json
{
  "steps": [
    {
      "title": "Verification",
      "icon": "fi-br-shield-trust",
      "questions": [
        {
          "id": "freshman_check",
          "type": "checkbox",
          "title": "Confirm you are a first-year student.",
          "options": ["I confirm"],
          "required": true
        }
      ]
    }
  ]
}
```

**Supported question types**: `input`, `input_dual`, `textarea`, `radio`, `checkbox`, `checkbox_image`, `dropdown`, `availability`

**`applicants.recruitInfo`** — stores answers keyed by question ID:
```json
{
  "freshman_check": "I confirm",
  "major": "Computer Science",
  "why_us": "I want to build cool things..."
}
```

**`applicants.comments`** — threaded reviewer comments:
```json
{
  "comments": [
    { "id": 1, "email": "reviewer@org.com", "comment": "Strong candidate", "decision": "Approved" }
  ]
}
```

---

## Database Functions (RPC)

These are called via `supabase.rpc()` and run with elevated permissions:

| Function | Purpose | Parameters |
|---|---|---|
| `is_org_member(org_id)` | Check if current user is in the org | `org_id: bigint` |
| `has_org_role(org_id, min_role)` | Check if user has a role ≥ min_role | `org_id: bigint`, `min_role: org_role` |
| `is_platform_admin()` | Check if current user is a platform admin | — |
| `get_org_members_with_email(org_id)` | List members with their emails | `target_org_id: bigint` |
| `invite_member_by_email(org_id, email, role)` | Add a user to an org by email | `target_org_id`, `target_email`, `target_role` |
| `remove_org_member(org_id, user_id)` | Remove a member (not owners) | `target_org_id`, `target_user_id` |
| `update_member_role(org_id, user_id, role)` | Change a member's role | `target_org_id`, `target_user_id`, `new_role` |

---

## Environment Variables

Create `.env.local` in the project root:

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Migrating Existing Data

If you have an existing LUMA instance with data from before multi-tenancy (records with `org_id = NULL`), run this SQL in the Supabase SQL Editor to migrate everything into a new organization:

```sql
-- 1. Create your organization (change name, slug, and owner_id)
INSERT INTO organizations (name, slug, owner_id, primary_color, secondary_color)
VALUES (
  'Your Org Name',
  'your-slug',
  'YOUR_AUTH_USER_UUID',  -- the UUID of the owner from auth.users
  '#ffc800',              -- primary brand color
  '#1a1a2e'               -- secondary brand color
);

-- 2. Add the owner as an org member
INSERT INTO org_members (org_id, user_id, role)
SELECT id, 'YOUR_AUTH_USER_UUID', 'owner'::org_role
FROM organizations WHERE slug = 'your-slug';

-- 3. Assign all orphaned records to the new org
UPDATE job_posting  SET org_id = (SELECT id FROM organizations WHERE slug = 'your-slug') WHERE org_id IS NULL;
UPDATE applicants   SET org_id = (SELECT id FROM organizations WHERE slug = 'your-slug') WHERE org_id IS NULL;
UPDATE interviews   SET org_id = (SELECT id FROM organizations WHERE slug = 'your-slug') WHERE org_id IS NULL;
UPDATE interviewers SET org_id = (SELECT id FROM organizations WHERE slug = 'your-slug') WHERE org_id IS NULL;

-- 4. (Optional) Add existing interviewers as org members
--    Matches interviewer emails to auth.users and assigns the recruiter role
INSERT INTO org_members (org_id, user_id, role)
SELECT DISTINCT
  (SELECT id FROM organizations WHERE slug = 'your-slug'),
  au.id,
  'recruiter'::org_role
FROM interviewers i
JOIN auth.users au ON lower(au.email) = lower(i.email)
WHERE au.id != 'YOUR_AUTH_USER_UUID'
ON CONFLICT DO NOTHING;
```

Replace `YOUR_AUTH_USER_UUID` with the owner's UUID (find it in Supabase → Authentication → Users).
