# LUMA

Open-source Applicant Tracking System built with SvelteKit and Supabase. Multi-tenant — run multiple organizations from a single deployment.

Originally built for Virginia Tech's Archimedes Society, where it processed **400+ applicants** and scheduled **250+ interviews** in Fall 2025.

## Features

- **Multi-org support** — any organization can sign up from the homepage, get its own portal, forms, and recruiter dashboard
- **Dynamic application forms** — build custom multi-step forms with a visual editor (text, radio, checkbox, dropdown, availability grid, and more)
- **Recruiter dashboard** — review applicants, filter/search/sort, bulk status updates, CSV export
- **Interview scheduling** — manual creation with conflict detection, plus auto-scheduling algorithms (greedy, balanced-load, round-robin, batch)
- **Email notifications** — interview confirmations with ICS calendar invites via Resend API, bulk email, copy-paste fallback
- **Realtime updates** — live dashboard counts, new applicant toasts, schedule change notifications
- **Post-interview evaluations** — star ratings, recommendations, strengths/weaknesses notes
- **Team management** — invite members by email, assign roles (Owner, Admin, Recruiter, Viewer)
- **Role-based access** — RLS policies enforce org-scoped data isolation at the database level
- **Admin panel** — platform-wide org/user/job management, analytics, auto-scheduling, platform settings

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
│   │   ├── applicant/    # Applicant flow UI (Navbar, Sidebar, Footer, AvailabilityGrid)
│   │   ├── recruiter/    # Recruiter dashboard UI (Navbar, Sidebar, Toast, EmailModal)
│   │   └── card/         # Reusable form input components
│   ├── email/            # Email templates, ICS generation, recipient grouping
│   ├── scheduling/       # Auto-scheduling algorithms + registry
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

Core tables, all scoped by `org_id`:

| Table | Purpose |
|---|---|
| `organizations` | Org profiles (name, slug, colors, logo, owner) |
| `org_members` | User-org membership with roles |
| `job_posting` | Job listings with dynamic form schemas (JSON) |
| `applicants` | Submitted applications with responses (JSON) |
| `interviews` | Scheduled interviews with evaluations |
| `interviewer_availability` | Interviewer time windows for auto-scheduling |
| `scheduling_config` | Per-org algorithm configuration |
| `email_log` | Sent email tracking |

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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fowenstuckman%2Fluma&env=PUBLIC_SUPABASE_URL,PUBLIC_SUPABASE_ANON_KEY&envDescription=Supabase%20project%20credentials%20required%20for%20authentication%20and%20database&envLink=https%3A%2F%2Fsupabase.com%2Fdashboard&project-name=luma&repository-name=luma)

Or manually:
1. Push to GitHub
2. Import in Vercel
3. Set environment variables (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

### Self-hosted

Any Node.js host works. Build with `npm run build`, then serve the output. Set the same environment variables.

## Migrating Existing Data

If you have data from before multi-tenancy (records with `org_id = NULL`), see the migration guide in [docs/usage.md](docs/usage.md#migrating-existing-data).

## Documentation

| Doc | Contents |
|---|---|
| [Usage Guide](docs/usage.md) | Routes, workflows, database schema, RPC functions |
| [Architecture](docs/architecture.md) | Multi-tenancy, question engine, RLS, realtime, email |
| [Scheduling](docs/scheduling.md) | Algorithms, admin UI, interviewer availability, database |
| [Email Notifications](docs/email-notifications.md) | Templates, ICS invites, Resend setup, email log |
| [Multi-Tenant Signup](docs/multitenant.md) | Self-service org registration flow |
| [Features](docs/features.md) | Complete list of implemented features |
| [TODO](docs/TODO.md) | Remaining work and tech debt |
| [Scheduling Enhancements](docs/scheduling-enhancements.md) | Advanced scheduler features (relaxed pass, attribute matching) |

## License

MIT
