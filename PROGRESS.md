# LUMA Implementation Progress

## Phase 1: Foundation (Multi-Tenancy + Auth) — DONE
- [x] Create `organizations` table (migration applied)
- [x] Create `org_members` table with `org_role` enum (migration applied)
- [x] Add `org_id` FK + indexes to `job_posting`, `applicants`, `interviewers`, `interviews`
- [x] Overhaul RLS policies — org-scoped with helper functions `is_org_member()` and `has_org_role()`
- [x] Update `hooks.server.ts` — unchanged (auth guard still works, org context loaded per-page)
- [x] Org registration flow — `/register` page (creates org + adds user as owner)
- [x] Org-aware routing — `/private/[slug]/*` with layout that verifies membership
- [x] Org selector — `/private` now lists user's orgs or redirects if single org
- [x] Updated landing page — shows all organizations with "apply" links
- [x] TypeScript types — `src/lib/types/index.ts` with Organization, OrgMember, JobPosting, Applicant, etc.
- [x] Updated `supabase.ts` — org-scoped query functions, org CRUD, member management

## Phase 2: Dynamic Application Forms — DONE
- [x] Question engine types — `QuestionSchema`, `FormStep`, `FormQuestion` in types
- [x] `QuestionRenderer.svelte` — renders any card component based on question JSON type
- [x] Dynamic applicant flow — `/apply/[slug]/[job_id]` with step navigation
- [x] Auto personal info step (name/email always collected)
- [x] Auto review & submit step
- [x] Dynamic sidebar showing step titles/icons from question schema
- [x] Success page at `/apply/[slug]/[job_id]/success`
- [x] Org job listing page at `/apply/[slug]` — shows active postings
- [x] Removed old `/applicant/*` hardcoded routes

## Phase 3: Admin Portal — DONE
- [x] Super-admin page at `/admin` — login, org listing with stats
- [x] Org admin settings at `/private/[slug]/settings` — name, slug, colors, member list
- [x] Role-based access — only admin+ can edit settings
- [ ] Job posting CRUD (create/edit from dashboard) — needs form builder UI
- [ ] Invite members by email (currently shows user IDs)

## Phase 4: Recruiter Dashboard — MOSTLY DONE
- [x] Dashboard home — `/private/[slug]/dashboard` with stat cards (total, pending, interview, accepted)
- [x] Quick links to review, schedule, settings
- [x] Review page — `/private/[slug]/review` with search, status filter, applicant grid cards with status badges
- [x] Candidate detail — `/private/[slug]/review/candidate` with split layout (info + comments), status change dropdown
- [x] Recruiter Sidebar — auto-detects org slug from URL, links adapt
- [x] Recruiter Navbar — logout button, "Switch Org" link
- [x] Schedule pages (my/full) — shell pages ready for calendar integration
- [x] Evaluate page — shell page ready for scoring UI
- [ ] Bulk actions on review page (mass status update, CSV export)
- [ ] Calendar integration with @schedule-x on schedule pages
- [ ] Evaluation form with rating/scoring on evaluate page

## Phase 5: Self-Hosting & Docs — NOT STARTED
- [ ] Migration files in `supabase/migrations/`
- [ ] Setup script (`npm run setup`)
- [ ] README overhaul with one-click deploy button
- [ ] Docker support
- [ ] Documentation (setup guide, customization guide, architecture guide)

---

## Files Created
- `src/lib/types/index.ts` — shared TypeScript types
- `src/lib/components/QuestionRenderer.svelte` — dynamic question renderer
- `src/routes/apply/[slug]/+page.svelte` — org job listing
- `src/routes/apply/[slug]/[job_id]/+page.svelte` — dynamic application form
- `src/routes/apply/[slug]/[job_id]/success/+page.svelte` — submission success
- `src/routes/register/+page.svelte` — org registration
- `src/routes/private/[slug]/+layout.svelte` — org-scoped layout with auth check
- `src/routes/private/[slug]/dashboard/+page.svelte` — recruiter dashboard
- `src/routes/private/[slug]/review/+page.svelte` — applicant review
- `src/routes/private/[slug]/review/candidate/+page.svelte` — candidate detail
- `src/routes/private/[slug]/schedule/my/+page.svelte` — my schedule
- `src/routes/private/[slug]/schedule/full/+page.svelte` — full schedule
- `src/routes/private/[slug]/evaluate/+page.svelte` — evaluate
- `src/routes/private/[slug]/settings/+page.svelte` — org settings

## Files Modified
- `src/lib/utils/supabase.ts` — added org functions, kept backward-compatible
- `src/lib/components/recruiter/Sidebar.svelte` — auto-detects slug, adapts links
- `src/lib/components/recruiter/Navbar.svelte` — logout button, switch org
- `src/routes/+page.svelte` — landing shows orgs
- `src/routes/+page.server.ts` — removed dead `colors` table query
- `src/routes/+layout.svelte` — removed `prerender = true`
- `src/routes/admin/+page.svelte` — rebuilt as super-admin panel
- `src/routes/private/+page.svelte` — org selector / redirect
- `src/routes/private/+page.server.ts` — removed dead `notes` table query
- `svelte.config.js` — fixed paths.base config

## Files Removed
- `src/routes/applicant/*` — all 7 hardcoded steps + success page

## Database Migrations Applied
1. `create_org_role_enum_and_organizations` — enum, tables, org_id columns, indexes
2. `overhaul_rls_policies` — helper functions + org-scoped policies for all tables
