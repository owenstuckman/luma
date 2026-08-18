# LUMA

Open-source Applicant Tracking System built with SvelteKit and Supabase. Multi-tenant — run multiple organizations from a single deployment.

Originally built for Virginia Tech's Archimedes Society, where it processed **400+ applicants** and scheduled **250+ interviews** in Fall 2025.

## Features

- **Multi-org support** — any organization can sign up from the homepage, get its own portal, forms, and recruiter dashboard
- **Dynamic application forms** — build custom multi-step forms with a visual editor (text, radio, checkbox, dropdown, availability grid, and more)
- **Recruiter dashboard** — review applicants, filter/search/sort, bulk status updates, CSV export
- **Candidate roster & profiles** — org-wide list of every applicant with their pipeline stage, plus a per-candidate timeline unioning drafts, reviews, interviews, evaluations, decisions, and sent email
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

| Layer      | Technology                       |
| ---------- | -------------------------------- |
| Framework  | SvelteKit 2 + Svelte 5           |
| Language   | TypeScript                       |
| Database   | Supabase (Postgres + Auth + RLS) |
| Styling    | Bootstrap 5 + SCSS               |
| Calendar   | Schedule-X                       |
| Deployment | Vercel (or any Node host)        |

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── applicant/    # Applicant flow UI (Navbar, Sidebar, Footer, AvailabilityGrid)
│   │   ├── recruiter/    # Recruiter dashboard UI (Navbar, Sidebar, CandidateList, Toast, EmailModal)
│   │   ├── admin/        # Platform admin UI
│   │   └── card/         # Reusable form input components
│   ├── email/            # Email templates, ICS generation, recipient grouping
│   ├── scheduling/       # Auto-scheduling algorithms + registry
│   ├── stores/           # jobFilter, mobileMenu
│   ├── types/            # Shared interfaces + OrgSettings normalizer
│   └── utils/            # supabase.ts (queries), candidates.ts (roster + timeline)
├── routes/
│   ├── apply/[slug]/     # Public application forms
│   ├── auth/             # Login / signup
│   ├── register/         # Create new organization
│   ├── admin/            # Super-admin panel
│   ├── api/              # health, email-webhook
│   └── private/[slug]/   # Authenticated recruiter pages
│       ├── dashboard/
│       ├── review/       # Job-scoped review queue + candidate profile
│       ├── candidates/   # Org-wide candidate roster
│       ├── schedule/
│       ├── evaluate/
│       ├── availability/
│       └── settings/
├── styles/               # SCSS (Bootstrap theme + color tokens)
scripts/                  # setup.mjs, cross-platform-deps.mjs
supabase/
├── functions/            # Edge functions (notify-interviews, send-reminders)
└── migrations/           # SQL migration files (run in order)
docs/                     # V1 context, feature inventory, build plan, deployment
```

## Database

Core tables, all scoped by `org_id`:

| Table                      | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `organizations`            | Org profiles (name, slug, colors, logo, owner) |
| `org_members`              | User-org membership with roles                 |
| `job_posting`              | Job listings with dynamic form schemas (JSON)  |
| `applicants`               | Submitted applications with responses (JSON)   |
| `interviews`               | Scheduled interviews with evaluations          |
| `interviewer_availability` | Interviewer time windows for auto-scheduling   |
| `scheduling_config`        | Per-org algorithm configuration                |
| `email_log`                | Sent email tracking                            |
| `teams`                    | Per-org subteams applicants can apply to       |
| `application_drafts`       | Save-and-resume partial applications           |
| `job_reviewers`            | Reviewer pool + weight per job posting         |
| `decisions`                | Per-team hire / reject / waitlist outcomes     |

Row-Level Security enforces data isolation — users can only see data from orgs they belong to.
Helper functions: `is_org_member()`, `has_org_role()`, `has_app_role()`.

## Roles

| Role      | Review        | Manage Jobs | Manage Members          |
| --------- | ------------- | ----------- | ----------------------- |
| Viewer    | Read-only     | No          | No                      |
| Recruiter | Yes + comment | No          | No                      |
| Admin     | Yes           | Yes         | Yes                     |
| Owner     | Yes           | Yes         | Yes (cannot be removed) |

## Commands

| Command              | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Start dev server                           |
| `npm run build`      | Production build                           |
| `npm run setup`      | Guided first-time setup                    |
| `npm run check`      | TypeScript type-check                      |
| `npm run lint`       | Prettier + ESLint                          |
| `npm run format`     | Auto-format                                |
| `npm run deps:cross` | Add the other OS's native binaries (below) |

### Node.js version

**Node 22 or newer is required** (`engines.node: ">=22"`, and `.nvmrc` pins 22).

This is not a style preference. `@supabase/realtime-js` requires a native global
`WebSocket`, which Node only gained in v22, and it hard-checks the major version. On
Node 20 the server-side Supabase client throws the moment it is constructed in
`src/hooks.server.ts`, so **every SSR route returns HTTP 500**:

```
Error: Node.js 20 detected without native WebSocket support.
```

Separately, `npm install` on Node < 20.19 emits `EBADENGINE` warnings for `sass`,
`chokidar`, `readdirp`, and `eslint-visitor-keys`.

Both symptoms have the same cure — upgrade Node:

```powershell
winget install OpenJS.NodeJS.LTS     # Windows
```

Check with `node -v` in _each_ environment you use. PowerShell and WSL have separate
Node installations, and upgrading one does not upgrade the other.

### Working from both Windows and WSL

If you keep the repo on a Windows drive and run it from **both** PowerShell and WSL,
the two share a single `node_modules`. Rollup, esbuild, and lightningcss each ship
their native binary as a separate platform-specific package, and `npm install` only
fetches the one matching whichever OS ran it. The other environment then fails with
`Cannot find module @rollup/rollup-win32-x64-msvc` (or the Linux equivalent).

After any `npm install`, run:

```bash
npm run deps:cross
```

It installs the other platform's binaries alongside the current ones, pinned to the
versions already installed. Note that a dependency can appear several times in the tree
at different versions — this repo has `esbuild` four times, top-level plus nested copies
under `vite` and `@sveltejs/adapter-vercel` — and each copy refuses a binary whose
version doesn't match it exactly (`Host version "0.25.12" does not match binary version
"0.27.7"`). The script walks the whole tree and places a correctly-versioned binary next
to every copy. The extra packages are inert on the OS they don't match —
each library resolves its binary from `process.platform` at runtime — and the command
uses `--no-save`, so `package.json` and `package-lock.json` are untouched. It is
deliberately not a `postinstall` hook, since Vercel builds on Linux and has no use for
Windows binaries.

Line endings are handled by `.gitattributes` (`* text=auto eol=lf`), which keeps the two
environments from producing whole-file CRLF diffs against each other.

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

| Doc                                                        | Contents                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| [Usage Guide](docs/usage.md)                               | Routes, workflows, database schema, RPC functions              |
| [Architecture](docs/architecture.md)                       | Multi-tenancy, question engine, RLS, realtime, email           |
| [Scheduling](docs/scheduling.md)                           | Algorithms, admin UI, interviewer availability, database       |
| [Email Notifications](docs/email-notifications.md)         | Templates, ICS invites, Resend setup, email log                |
| [Multi-Tenant Signup](docs/multitenant.md)                 | Self-service org registration flow                             |
| [Features](docs/features.md)                               | Complete list of implemented features                          |
| [TODO](docs/TODO.md)                                       | Remaining work and tech debt                                   |
| [Scheduling Enhancements](docs/scheduling-enhancements.md) | Advanced scheduler features (relaxed pass, attribute matching) |

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
