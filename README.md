# LUMA

Open-source Applicant Tracking System built with SvelteKit and Supabase. Multi-tenant — run multiple organizations from a single deployment.

Originally built for Virginia Tech's Archimedes Society, where it processed **400+ applicants** and scheduled **250+ interviews** in Fall 2025.

## Features

- **Multi-org support** — each organization gets its own portal, forms, and recruiter dashboard
- **Dynamic application forms** — build custom multi-step forms with a visual editor (text, radio, checkbox, dropdown, availability grid, and more)
- **Recruiter dashboard** — review applicants, filter/search/sort, bulk status updates, CSV export
- **Interview scheduling** — calendar views (day/week/month) for personal and team schedules
- **Post-interview evaluations** — star ratings, recommendations, strengths/weaknesses notes
- **Team management** — invite members by email, assign roles (Owner, Admin, Recruiter, Viewer)
- **Role-based access** — RLS policies enforce org-scoped data isolation at the database level

## Quick Start

```bash
git clone https://github.com/your-repo/luma.git
cd luma
npm install
npm run setup          # guided configuration
npm run dev            # start at localhost:5173
```

Or manually:
1. Copy `env.example` to `.env.local` and fill in your [Supabase](https://supabase.com) project credentials
2. Run the SQL migrations from `supabase/migrations/` in your Supabase SQL Editor (in order)
3. Configure auth redirect URLs in Supabase dashboard (Authentication → URL Configuration)
4. `npm run dev`

Then:
1. Go to `/auth` and create an account
2. Go to `/register` and create your organization
3. Go to Settings → Manage Postings → create a job → build the form
4. Share `/apply/your-slug` with applicants

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 |
| Language | TypeScript |
| Database | Supabase (Postgres + Auth + RLS) |
| Styling | Bootstrap 5 + SCSS |
| Calendar | Schedule-X |
| Deployment | Vercel (or any Node host) |

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── applicant/    # Applicant flow UI (Navbar, Sidebar, Footer)
│   │   ├── recruiter/    # Recruiter dashboard UI (Navbar, Sidebar)
│   │   └── card/         # Reusable form input components
│   ├── types/            # Shared TypeScript interfaces
│   └── utils/            # Supabase client + query functions
├── routes/
│   ├── apply/[slug]/     # Public application forms
│   ├── auth/             # Login / signup
│   ├── register/         # Create new organization
│   ├── admin/            # Super-admin panel
│   └── private/[slug]/   # Authenticated recruiter pages
│       ├── dashboard/
│       ├── review/
│       ├── schedule/
│       ├── evaluate/
│       └── settings/
├── styles/               # SCSS (Bootstrap theme + color tokens)
supabase/
└── migrations/           # SQL migration files (run in order)
```

## Database

Six core tables, all scoped by `org_id`:

| Table | Purpose |
|---|---|
| `organizations` | Org profiles (name, slug, colors, owner) |
| `org_members` | User-org membership with roles |
| `job_posting` | Job listings with dynamic form schemas (JSON) |
| `applicants` | Submitted applications with responses (JSON) |
| `interviewers` | People conducting interviews |
| `interviews` | Scheduled interviews with evaluations |

Row-Level Security enforces data isolation — users can only see data from orgs they belong to.

## Roles

| Role | Review | Manage Jobs | Manage Members |
|---|---|---|---|
| Viewer | Read-only | No | No |
| Recruiter | Yes + comment | No | No |
| Admin | Yes | Yes | Yes |
| Owner | Yes | Yes | Yes (cannot be removed) |

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run setup` | Guided first-time setup |
| `npm run check` | TypeScript type-check |
| `npm run lint` | Prettier + ESLint |
| `npm run format` | Auto-format |

## Deploying

### Vercel (recommended)

1. Push to GitHub
2. Import in Vercel
3. Set environment variables (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

### Self-hosted

Any Node.js host works. Build with `npm run build`, then serve the output. Set the same environment variables.

## Migrating Existing Data

If you have data from before multi-tenancy (records with `org_id = NULL`), see the migration guide in [docs/usage.md](docs/usage.md#migrating-existing-data).

## Documentation

- [Usage Guide](docs/usage.md) — routes, workflows, database schema, RPC functions
- [Architecture](docs/architecture.md) — multi-tenancy model, question engine, RLS, component patterns
- [Scheduling System](docs/scheduling.md) — algorithm interface, built-in algorithms, admin UI, database schema

## License

MIT
