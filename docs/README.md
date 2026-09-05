# LUMA docs

Start here. Files are grouped by what they're for, not by when they were written.

## Working context (read these first)

| File                                                 | What it's for                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                               | V1 decisions, scope, and conventions. **Overrides the root `/CLAUDE.md`** for V1. |
| [FEATURES.md](FEATURES.md)                           | Authoritative feature inventory with per-feature status.                          |
| [TODO.md](TODO.md)                                   | Phase-by-phase engineering tracker. What is done, what is left, and why.          |
| [HUMAN-TODO.md](HUMAN-TODO.md)                       | Owner-only actions: accounts, DNS, secrets, decisions.                            |
| [DEPLOYMENT.md](DEPLOYMENT.md)                       | How V1 gets to production.                                                        |
| [SUPABASE-AUTH-HANDOFF.md](SUPABASE-AUTH-HANDOFF.md) | Dashboard-only auth fixes (SMTP, redirect URLs, email templates). Hand-off doc.   |
| [ANALYTICS.md](ANALYTICS.md)                         | PostHog wiring, how to add a new event, privacy posture, troubleshooting.         |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)                 | Tokens, shared classes, and UI conventions. **Read before writing any UI.**       |
| [DESIGN-ADMIN.md](DESIGN-ADMIN.md)                   | Design for expanding the platform admin panel (`/admin`). Not yet built.          |

The root [`/README.md`](../README.md) covers setup, prerequisites, and local development.
The root [`/CLAUDE.md`](../CLAUDE.md) is the general architecture guide.

## Source material

| Path         | What it is                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`v1/`](v1/) | V1 inputs: `background.md`, `Questions.md` (the Q&A that set scope), last cycle's interview CSVs, and reference PDFs. |
| [`v0/`](v0/) | Documentation for the pre-rebuild app. Historical reference only — do not treat as current.                           |

## Conventions

- `FEATURES.md` says **what** exists; `TODO.md` says **what's next and why**. When they
  disagree, `FEATURES.md` is the one to trust about current state.
- Anything requiring Owen (a key, a DNS record, a decision) belongs in `HUMAN-TODO.md`,
  not buried in `TODO.md`.
- `v0/` and `v1/` are archives of inputs. Don't edit them to reflect new decisions —
  record those in `CLAUDE.md` or `TODO.md` instead.
