# Multi-Tenant Organization Signup

## Overview

LUMA is multi-tenant: any organization can create an account, set up job postings, and start receiving applications — all from the same instance. This document describes the self-service org signup flow.

## Signup Flow

```
Homepage (/)
  └─ "Create Your Organization" button
       └─ /auth (login or sign up for a LUMA account)
            └─ /register (enter org name, slug auto-generated)
                 └─ /private/[slug]/dashboard (redirected as owner)
```

### Steps

1. **Visitor clicks "Create Your Organization"** on the homepage (`/`)
2. **Auth gate**: The `/register` page checks for an authenticated session. If not logged in, redirects to `/auth` with a `?redirect=/register` param so they return after login/signup.
3. **Create org**: User enters an organization name. The URL slug is auto-generated (e.g. "Acme Corp" → `acme-corp`). Slug is editable.
4. **Org created**: Inserts into `organizations` table, adds the user as `owner` in `org_members`, redirects to the new dashboard.
5. **Owner sets up**: From the dashboard, the owner can configure settings (colors, logo, email), invite team members, create job postings, and build application forms.

## Pages Involved

| Page | Purpose |
|---|---|
| `/` | Homepage — org listing + "Create Your Organization" CTA |
| `/auth` | Login / signup / magic link / password reset |
| `/register` | Create organization form (auth-required) |
| `/private/[slug]/dashboard` | New org's dashboard (post-creation landing) |
| `/private/[slug]/settings` | Org config: name, colors, logo, email, team |
| `/private/[slug]/settings/jobs` | Job posting CRUD + form builder |

## Auth Page Integration

The auth page accepts a `?redirect=` query parameter. After successful login or signup, the user is redirected to that URL instead of the default `/private`. This enables the flow: homepage → auth (with redirect=/register) → register.

## What Each Org Gets

Once created, every organization has:

- **Public application portal** at `/apply/[slug]` — lists active job postings
- **Dynamic application forms** at `/apply/[slug]/[job_id]` — fully customizable via form builder
- **Recruiter dashboard** at `/private/[slug]/dashboard` — stats, quick actions
- **Review page** — search, filter, sort, bulk actions on applicants
- **Scheduling** — manual interview creation, interviewer availability, calendar views
- **Evaluation** — post-interview ratings and notes
- **Settings** — org profile, team management, job posting CRUD, form builder
- **Email notifications** — send interview confirmations with ICS attachments

All data is isolated by `org_id` with Row Level Security (RLS) policies.

## Database

No schema changes needed. The existing tables support multi-tenancy:

- `organizations` — org profile (name, slug, colors, logo, owner_id)
- `org_members` — membership + roles (owner, admin, recruiter, viewer)
- All data tables have `org_id` FK with RLS via `is_org_member(org_id)`

## Implementation (Complete)

All changes are implemented and tested:

1. **Homepage** (`/+page.svelte`) — "Create Your Organization" button links to `/auth?redirect=/register`
2. **Auth page** (`/auth/+page.svelte`) — Reads `redirect` query param via hidden form field
3. **Auth server** (`/auth/+page.server.ts`) — Preserves redirect param through login/signup/error flows, redirects to target URL on success
4. **Register page** (`/register/+page.svelte`) — Redirects unauthenticated users to `/auth?redirect=/register`
