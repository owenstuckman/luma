# LUMA Architecture

## Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 |
| Language | TypeScript (strict) |
| Database | Supabase (Postgres + Auth + RLS) |
| Styling | Bootstrap 5 + SCSS |
| Calendar | Schedule-X |
| Deployment | Vercel (or any Node host via `adapter-node`) |

---

## Multi-Tenancy Model

Single shared Postgres database with org-scoped rows. Every major table has an `org_id` column. RLS policies enforce that users only see data for orgs they belong to.

### Core Tables

```
organizations
├── id, name, slug (URL namespace), logo_url
├── primary_color, secondary_color
├── settings (JSON — org-level config)
└── owner_id → auth.users

org_members
├── org_id → organizations
├── user_id → auth.users
└── role: owner | admin | recruiter | viewer
     UNIQUE (org_id, user_id)
```

All data tables (`job_posting`, `applicants`, `interviewers`, `interviews`) carry `org_id` as a foreign key. `applicants.org_id` is denormalized from the job posting for query speed.

### URL Namespace

Each org gets a URL slug (e.g. `archimedes-society`) as its namespace:

```
/apply/[slug]                            Public: job listing
/apply/[slug]/[job_id]                   Public: dynamic application form
/apply/[slug]/[job_id]/success           Confirmation
/private/[slug]/dashboard                Recruiter home
/private/[slug]/review                   Applicant list
/private/[slug]/review/candidate?id=N    Candidate detail
/private/[slug]/schedule/my              My interview calendar
/private/[slug]/schedule/full            All org interviews
/private/[slug]/evaluate                 Post-interview evaluations
/private/[slug]/settings                 Org profile + members
/private/[slug]/settings/jobs            Job posting CRUD
/private/[slug]/settings/jobs/[job_id]   Form builder
```

---

## Question Engine (Dynamic Forms)

`job_posting.questions` is a JSON column that defines the entire application form. No code changes are needed to add forms for new orgs or job types.

### Schema

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

### Supported Question Types

| Type | Component | Notes |
|---|---|---|
| `input` | `Input.svelte` | Single text field |
| `input_dual` | `InputDual.svelte` | Two side-by-side fields (e.g. first/last name) |
| `textarea` | `InputArea.svelte` | Multi-line text |
| `radio` | `Radio.svelte` | Single-select |
| `checkbox` | `Checkbox.svelte` | Multi-select |
| `checkbox_image` | `CheckboxImage.svelte` | Checkbox with image/description |
| `dropdown` | `Dropdown.svelte` | Select dropdown |
| `availability` | `AvailabilityGrid.svelte` | Time-grid picker |

`QuestionRenderer.svelte` reads each question's `type` and renders the corresponding card component. The applicant flow automatically adds a personal info step (name + email) at the front and a review/submit step at the end.

---

## RLS Policies

| Table | Operation | Who |
|---|---|---|
| `organizations` | SELECT | public (branding is public) |
| `organizations` | UPDATE | org owner or admin |
| `org_members` | SELECT | org members |
| `org_members` | INSERT/DELETE | org owner or admin |
| `job_posting` | SELECT | public (active only) or org member (all) |
| `job_posting` | INSERT/UPDATE/DELETE | org admin+ |
| `applicants` | INSERT | public (anyone can apply) |
| `applicants` | SELECT/UPDATE | org members |
| `applicants` | DELETE | org admin+ |
| `interviewers` | ALL | org members |
| `interviews` | SELECT | org members |
| `interviews` | INSERT/UPDATE | org recruiter+ |

**Helper functions** (security definer, `SET search_path = public`):

| Function | Purpose |
|---|---|
| `is_org_member(org_id)` | True if current user belongs to the org |
| `has_org_role(org_id, min_role)` | True if user has role ≥ min_role |
| `is_platform_admin()` | True if current user is in `platform_admins` |

---

## Roles

| Role | Review Applicants | Comment | Manage Jobs | Manage Members |
|---|---|---|---|---|
| Viewer | Read-only | No | No | No |
| Recruiter | Yes | Yes | No | No |
| Admin | Yes | Yes | Yes | Yes |
| Owner | Yes | Yes | Yes | Yes (cannot be removed) |

---

## Component Patterns

- **Most components**: Svelte 4 style (`export let`, `$:`, `createEventDispatcher`)
- **Root layout**: Svelte 5 runes (`$props()`, `$derived()`, `{@render}`)
- Match the style of the file you're editing.

**Applicant page template**:
```svelte
<div class="layout">
  <div class="content">
    <h4>Step Title</h4>
    <!-- Card components from $lib/components/card/ -->
    <Footer backNav="..." nextNav="..."/>
  </div>
  <Navbar/>
  <Sidebar currentStep={N}/>
</div>
```

**Recruiter page template**: uses `content-left` instead of `content`, plus recruiter `Navbar` and `Sidebar`.

---

## State Management

- **Applicant flow**: `localStorage` — one key per question ID. On final submit, all entries are collected into a `recruitInfo` JSON object and written to Supabase via `submitApplication()`.
- **Recruiter side**: Direct Supabase queries per page load. No Svelte stores.

---

## Styling

Two style systems coexist — Bootstrap 5 + SCSS is dominant; Tailwind CSS v4 is minimally present.

- **Color tokens**: `src/styles/col.scss` — `@use` per component, adjust relative path depth
- **Global theme**: `src/styles/luma.scss` — Bootstrap overrides + CSS custom properties for per-org theming
- **Layout**: CSS Grid with named areas (`navbar`, `sidebar`, `content`)
- **Icons**: Flaticon Uicons (`fi fi-br-*` classes)
- **Font**: Inter

Per-org branding (`primary_color`, `secondary_color`) is applied via CSS custom properties at the `[slug]` layout level.

---

## Scheduling System

See [scheduling.md](scheduling.md) for the scheduling algorithm architecture and admin UI design.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Multi-tenancy | Shared DB, org-scoped rows | Simpler than separate DBs; Supabase RLS handles isolation |
| Application forms | JSON-driven, rendered dynamically | No code changes needed per org or job |
| Styling | Bootstrap 5 + SCSS + CSS custom properties | Consistent with existing codebase; CSS vars enable per-org theming |
| Component style | Match the file's existing style | Svelte 4/5 mixed intentionally; don't break working components |
| State | localStorage for applicants, direct Supabase for recruiters | Matches original pattern; no extra infra |
| Deployment | Vercel-first, with Docker/Node adapter options | Already configured; lowest friction for most users |
