# LUMA Usage Guide

## Overview

LUMA is a multi-tenant Applicant Tracking System. Each **organization** gets its own portal with custom job postings, application forms, and a recruiter dashboard. Applicants apply through public URLs; recruiters manage everything behind authentication.

---

## Route Map

### Public Routes (no auth required)

| Route | Purpose |
|---|---|
| `/` | Landing page — lists all organizations, links to apply or log in |
| `/apply/:slug` | Job listing page for a specific org (e.g. `/apply/archimedes`) |
| `/apply/:slug/:job_id` | Dynamic application form — multi-step, driven by the job's question JSON |
| `/apply/:slug/:job_id/success` | Confirmation page after submitting an application |
| `/auth` | Recruiter login/signup (email + password via Supabase Auth) |

### Authenticated Routes (requires login)

| Route | Purpose |
|---|---|
| `/private` | Org selector — if you belong to one org, auto-redirects to its dashboard |
| `/register` | Create a new organization (you become the owner) |
| `/private/:slug/dashboard` | Recruiter home — stat cards (total, pending, interview, accepted), quick links |
| `/private/:slug/review` | Applicant list — search, filter by status, click to view details |
| `/private/:slug/review/candidate?id=N` | Individual applicant — responses, comments, status change |
| `/private/:slug/schedule/my` | Your upcoming interviews (calendar view, coming soon) |
| `/private/:slug/schedule/full` | All interviews across interviewers (coming soon) |
| `/private/:slug/evaluate` | Post-interview evaluations (coming soon) |
| `/private/:slug/settings` | Org settings — profile, colors, team members, job posting link |
| `/private/:slug/settings/jobs` | Job posting management — create, toggle active, delete |
| `/private/:slug/settings/jobs/:job_id` | Form builder — visually build application form steps and questions |

### Admin Route

| Route | Purpose |
|---|---|
| `/admin` | Platform super-admin — view all orgs, stats, links to each org's dashboard/settings |

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

1. Go to **Settings** → **Manage Postings** (or `/private/:slug/settings/jobs`)
2. Click **New Posting** — enter a position name and description
3. Click **Edit Form** on the new posting
4. **Add Steps**: Each step becomes a page in the applicant's form
   - Give it a title (e.g. "Verification", "Teams", "Free Response")
   - Pick an icon from the grid
5. **Add Questions** to each step:
   - **ID**: a unique identifier (e.g. `major`, `why_us`) — used as the key in stored responses
   - **Type**: Text Input, Dual Input, Text Area, Radio, Checkbox, Checkbox with Image, Dropdown, or Availability Grid
   - **Title**: the question text shown to the applicant
   - **Options**: for Radio/Checkbox/Dropdown — enter one per line
   - **Required**: toggle whether the field is mandatory
6. Reorder steps and questions with the up/down arrows
7. Click **Save All Changes**
8. Back on the jobs list, make sure the posting is **Active**

Applicants will now see this posting at `/apply/:slug` and can fill out the form at `/apply/:slug/:job_id`.

### 3. Inviting Team Members

1. Go to **Settings** (or `/private/:slug/settings`)
2. Under **Team Members**, enter the person's email and select their role
3. Click **Add Member**
4. The person must already have a LUMA account (signed up at `/auth`). If not, they'll need to sign up first.
5. Change roles with the dropdown next to each member
6. Remove members with the × button (owners cannot be removed)

### 4. Reviewing Applicants

1. Go to **Review** (or `/private/:slug/review`)
2. Use the search bar to find applicants by name
3. Filter by status: All, Pending, Interview, Accepted, Denied
4. Click an applicant card to see their full application
5. On the candidate page:
   - View all their responses on the left
   - Read and add comments on the right
   - Change their status with the dropdown (Pending → Interview → Accepted/Denied)

### 5. Applicant Experience

1. Applicant visits `/apply/:slug` and sees a list of open positions
2. Clicks a position → enters the multi-step form
3. **Step 0** (always present): Name and email
4. **Steps 1-N**: Custom questions defined in the form builder
5. **Final step**: Review and submit
6. On submission, the application is stored in the `applicants` table with:
   - `name`, `email`, `recruitInfo` (JSON of all answers), `job` (posting ID), `org_id`
7. Applicant sees a success confirmation page

---

## Database Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `organizations` | Org profiles | `id`, `name`, `slug`, `primary_color`, `secondary_color`, `owner_id` |
| `org_members` | Who belongs to which org | `org_id`, `user_id`, `role` (owner/admin/recruiter/viewer) |
| `job_posting` | Job listings with form schemas | `org_id`, `name`, `description`, `questions` (JSON), `active_flg` |
| `applicants` | Submitted applications | `org_id`, `job`, `name`, `email`, `recruitInfo` (JSON), `status`, `comments` |
| `interviewers` | People conducting interviews | `org_id`, `name`, `email`, `uuid` |
| `interviews` | Scheduled interviews | `org_id`, `job`, `applicant`, `interviewer`, `startTime`, `endTime`, `location` |

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

## Quick Start

```bash
git clone https://github.com/your-repo/luma.git
cd luma
npm install
cp .env.example .env.local  # fill in Supabase credentials
npm run dev                  # start dev server at localhost:5173
```

Then:
1. Go to `/auth` and sign up
2. Go to `/register` and create your org
3. Go to settings → manage postings → create a job → build the form
4. Share `/apply/your-slug` with applicants

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
--    This matches interviewer emails to auth.users and gives them the recruiter role
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

Replace `YOUR_AUTH_USER_UUID` with the owner's UUID (find it in Supabase → Authentication → Users). After running this, all your existing data will be accessible at `/private/your-slug/dashboard`.
