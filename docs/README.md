# LUMA docs

Start here. Files are grouped by what they're for, not by when they were written.

## Working context (read these first)

| File                                 | What it's for                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)               | V1 decisions, scope, and conventions. **Overrides the root `/CLAUDE.md`** for V1.  |
| [FEATURES.md](FEATURES.md)           | Authoritative feature inventory with per-feature status.                           |
| [TODO.md](TODO.md)                   | Phase-by-phase engineering tracker. What is done, what is left, and why.           |
| [SETUP.md](SETUP.md)                 | Technical setup: install, `npm run setup`, development, deploying, project layout. |
| [INSTANCE.md](INSTANCE.md)           | `npm run setup`, the four config layers, and the untracked `instance/` folder.     |
| [DEPLOYMENT.md](DEPLOYMENT.md)       | How a deployment gets to production (any org, any host).                           |
| [ANALYTICS.md](ANALYTICS.md)         | PostHog wiring, how to add a new event, privacy posture, troubleshooting.          |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Tokens, shared classes, and UI conventions. **Read before writing any UI.**        |
| [DESIGN-ADMIN.md](DESIGN-ADMIN.md)   | Design for expanding the platform admin panel (`/admin`). Not yet built.           |

[SETUP.md](SETUP.md) covers installation, prerequisites, local development and deployment. The root
[`/README.md`](../README.md) is the project overview and background.
The root [`/CLAUDE.md`](../CLAUDE.md) is the general architecture guide.

## Source material

| Path         | What it is                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------- |
| [`v0/`](v0/) | Documentation for the pre-rebuild app. Historical reference only — do not treat as current. |

The V1 scoping inputs (the first tenant's background notes, scoping Q&A, interview
responses and process PDFs) were organization-specific and now live in that deployment's
untracked `instance/` folder. The decisions they produced are recorded in
[CLAUDE.md](CLAUDE.md).

## Conventions

- `FEATURES.md` says **what** exists; `TODO.md` says **what's next and why**. When they
  disagree, `FEATURES.md` is the one to trust about current state.
- Anything requiring a deployment's owner (a key, a DNS record, a decision) belongs in that
  deployment's `instance/<name>/docs/HUMAN-TODO.md`, not in the repo.
- Nothing org-specific is committed — see [INSTANCE.md](INSTANCE.md).
- `v0/` is an archive. Don't edit it to reflect new decisions — record those in
  `CLAUDE.md` or `TODO.md` instead.
