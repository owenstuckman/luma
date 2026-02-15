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
- [x] Job posting CRUD at `/private/[slug]/settings/jobs` — list, create, toggle active, delete
- [x] Form builder UI at `/private/[slug]/settings/jobs/[job_id]` — visual step/question editor, reorder, all question types
- [x] Invite members by email — uses `invite_member_by_email` DB function, shows emails, role change, remove
- [x] Member management DB functions — `get_org_members_with_email`, `remove_org_member`, `update_member_role`

## Phase 4: Recruiter Dashboard — DONE
- [x] Dashboard home — `/private/[slug]/dashboard` with stat cards (total, pending, interview, accepted)
- [x] Quick links to review, schedule, settings
- [x] Review page — `/private/[slug]/review` with search, status filter, applicant grid cards with status badges
- [x] Candidate detail — `/private/[slug]/review/candidate` with split layout (info + comments), status change dropdown
- [x] Recruiter Sidebar — auto-detects org slug from URL, links adapt
- [x] Recruiter Navbar — logout button, "Switch Org" link
- [x] Bulk actions on review page — multi-select, bulk status update, CSV export, sort by date/name/status
- [x] Calendar integration — @schedule-x on My Schedule (filtered by your interviews) and Full Schedule (all org interviews, filter by interviewer)
- [x] Evaluation form — star rating, recommendation (Strong Yes → Strong No), strengths/weaknesses/notes, saved to interview comments JSON
- [x] Existing data migration — Archimedes Society org created, all 241 applicants + 890 interviews + 30 interviewers assigned

## Phase 5: Self-Hosting & Docs — DONE
- [x] Migration files in `supabase/migrations/` (4 SQL files in order)
- [x] Setup script (`npm run setup`) — guided CLI configuration
- [x] `env.example` — template for environment variables
- [x] README overhaul — features, quick start, tech stack, project structure, deployment guide
- [x] Usage documentation at `docs/usage.md` — routes, workflows, DB schema, migration guide
- [x] Cleaned up old `/private/recruiter/*` routes (superseded by `/private/[slug]/*`)
- [x] Removed 6 unused legacy components
- [x] Docker support — Dockerfile, docker-compose.yml, .dockerignore, adapter-node via `ADAPTER=node`

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

- `src/routes/private/[slug]/settings/jobs/+page.svelte` — job posting management (list, create, toggle, delete)
- `src/routes/private/[slug]/settings/jobs/[job_id]/+page.svelte` — form builder UI

## Phase 6: Polish & Security
- [x] Admin panel security — `platform_admins` table + `is_platform_admin()` function, admin page checks before granting access
- [x] Availability question type — QuestionRenderer now renders AvailabilityGrid for `availability` type questions
- [x] Removed deprecated `sendApplicationFall2025` function from supabase.ts
- [x] Fixed esbuild version mismatch + Vercel adapter Node.js runtime

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
- `src/routes/private/recruiter/*` — all 9 old hardcoded recruiter pages (superseded by `[slug]` routes)
- `src/lib/components/applicantCard.svelte` — unused legacy component
- `src/lib/components/ApplicantInfo.svelte` — unused legacy component
- `src/lib/components/ApplicantInfoComments.svelte` — unused legacy component
- `src/lib/components/applicationForm.svelte` — unused legacy component
- `src/lib/components/backButton.svelte` — unused legacy component
- `src/lib/components/jobPostingCards.svelte` — unused legacy component

## Database Migrations Applied
1. `create_org_role_enum_and_organizations` — enum, tables, org_id columns, indexes
2. `overhaul_rls_policies` — helper functions + org-scoped policies for all tables
3. `add_invite_member_function` — `invite_member_by_email`, `get_org_members_with_email`, `remove_org_member`, `update_member_role` DB functions
4. `migrate_existing_data_to_archimedes_org` — creates Archimedes Society org, assigns all 241 applicants, 1 job posting, 890 interviews, 30 interviewers; adds 29 org members from matched interviewer emails
5. `add_platform_admins_table` — platform_admins table, RLS policy, `is_platform_admin()` helper function
