# LUMA Design Document — Generalized Open-Source ATS

## 1. Current State Assessment

### What Exists and Works
- **Applicant flow**: 7-step application form (`/applicant/1_verification` through `7_submit`) with localStorage-based state, submitting to Supabase `applicants` table
- **Recruiter auth**: Supabase Auth with email/password, server-side session validation in `hooks.server.ts`, auth guard on `/private/*` routes
- **Recruiter dashboard**: Skeleton pages for Home, Review (with applicant cards + candidate detail view with comments), Schedule (My Schedule, Full Schedule), Evaluate, Settings — most are empty shells
- **Database**: 4 tables — `job_posting`, `applicants`, `interviewers`, `interviews` — with RLS enabled
- **Styling**: Bootstrap 5 + SCSS with dark theme (dark sidebar/navbar, yellow accents), CSS Grid layout with named areas
- **Components**: Reusable card inputs (Input, Checkbox, Radio, Dropdown, InputArea, CheckboxImage), applicant/recruiter Navbar + Sidebar

### What's Hardcoded / Incomplete
- Applicant steps are hardcoded to Archimedes-specific questions (team selection, freshman verification, etc.)
- `job` is hardcoded to `1` in submit (`sendApplicationFall2025`)
- Admin page is a non-functional login form (no auth, links to dead route `/recruiter/home`)
- Recruiter pages (Evaluate, Settings, Full Schedule, My Schedule) are empty shells
- No role-based access control — any authenticated user sees the full recruiter dashboard
- No multi-org/multi-tenant support
- `request_access` page is a static form with no backend logic
- `jobPostingCards.svelte` exists but isn't used in the main applicant flow

---

## 2. Architecture: Multi-Tenancy Model

### Approach: Single Database, Org-Scoped Rows

Every major table gets an `org_id` column. A new `organizations` table is the root entity. RLS policies enforce that users only see data for orgs they belong to.

### New Tables

```
organizations
├── id (bigint, PK)
├── created_at (timestamptz)
├── name (text, unique)           -- "Archimedes Society"
├── slug (text, unique)           -- "archimedes" → used in URLs
├── logo_url (text, nullable)
├── primary_color (text)          -- hex, defaults to "#ffc800"
├── secondary_color (text)        -- hex, defaults to "#0F1112"
├── settings (json)               -- org-level config (interview duration, etc.)
└── owner_id (uuid, FK → auth.users)

org_members
├── id (bigint, PK)
├── created_at (timestamptz)
├── org_id (bigint, FK → organizations)
├── user_id (uuid, FK → auth.users)
├── role (enum: 'owner', 'admin', 'recruiter', 'viewer')
└── UNIQUE(org_id, user_id)
```

### Modified Existing Tables

Add `org_id (bigint, FK → organizations)` to:
- `job_posting` (which org owns this posting)
- `applicants` (inherited from the job posting, denormalized for query speed)
- `interviewers` (scoped to org)
- `interviews` (scoped to org)

### URL Structure

```
/                                    → Landing: "Create org" or "Apply to org"
/apply/:slug                         → Public: list active job postings for org
/apply/:slug/:job_id                 → Public: dynamic application form (driven by job_posting.questions)
/auth                                → Login/signup (unchanged)
/private                             → Redirects to org selector or default org
/private/:slug/dashboard             → Recruiter home
/private/:slug/review                → Review applicants
/private/:slug/review/candidate?id=  → Individual candidate
/private/:slug/schedule              → Interview scheduling
/private/:slug/evaluate              → Post-interview evaluation
/private/:slug/settings              → Org settings (admin only)
/admin                               → Super-admin panel (platform owner)
```

---

## 3. Dynamic Application Forms (Question Engine)

### Current Problem
Application steps are hardcoded Svelte pages. Each org needs different questions.

### Solution: `job_posting.questions` JSON Schema

The existing `questions` column on `job_posting` becomes the source of truth. Each job posting defines its own form as a JSON array:

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
          "title": "We only accept first-year students.",
          "options": ["I understand and confirm I am a first-year student."],
          "required": true
        },
        {
          "id": "age_check",
          "type": "radio",
          "title": "Will you be over 18 by October 31?",
          "options": ["Yes", "No"],
          "required": true
        }
      ]
    },
    {
      "title": "Personal Info",
      "icon": "fi-br-file-user",
      "questions": [
        { "id": "major", "type": "input", "title": "Major", "required": true },
        { "id": "gpa", "type": "input", "title": "GPA", "required": false },
        { "id": "year", "type": "dropdown", "title": "Year", "options": ["Freshman", "Sophomore", "Junior", "Senior"] }
      ]
    },
    {
      "title": "Free Response",
      "icon": "fi-br-file-edit",
      "questions": [
        { "id": "why_us", "type": "textarea", "title": "Why do you want to join?", "required": true, "maxLength": 500 }
      ]
    }
  ]
}
```

### Supported Question Types
Maps 1:1 to existing card components:
| Type | Component | Notes |
|------|-----------|-------|
| `input` | `Input.svelte` | Single text field |
| `input_dual` | `InputDual.svelte` | Two fields side-by-side (e.g. first/last name) |
| `textarea` | `InputArea.svelte` | Multi-line text |
| `radio` | `Radio.svelte` | Single-select |
| `checkbox` | `Checkbox.svelte` | Multi-select |
| `checkbox_image` | `CheckboxImage.svelte` | Checkbox with image/description |
| `dropdown` | `Dropdown.svelte` | Select dropdown |
| `availability` | `AvailabilityGrid.svelte` | Time grid picker |

### Dynamic Applicant Flow

Instead of 7 hardcoded route pages, a single dynamic route:

```
/apply/:slug/:job_id              → Loads job_posting, shows step 0
/apply/:slug/:job_id?step=1       → Step 1, etc.
```

One page component reads `job_posting.questions.steps[currentStep]` and renders the appropriate card components. The existing Sidebar, Navbar, and Footer adapt to show the dynamic step titles/icons.

**Backward compatibility**: The old `/applicant/*` routes remain as-is in the codebase (archived). New orgs use `/apply/:slug/:job_id`.

---

## 4. Admin Portal

### Two Levels of Admin

**Org Admin** (`/private/:slug/settings`) — manages their own org:
- Edit org name, logo, colors
- Manage job postings (CRUD): create/edit the question JSON via a form builder UI
- Manage org members: invite recruiters, set roles, remove access
- View org-level analytics (applicant counts, pipeline stats)
- Configure interview settings (duration, locations, interviewer slots)

**Platform Super-Admin** (`/admin`) — you (platform owner):
- View all organizations
- Create/delete organizations
- Impersonate org admins for support
- View platform-wide analytics
- Manage platform settings

### Org Admin UI: Job Posting Builder

The most important admin feature is a drag-and-drop (or add/remove) form builder that outputs the `questions` JSON:

- Add steps (pages in the applicant flow)
- Within each step, add questions by type
- Configure each question (title, subtitle, options, required flag, etc.)
- Preview the form as applicants would see it
- Activate/deactivate job postings (`active_flg`)

This replaces the need for anyone to edit code to create a new application form.

---

## 5. Recruiter Dashboard — Filling in the Gaps

### Home (`/private/:slug/dashboard`)
- Summary cards: total applicants, pending review, interviews scheduled, decisions made
- Recent activity feed (latest comments, new applicants)
- Quick links to active job postings

### Review (`/private/:slug/review`)
- Already partially built. Enhancements:
  - Filter by job posting, status (pending/interview/accepted/denied)
  - Sort by date, name, status
  - Bulk actions: mass status update, export to CSV
  - Status badges on applicant cards

### Candidate Detail (`/private/:slug/review/candidate?id=`)
- Already partially built. Enhancements:
  - Clean layout: applicant info on left, comments/actions on right
  - Status change dropdown updates `applicants.status` directly
  - Comment thread with timestamps and commenter names (not just email)

### Schedule
- **My Schedule** (`/private/:slug/schedule/my`): Calendar view (already has `@schedule-x` dependency) showing the logged-in interviewer's upcoming interviews
- **Full Schedule** (`/private/:slug/schedule/full`): All interviews across all interviewers, filterable by date range, interviewer, job posting
- **Create Interview**: Modal/form to assign an applicant to an interviewer at a time slot + location

### Evaluate (`/private/:slug/evaluate`)
- List of completed interviews pending evaluation
- Evaluation form: rating scale, notes, hire/no-hire recommendation
- Stored in `interviews.comments` JSON or a new `evaluations` column

### Settings (`/private/:slug/settings`)
- Org profile (name, logo, colors)
- Member management (invite by email, role assignment)
- Job posting management (link to form builder)
- Interview configuration

---

## 6. Self-Hosting & Replication Plan

### Goal
Anyone can clone the repo, set up a Supabase project, and have their own LUMA instance running in under 15 minutes.

### Setup Script / CLI

```bash
npx create-luma-app
# or
git clone ... && npm install && npm run setup
```

The `setup` command:
1. Prompts for Supabase project URL + anon key (writes `.env.local`)
2. Runs all Supabase migrations to create tables, enums, RLS policies, and functions
3. Creates the first organization and admin user
4. Optionally seeds sample data for testing

### Migration Files

All schema changes live in `supabase/migrations/` as numbered SQL files, applied via the Supabase MCP or `supabase db push`. This includes:
- Table creation (organizations, org_members, + modifications to existing tables)
- Enum types (`candidate_status`, `interview_type`, `org_role`)
- RLS policies (org-scoped)
- Database functions (if needed for complex operations)

### Deployment Options

| Platform | Effort | Notes |
|----------|--------|-------|
| Vercel | Lowest | Already configured (`adapter-vercel`). One-click deploy button in README |
| Netlify | Low | Swap adapter |
| Self-hosted Node | Medium | Use `adapter-node` |
| Docker | Medium | Add Dockerfile |

### Documentation

- `README.md`: Quick start (clone, env vars, deploy)
- `docs/setup.md`: Detailed setup guide with screenshots
- `docs/customization.md`: How to change colors, logo, org settings
- `docs/architecture.md`: Technical overview for contributors

---

## 7. Multi-Org Hosting (Your Use Case)

### Scenario
You host LUMA at `luma.app` (or similar). Multiple organizations sign up and each gets their own portal.

### How It Works

1. **Org Registration**: A "Create Organization" flow at `/register`:
   - Enter org name → auto-generates slug
   - Creator becomes `owner` in `org_members`
   - Org gets a settings page to customize branding

2. **Org-Scoped URLs**: Each org operates under `/apply/:slug/*` (public) and `/private/:slug/*` (dashboard). The slug is the namespace.

3. **Data Isolation via RLS**: Every query is filtered by org_id. RLS policies ensure:
   - Recruiters only see applicants/interviews for their org
   - Applicants submit to a specific org's job posting
   - Cross-org data access is impossible at the database level

4. **Branding**: Each org's `primary_color`, `secondary_color`, and `logo_url` are loaded at the layout level and applied via CSS custom properties:
   ```css
   :root {
     --luma-primary: var(--org-primary, #ffc800);
     --luma-dark: var(--org-dark, #0F1112);
   }
   ```

5. **Custom Domains** (future): Orgs could point their own domain via Vercel's domain aliasing, resolving to their slug.

---

## 8. RLS Policy Overhaul

Current policies are too permissive. New policy structure:

| Table | Operation | Who | Condition |
|-------|-----------|-----|-----------|
| `organizations` | SELECT | public | `true` (name/slug/branding is public) |
| `organizations` | UPDATE | authenticated | user is `owner` or `admin` of org |
| `org_members` | SELECT | authenticated | user is member of same org |
| `org_members` | INSERT/DELETE | authenticated | user is `owner` or `admin` of org |
| `job_posting` | SELECT | public | `active_flg = true` OR user is org member |
| `job_posting` | INSERT/UPDATE/DELETE | authenticated | user is `admin`+ of org |
| `applicants` | INSERT | public | `true` (anyone can apply) |
| `applicants` | SELECT/UPDATE | authenticated | user is member of applicant's org |
| `applicants` | DELETE | authenticated | user is `admin`+ of org |
| `interviewers` | ALL | authenticated | user is member of interviewer's org |
| `interviews` | SELECT | authenticated | user is member of interview's org |
| `interviews` | INSERT/UPDATE | authenticated | user is `recruiter`+ of org |

---

## 9. Implementation Phases

### Phase 1: Foundation (Multi-Tenancy + Auth)
- Create `organizations` and `org_members` tables
- Add `org_id` to existing tables
- Overhaul RLS policies
- Org registration flow
- Update hooks.server.ts to load org context
- Org-aware routing (`/private/:slug/*`)

### Phase 2: Dynamic Application Forms
- Build the question engine renderer (reads `questions` JSON, renders card components)
- Dynamic applicant flow at `/apply/:slug/:job_id`
- Applicant-side Sidebar/Navbar adapt to dynamic steps
- Keep old `/applicant/*` routes for backward compatibility

### Phase 3: Admin Portal
- Org settings page (branding, members)
- Job posting CRUD
- Form builder UI for `questions` JSON
- Platform super-admin page

### Phase 4: Recruiter Dashboard Polish
- Dashboard home with summary stats
- Review page filters/sort/bulk actions
- Candidate detail redesign
- Schedule pages with calendar integration
- Evaluate page with scoring

### Phase 5: Self-Hosting & Docs
- Migration files in `supabase/migrations/`
- Setup script / CLI
- README overhaul with one-click deploy
- Docker support
- Documentation site

---

## 10. File Structure (Proposed)

```
src/
├── lib/
│   ├── components/
│   │   ├── applicant/          (existing — keep)
│   │   ├── recruiter/          (existing — keep)
│   │   ├── card/               (existing — keep)
│   │   ├── admin/              (new — admin UI components)
│   │   └── shared/             (new — shared components like StatusBadge, OrgLogo)
│   ├── utils/
│   │   ├── supabase.ts         (existing — extend with org-scoped queries)
│   │   └── questions.ts        (new — question engine helpers)
│   └── types/
│       └── index.ts            (new — shared TypeScript types)
├── routes/
│   ├── +page.svelte            (update: landing with org selector)
│   ├── register/               (new: org registration)
│   ├── apply/
│   │   └── [slug]/
│   │       ├── +page.svelte    (job listing for org)
│   │       └── [job_id]/
│   │           └── +page.svelte (dynamic application form)
│   ├── applicant/              (existing — keep for backward compat)
│   ├── auth/                   (existing — keep)
│   ├── admin/                  (rebuild: super-admin)
│   └── private/
│       └── [slug]/
│           ├── +layout.svelte  (org-scoped layout, loads branding)
│           ├── dashboard/
│           ├── review/
│           ├── schedule/
│           ├── evaluate/
│           └── settings/
├── styles/
│   ├── col.scss                (existing — extend with CSS custom properties)
│   └── luma.scss               (existing — keep)
supabase/
└── migrations/
    ├── 001_create_organizations.sql
    ├── 002_create_org_members.sql
    ├── 003_add_org_id_to_tables.sql
    ├── 004_rls_policies.sql
    └── ...
```

---

## 11. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-tenancy | Shared DB, org-scoped rows | Simpler than separate DBs, Supabase RLS handles isolation |
| Application forms | JSON-driven, rendered dynamically | No code changes needed per org/job |
| Existing routes | Keep as-is | Backward compatibility with existing Archimedes deployment |
| Styling approach | Keep Bootstrap/SCSS, add CSS custom properties for theming | Consistent with existing codebase |
| Component patterns | Match file's existing style (Svelte 4 vs 5) | Per CLAUDE.md guidance |
| State management | localStorage for applicant flow, direct Supabase queries for recruiter | Matches existing pattern, works well |
| Deployment | Vercel-first, with Docker/self-host options | Already configured, lowest friction |

---

Review this document and let me know:
1. Does the multi-tenancy model (org slugs, shared DB) match your vision?
2. Should the old `/applicant/*` routes stay permanently or be removed after migration?
3. Any features to add/remove from the recruiter dashboard?
4. Priorities — which phase do you want to start with?
