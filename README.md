# LUMA

An open-source, multi-tenant applicant tracking system for design teams and student organizations — applications, blind review, availability-based interview scheduling, and team selection.

**Technical setup, development and deployment: see [docs/SETUP.md](docs/SETUP.md).**

## Developing

You'll need **Node 22+** (see `.nvmrc`) and a Supabase project (or Docker, if you'd rather run Supabase locally).

```bash
npm install
npm run setup
```

`npm run setup` walks through the whole first-time configuration in the terminal: where your database and auth live, your keys, where you'll host, the database schema, email, and your first admin account. When it finishes it starts the app on the admin **Setup** dashboard (`/admin/?tab=setup`), which shows what's configured and links to everything else — platform branding, organizations, teams, recruiting rules, interview forms and members. Re-run it any time; it keeps whatever you don't change.

Day to day:

```bash
npm run dev            # dev server at http://localhost:5173
npm run dev -- --open  # same, and open it in a browser tab
npm run check          # type-check
npm run lint           # prettier + eslint
npm test               # Playwright end-to-end tests
```

To load an organization's configuration (teams, application forms, settings, images) from files, or to bring in existing applicants from a spreadsheet, use `npm run tenant` — see [docs/INSTANCE.md](docs/INSTANCE.md).

### Supabase

LUMA runs on [Supabase](https://supabase.com): Postgres for data, Supabase Auth for sign-in, and Storage for logos and images. `npm run setup` supports three ways of running it:

- **Supabase Cloud** (default) — a project on supabase.com.
- **Self-hosted Supabase** — your own stack ([Supabase's Docker guide](https://supabase.com/docs/guides/self-hosting/docker)).
- **Local Supabase** — `supabase start` on your machine, for development.

For security purposes, no keys are included in the repo. They live in your own `.env.local` (non-secret instance settings go in `.env`); both are gitignored, and `.env.example` / `.env.local.example` are the templates. Setup can write them for you.

The schema is in `supabase/migrations/` and is applied with `supabase db push` (setup can do this too). Emails are sent through [Resend](https://resend.com) from the Supabase Edge Functions in `supabase/functions/`; without a Resend key they run in dry-run mode and send nothing.

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

The build targets **Vercel** by default. To self-host, choose Node server or Docker in `npm run setup` (it sets `ADAPTER=node`), then either:

```bash
npm run build && node build
# or
docker compose --env-file .env --env-file .env.local up -d --build
```

Full deployment steps — environments, Supabase auth URLs, DNS and email — are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

# Background

The original motivation for the project is from a design team I am involved with at Virginia Tech called the Archimedes Society. This design team provides opportunities for freshman to be involved in design teams and engineering projects early on in their college careers.
One of the difficulties in running an organization like this is recruiting, and it takes a non traditional approach towards scheduling interviews.
Rather than having candidates be given interview slots, we consider their availability first. There are softwares like calendly which can do this, the issue is we want it to be blind, as there is a group interview.
Overall, an existing product did not exist, and other design teams don't deal with the scale we do, so they can handle this style of interview scheduling by hand. With 400+ applicants getting narrowed down to ~30 people, we have the lowest acceptance rate of a design team on campus and also are the most competitive.

Hence, I built out software to schedule everyone based on their availability, both candidate and interviewers.

LUMA has since been rebuilt as a general, multi-tenant platform: any design team or organization can run its own recruiting from one deployment, with its own teams, application forms, review rules, interview forms and branding — none of it hardcoded for any one organization. Each organization's configuration can be kept in its own files and imported (`npm run tenant`), so this public repository is a starting point for running your own ATS.

**Was used by archimedes recruitment in the Fall 2025 recruitment season to process _400+_ applicants and passed _200+_ applicants to interview rounds. This included a group and individual interview stage, scheduling _250+_ interviews.**

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
