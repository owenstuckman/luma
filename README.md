# LUMA

An open-source, multi-tenant applicant tracking system for design teams and student organizations — applications, blind review, availability-based interview scheduling, and team selection.

**Technical setup, development and deployment: see [docs/SETUP.md](docs/SETUP.md).**

## Developing

Install dependencies and run the guided setup — it asks where your database and auth live (Supabase by default, or self-hosted), writes your env files, sets up the schema, and opens the admin dashboard where everything else is configured:

```bash
npm install
npm run setup
```

After that, start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Supabase

For security purposes, I am not including the anon key and url. They live in your own `.env.local`, which `npm run setup` writes for you (templates: `.env.example` and `.env.local.example`).

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

# Background

The original motivation for the project is from a design team I am involved with at Virginia Tech called the Archimedes Society. This design team provides opportunities for freshman to be involved in design teams and engineering projects early on in their college careers.
One of the difficulties in running an organization like this is recruiting, and it takes a non traditional approach towards scheduling interviews.
Rather than having candidates be given interview slots, we consider their availability first. There are softwares like calendly which can do this, the issue is we want it to be blind, as there is a group interview.
Overall, an existing product did not exist, and other design teams don't deal with the scale we do, so they can handle this style of interview scheduling by hand. With 400+ applicants getting narrowed down to ~30 people, we have the lowest acceptance rate of a design team on campus and also are the most competitive.

Hence, I built out software to schedule everyone based on their availability, both candidate and interviewers.

LUMA has since been rebuilt as a general, multi-tenant platform: any design team or organization can run its own recruiting from one deployment, with its own teams, application forms, review rules, interview forms and branding — none of it hardcoded for any one organization. Each organization's configuration can be kept in its own files and imported (`npm run tenant`), so this public repository is a starting point for running your own ATS.

**Was used by archimedes recruitment in the Fall 2025 recruitment season to process _400+_ applicants and passed _200+_ applicants to interview rounds. This included a group and individual interview stage, scheduling _250+_ interviews.**

# Internal Notes / TODO

Go to src for all of the actual website code.
Scheduling algorithms live in `src/lib/scheduling/algorithms`.
Otherwise look at the supabase folder for the backend/db (migrations and edge functions).
All docs are in `docs/` — start at [docs/README.md](docs/README.md).

- [x] write long term docs
- [x] generalize the local scheduling
- [ ] enable cron jobs for scheduling
- [x] enhanced admin view

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
