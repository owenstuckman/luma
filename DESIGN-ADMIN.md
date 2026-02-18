# DESIGN-ADMIN.md — Platform Admin Panel Expansion

## Overview

The current `/admin` page is a read-only dashboard: login, view org list with member/applicant counts, and link out to per-org dashboards. This document designs a full-featured platform administration panel that lets super-admins manage every aspect of the LUMA instance from one place.

---

## Current State

- Login gate via `is_platform_admin()` check
- Stats bar: org count, total members, total applicants
- Org list with name, slug, color dot, member/applicant counts, links to dashboard/settings
- No ability to create, edit, or delete anything from this page

---

## Proposed Feature Set

### 1. Organization Management

**Create Organization**
- Inline form or modal: name, slug (auto-generated from name, editable), primary/secondary colors, owner email
- On submit: creates org row, looks up owner by email, adds them as `owner` in `org_members`
- Validation: slug uniqueness check (real-time), required fields

**Edit Organization**
- Click org row to expand or open detail panel
- Editable fields: name, slug, primary_color, secondary_color, logo_url, settings JSON
- Save/cancel buttons with optimistic UI

**Delete Organization**
- Danger action with confirmation modal ("Type org name to confirm")
- Cascades: deletes org_members, job_postings, applicants, interviews (via FK CASCADE)
- Show impact summary before confirming (X members, Y applicants, Z interviews will be deleted)

**Transfer Ownership**
- Change the `owner_id` on the organization
- Dropdown of current org members or search by email
- Also updates their `org_members.role` to `owner` and demotes the previous owner to `admin`

---

### 2. User & Member Management

**Global User Directory**
- List all Supabase auth users with: email, created_at, last_sign_in_at, org memberships
- Search/filter by email
- Requires a new DB function (`get_all_users_admin`) using `SECURITY DEFINER` to query `auth.users`

**Add User to Organization**
- From the user directory or from an org's detail view
- Select org + role (owner/admin/recruiter/viewer) and add
- Reuses existing `invite_member_by_email` RPC

**Remove User from Organization**
- From org detail view or user detail view
- Reuses existing `remove_org_member` RPC

**Change Member Role**
- Inline role dropdown on member rows
- Reuses existing `update_member_role` RPC
- Platform admins can change any role including promoting to owner

**Platform Admin Management**
- List current platform admins (query `platform_admins` table)
- Add new platform admin by email (insert into `platform_admins` by looking up `auth.users`)
- Remove platform admin (delete from `platform_admins`)
- Safety: cannot remove yourself as platform admin

---

### 3. Custom Roles (Future / Stretch)

> The current system uses a fixed enum: `owner | admin | recruiter | viewer`. Expanding this to custom per-org roles is a larger migration. Below is the design for when it's needed.

**Custom Role Definitions**
- New table: `org_roles` (id, org_id, name, permissions JSON, created_at)
- Permissions as a JSON object with boolean flags:
  ```json
  {
    "can_review_applicants": true,
    "can_edit_job_postings": false,
    "can_manage_members": false,
    "can_schedule_interviews": true,
    "can_evaluate": true,
    "can_edit_settings": false,
    "can_export_data": false
  }
  ```
- Default roles auto-created for each org matching current enum behavior
- Platform admin UI: create/edit/delete role templates that orgs can adopt

**Migration Path**
- Add `org_roles` table alongside existing `org_role` enum
- Add `role_id` FK to `org_members` (nullable at first)
- Gradually shift permission checks from `has_org_role()` enum comparison to permission-flag lookups
- Keep enum as a fallback for backward compatibility during transition

---

### 4. Job Posting Oversight

**Cross-Org Job Listing**
- Table of all job postings across all orgs
- Columns: job name, org name, status (active/inactive), question count, applicant count, created_at
- Filter by org, status
- Sort by date, name, applicant count

**Quick Actions**
- Toggle active/inactive from the admin panel
- Delete a job posting (with confirmation)
- Link to the org's form builder for that job

---

### 5. Applicant Oversight

**Cross-Org Applicant Search**
- Search applicants by name or email across all orgs
- Columns: name, email, org, job, status, submitted date
- Filter by org, job, status
- Click to view full applicant detail (read-only or link to org's candidate page)

**Bulk Operations**
- Select multiple applicants across orgs
- Bulk status change, bulk delete (with confirmation)
- CSV export of selected applicants

---

### 6. Platform Analytics Dashboard

**Enhanced Stats**
- Total orgs, total users, total applicants, total interviews, total job postings
- Applicants by status breakdown (pending/interview/accepted/denied) — bar or pie chart
- New applicants over time (last 30 days) — line chart
- Orgs by size (member count) — ranked list

**Activity Feed**
- Recent sign-ups (new auth users)
- Recent org creations
- Recent applications submitted
- Requires either polling or a lightweight `platform_activity_log` table

---

### 7. System Settings

**Platform Branding**
- Default primary/secondary colors for new orgs
- Platform name, logo URL (shown on landing page and admin header)
- Stored in a `platform_settings` table (single-row key-value or JSON)

**Email / Auth Settings**
- Display current Supabase auth config (read-only, since it's managed in Supabase dashboard)
- Link to Supabase dashboard for auth provider config

**Maintenance Mode**
- Toggle that disables public application forms
- Shows a "Applications are currently closed" message on `/apply/*` routes
- Stored as a flag in `platform_settings`

---

## UI Layout

### Navigation
Replace the current flat page with a tabbed or sidebar-nav layout:

```
┌─────────────────────────────────────────────────┐
│  LUMA Logo    Platform Admin            [Home]  │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Overview │   (content area changes per tab)     │
│ Orgs     │                                      │
│ Users    │                                      │
│ Jobs     │                                      │
│ Apps     │                                      │
│ Settings │                                      │
│          │                                      │
│          │                                      │
│ ──────── │                                      │
│ Admins   │                                      │
│ Logout   │                                      │
└──────────┴──────────────────────────────────────┘
```

- **Overview** — stats cards + activity feed (enhanced version of current page)
- **Orgs** — org list with create/edit/delete
- **Users** — global user directory + org membership management
- **Jobs** — cross-org job posting list
- **Apps** — cross-org applicant search
- **Settings** — platform branding, maintenance mode
- **Admins** — platform admin list management

### Modals & Panels
- Create/edit forms use slide-in side panels (consistent with org settings pattern)
- Delete confirmations use centered modals with danger styling
- Role changes use inline dropdowns (no modal needed)

---

## Database Changes Required

### New Tables

```sql
-- Platform-wide settings (single row)
CREATE TABLE IF NOT EXISTS platform_settings (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Optional: activity log for the feed
CREATE TABLE IF NOT EXISTS platform_activity_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,         -- 'org_created', 'user_joined', 'application_submitted', etc.
  actor_id uuid REFERENCES auth.users(id),
  details jsonb DEFAULT '{}'    -- { org_id, org_name, applicant_name, ... }
);
```

### New RPC Functions

```sql
-- List all auth users (platform admin only)
CREATE OR REPLACE FUNCTION get_all_users_admin()
RETURNS TABLE (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT id, email, created_at, last_sign_in_at
  FROM auth.users
  WHERE is_platform_admin()
  ORDER BY created_at DESC;
$$;

-- Add a platform admin by email
CREATE OR REPLACE FUNCTION add_platform_admin_by_email(target_email text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
  IF target_user_id IS NULL THEN
    RETURN json_build_object('error', 'User not found');
  END IF;
  INSERT INTO platform_admins (user_id) VALUES (target_user_id)
    ON CONFLICT DO NOTHING;
  RETURN json_build_object('success', true);
END;
$$;

-- Remove a platform admin
CREATE OR REPLACE FUNCTION remove_platform_admin(target_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  IF target_user_id = auth.uid() THEN
    RETURN json_build_object('error', 'Cannot remove yourself');
  END IF;
  DELETE FROM platform_admins WHERE user_id = target_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- Create org as platform admin (with owner assignment)
CREATE OR REPLACE FUNCTION admin_create_organization(
  org_name text, org_slug text, owner_email text,
  p_color text DEFAULT '#ffc800', s_color text DEFAULT '#0F1112'
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  owner_user_id uuid;
  new_org_id bigint;
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  SELECT id INTO owner_user_id FROM auth.users WHERE email = owner_email;
  IF owner_user_id IS NULL THEN
    RETURN json_build_object('error', 'Owner email not found');
  END IF;
  INSERT INTO organizations (name, slug, owner_id, primary_color, secondary_color)
    VALUES (org_name, org_slug, owner_user_id, p_color, s_color)
    RETURNING id INTO new_org_id;
  INSERT INTO org_members (org_id, user_id, role)
    VALUES (new_org_id, owner_user_id, 'owner');
  RETURN json_build_object('success', true, 'org_id', new_org_id);
END;
$$;
```

### RLS Updates
- `platform_settings`: only platform admins can read/write
- `platform_activity_log`: only platform admins can read; insert via `SECURITY DEFINER` functions
- Existing tables need `SELECT` policies for platform admins to query cross-org data (or use `SECURITY DEFINER` RPCs to bypass RLS)

---

## Implementation Priority

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | Create organization from admin | Small |
| P0 | Platform admin management (add/remove) | Small |
| P0 | Tabbed layout with sidebar nav | Medium |
| P1 | Edit/delete organization | Small |
| P1 | Global user directory | Medium |
| P1 | Add/remove users from orgs, change roles | Small (reuses existing RPCs) |
| P1 | Cross-org job posting list | Small |
| P2 | Cross-org applicant search | Medium |
| P2 | Enhanced analytics dashboard | Medium |
| P2 | Transfer org ownership | Small |
| P3 | Platform settings (branding, maintenance mode) | Medium |
| P3 | Activity feed | Medium |
| P4 | Custom roles & permissions | Large (migration + refactor) |

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/routes/admin/+page.svelte` | Full rewrite — tabbed layout with all sections |
| `src/lib/utils/supabase.ts` | New admin functions (RPCs, cross-org queries) |
| `src/lib/types/index.ts` | New types: `PlatformSettings`, `ActivityLogEntry`, `AdminUser` |
| `supabase/migrations/00007_admin_panel.sql` | New tables, RPC functions, RLS policies |
