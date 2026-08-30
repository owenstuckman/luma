# CLAUDE.md — V1 Context

This file is the working context for V1 development. The root `/CLAUDE.md` is the general project guide; this one captures **decisions, scope, and conventions specific to the V1 rebuild** (driven by `docs/v1/background.md` and `docs/v1/Questions.md`).

If anything here contradicts the root `CLAUDE.md`, this file wins for V1 work. When V1 ships, fold relevant pieces back into root `CLAUDE.md` and delete this file.

---

## V1 Mission

Rebuild LUMA into a **generalized, multi-tenant ATS** that handles Archimedes' four-subteam recruitment flow end-to-end: application → auto-reject → manual review → R1 interviews (auto-scheduled) → per-team R1 reject → R2 (per-team) → optional R3 follow-ups → team selection → automated decision emails.

**Target deployment:** `luma.archimedesvt.org` on Vercel + existing Supabase project. Live ASAP, quality bar high.

---

## Non-negotiables (from `docs/v1/Questions.md` answers)

1. **Multi-tenant stays.** Do not collapse `organizations` / `org_members` / `slug` routing. Generalize anything Archimedes-specific behind org settings — no hardcoded team names, no hardcoded counts.
2. **Archimedes is just the first tenant.** Teams (Infinitum, Astra, Terra, Juvo) are seed data for the Archimedes org, _not_ schema constants.
3. **Everything configurable per-org** by an admin: review thresholds (approves + rejects), auto-reject rules, scheduling algorithm, buffer time, email-on-decision toggles, blinded-review toggle.
4. **Scrap the cohort scheduler** from `docs/v1/LUMA Auto-Scheduler Problem.pdf`. R1 is simple: 1 applicant per interview slot, scheduled against interviewer availability.
5. **Quality > velocity if forced to choose**, but velocity is preferred. No half-finished features merged.

---

## Roles

**Status:** implemented in Phase 1 — `org_members.roles text[]` (migration `00016`),
the `AppRole` type in `src/lib/types/index.ts`, and the `has_app_role(org_id, role)`
RLS helper. The singular `org_members.role` column stays for back-compat with
`has_org_role`. The per-role _permissions_ below are still to be enforced in the UI.

System roles:

- `owner` — billing/org settings (existing)
- `admin` — configures rules, scheduling, emails, members
- `eboard` — same as admin in practice; coordination role, no extra perms (offline distinction)
- `advisor` — per-team; sees own team's candidates, runs R2/R3, owns selection decisions
- `interviewer` (`recruiter` in current schema — keep alias) — runs R1 interviews, submits scores
- `reviewer` — sees blinded applications in manual reject stage, casts approve/reject votes
- `viewer` — read-only (existing)
- `candidate` — applicant; auth via magic link for save-and-resume

Multi-role users are common (e.g., advisor + interviewer). Use a many-to-many membership table or a roles array; do **not** model each role as a separate user row.

---

## Adding people to an org

Three paths, documented in full in `TODO.md` Phase 3.5:

Reachable from either settings surface — the org's own page (`/private/[slug]/settings`) or
the platform admin panel (`/admin` → Orgs → Settings). Both mount the same
`OrgSettingsPanel.svelte`.

1. **Invite link** — Invite Links card. Creates an `org_invites` row and copies
   `/invite/[token]` to the clipboard. The recipient signs up or logs in and is joined
   automatically. This is the answer to "how do I add a recruiter?".
2. **Add an existing account** — the add-by-email box. Only works if they already have a
   LUMA account.
3. **Platform admin** — `adminAddUserToOrg`, the superuser path.

Invites bind to the invited email address by default; "shareable link" is a separate,
explicitly-labelled mode with an N-use cap. An invite can't grant `owner` unless its
creator is an owner.

Every accept writes an `org_invite_redemptions` row (`00023`) in the same transaction as
the `org_members` insert, so "Used by N accounts" under each invite always matches
`used_count`. If you add another path that joins someone to an org, decide deliberately
whether it belongs in that audit trail — a bare `org_members` insert will not appear
there.

---

## Application Form Model

- **One application per TEAM**, per job posting / recruitment cycle. This is the single
  most important thing to know about the model. Applying to Astra and Terra creates **two**
  `applicants` rows, each with its own `team_id`, its own `status`, and only the answers
  that team asked for. They are reviewed, interviewed and decided independently.
  - Migration `00024` introduced this. `submission_group` (uuid) ties the sibling rows
    together for auditing — it is **not** a licence to re-merge them in the UI. Never label
    an application with every team the person applied to; an Astra reviewer sees the Astra
    application. Rows created before 00024 may still carry several slugs in
    `selected_team_slugs` and were deliberately not backfilled, so tolerate both shapes.
  - `src/lib/utils/formSchema.ts` → `splitSubmissionByTeam()` performs the split, and it is
    pure, so the same function can run server-side when the submit path is hardened.
- Applicant selects 1-N teams up front. Form dynamically renders shared questions + per-team questions for selected teams only.
- Questions are JSON-schema-driven (`job_posting.questions` → `QuestionRenderer.svelte`). Already exists — extend it, don't rebuild it.
- Add to schema: `team_scope: 'shared' | { teams: string[] } | { per_team: true }`, `reject_if: <rule>`, `blinded: boolean`.
  - `{ per_team: true }` asks the question **once per team the applicant picked**, with
    `{team}` in the title/subtitle/placeholder replaced by that team's name. The form
    expands it to unique ids (`why_team::astra`); the split collapses them back to the
    authored id (`why_team`) on the row that team owns, so every application stores its
    answer under the same key and reject rules keep working against authored ids.
- **Applicant identity constraints** (migrations `00025` + `00026`) — the split was impossible to store
  until three pre-existing pieces of schema were fixed, and the reasons are worth keeping:
  - `applicants` had **`UNIQUE (email)`** and **`UNIQUE (name)`**, both now dropped. The
    email one blocked the split outright and, more broadly, made an address usable _once
    across the whole platform_ — no reapplying next cycle, no two orgs sharing a candidate.
    The name one was a live bug on its own: two applicants called "John Smith" could never
    both exist, and at 400+ applicants per cycle that is close to certain.
  - Replaced by **`applicants_job_email_team_uniq`** — `UNIQUE (job, email, team_id)
**NULLS NOT DISTINCT**`. The NULLS clause is load-bearing, not cosmetic: `team_id` is
    null for orgs with no teams and `job` is nullable, and under the default NULLS DISTINCT
    every such row compares unequal to every other, so the same form could be submitted
    unlimited times. A `23505` from this index means "already applied" — `sendApplications()`
    translates it into copy the applicant can act on.
  - **`interviews.applicant_id`** (FK to `applicants.id`) was added because
    `interviews.applicant` is the applicant's **email as text**. With one address owning
    several applications, an email join gives every sibling the same interviews — the Astra
    application would show Terra's interview and count it toward Astra's evaluation
    progress. Read `applicant_id` first; fall back to email only when it is null (legacy
    rows whose backfill was ambiguous, which by definition have no siblings).
- **Applicant email domain** — `organizations.settings.application.email_domain` (bare, e.g.
  `vt.edu`; null = unrestricted) gates the one address on the applicant row. Subdomains are
  accepted. It constrains the existing email field rather than adding a second "school
  email" question on purpose: interviews and `email_log` join applicants on that address, so
  a second address would fork the candidate's identity.
- All question types from current `QuestionRenderer` (`input`, `input_dual`, `textarea`, `radio`, `checkbox`, `checkbox_image`, `dropdown`, `availability`) plus: file upload (defer to V1.1 — see FEATURES.md), video link (URL input is fine for V1), scale 1-5 (use radio).
- **Save & resume:** magic-link auth for candidates. Partial responses persist to DB (not localStorage). Existing localStorage flow stays as a fallback for unauth'd typing-in-progress.

---

## Auto-Reject Rules

Admin-configurable per question. UI: when editing a question in the form builder, an "Auto-reject if..." section lets you pick an answer condition (e.g., dropdown answer = "No", checkbox includes "Under 18"). Stored as `reject_if: { op: 'eq'|'in'|'lt'|...', value: ... }` on the question.

On submit, server evaluates all `reject_if` rules → if any fire, applicant status set to `denied` with `metadata.auto_reject_reason`. No email triggered unless admin enables it.

---

## Review Stage (manual reject)

- **Blinded by default** — reviewers don't see name/email/year. Toggle off per-org if desired.
- **Fixed reviewer pool** assigned per job posting (not round-robin).
- Admin sets `approve_threshold` and `reject_threshold` (e.g., 3 approves → advance, 2 rejects → out). When either fires, applicant moves to next state.
- Reviewers can leave comments (existing `CommentEntry` type).

---

## Scheduling

- Keep all four algorithms (`greedy-first-available`, `round-robin`, `balanced-load`, `batch-scheduler`). Admin picks per job / per round.
- Default buffer: **5 minutes**, override per job.
- Advisors excluded from R1 interviewer pool by default (flag on member: `exclude_from_r1: true` auto-set when role includes advisor).
- `prior_team` is a manual override at the applicant level — surface in admin UI, pass as a soft preference to the scheduler.
- **Round 1:** auto-schedule against interviewer availability. One applicant per slot. No cohorts.
- **Round 2:** advisors trigger from candidate page. Two options:
  1. Auto-schedule another round (same algorithms, smaller candidate pool)
  2. Generate a Calendly-style picker link for the candidate
- **Round 3:** "Schedule Follow-Up" button on candidate page → opens the R2-style scheduler modal. No new round entity needed; just `interview.metadata.round = 3`.

---

## Selection & Decisions

- Per-candidate action buttons: **Hire / Reject / Waitlist** (per team).
- Dual-team selection conflict → dashboard flag (banner on dashboard, badge on candidate row).
- Decision triggers email **only if admin has enabled "auto-send decision emails"**. Templates per outcome, editable in settings.

---

## Email & Calendar

**Provider: Resend.** Decided 2026-08-16, resolving a long-standing docs/code split — an
earlier draft of this file specified EmailJS, but every line of shipped code already used
Resend and no EmailJS package was ever installed. Keeping Resend meant zero rewrite.
**Do not reintroduce EmailJS.**

- **Resend** is the only provider. Server-side only — the API key must never reach the browser.
- Existing send paths, all Resend: `supabase/functions/notify-interviews/`,
  `supabase/functions/send-reminders/`, `src/routes/api/email-webhook/`, and the bulk-email
  action on the review page (via `/private/[slug]/schedule/notify`).
- Secrets are Supabase Edge Function secrets, not `.env.local`:
  - `supabase secrets set RESEND_API_KEY=re_...`
  - `supabase secrets set LUMA_FROM_EMAIL="Archimedes Society <noreply@archimedesvt.org>"`
  - Without `RESEND_API_KEY` the functions run in **dry-run mode** and return a count of
    emails that would have been sent — useful for testing, and the reason a "successful"
    send may deliver nothing.
- Sending address: `noreply@archimedesvt.org`. The domain must be verified in Resend
  (SPF/DKIM records) before real delivery works.
- `src/lib/email/templates.ts` holds the templates in-repo (not in a vendor dashboard), so
  they are code-reviewed and versioned like everything else.
- Outbound events: application received, auto-rejected (optional), advanced to interview,
  interview scheduled, decision (hire/reject/waitlist). Each is individually toggleable
  through `OrgSettings.email`.
- **Calendar:** `.ics` attachments, already implemented in `src/lib/email/ics.ts`. Resend
  supports attachments natively. Google Calendar OAuth is a post-V1 follow-up — don't block on it.

---

## Observability

- **PostHog** — both product analytics (funnel: apply → submit → interview → decision) and
  error tracking. One vendor for V1; no Sentry.
- Wiring, the full event list, and **how to add a new event** live in
  **[ANALYTICS.md](ANALYTICS.md)**. Read it before adding a `capture()` call.
- Import from `$lib/analytics/posthog` — never `posthog-js` directly. The module holds the
  browser/enabled guard and the `EVENTS` constants, and it no-ops entirely when
  `PUBLIC_POSTHOG_KEY` is unset (the normal state in local dev).
- **Never put applicant content in an event property.** IDs, enums and counts only.
  Autocapture and session replay are off deliberately, and applicants are never
  `identify()`d.

---

## Code conventions (V1-specific additions to root CLAUDE.md)

- New code uses **Svelte 5 runes** (`$state`, `$derived`, `$props`). Don't migrate existing Svelte 4 components unless touching them for V1 reasons. **Exception:** a new _shared_ component that must interop with a Svelte 4 host (slots + `createEventDispatcher`) should match the host — `CandidateList.svelte` is Svelte 4 because `/review` is.
- All new DB access goes through `src/lib/utils/*.ts`. No inline `supabase.from(...)` in components. `supabase.ts` holds single-table helpers; `candidates.ts` holds cross-table aggregation (roster rows, candidate timeline). Add a new module rather than growing `supabase.ts` without bound.
- Org-scoping is **mandatory** — every new query filters by `org_id` (or relies on RLS). When in doubt, verify with `is_org_member()`.
- Settings are stored on `organizations.settings` JSONB. The canonical `OrgSettings` type and its `readOrgSettings(raw)` normalizer live in **`src/lib/types/orgSettings.ts`** (not `index.ts`). Always read settings through the normalizer — never touch `org.settings.foo` directly.
- Migrations are forward-only and additive. `00001`–`00026` exist; add `00027+` for new V1 changes. Don't consolidate.
- **Check applied migrations against the repo before trusting the DB.** Two files (`00012`,
  `00013`) sat unapplied on prod for weeks without erroring, because `candidates.ts` reads
  are deliberately failure-tolerant — the roster rendered fine and simply showed no
  interviews. `list_migrations` vs `ls supabase/migrations/` is the check.
- Anything a non-member must read (invite landing pages, public application forms) goes
  through a `SECURITY DEFINER` function, not a table read — RLS will otherwise hide the row
  from exactly the person who needs it. `get_invite_details` is the reference example, and
  it deliberately returns less than it knows.
- **After any new table or SECURITY DEFINER function, run `get_advisors({type:'security'})`
  and revoke what you didn't mean to grant.** Supabase gives `anon` and `authenticated`
  full CRUD on every new `public` table by default, and functions are `EXECUTE`-able by
  `PUBLIC` unless revoked — so a `GRANT ... TO authenticated` adds a grant without removing
  anon's. Migration `00022` is the worked example. RLS still has to be the real gate; these
  revokes are the second layer, not the first.
- Queries against tables added in `00015`–`00020` should degrade gracefully if the migration hasn't been applied yet (see the failure-tolerant pattern in `candidates.ts`).
- **UI goes through the design system — see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).** One
  visual language across recruiter, applicant, admin, and public surfaces, lifted from the
  platform admin panel. Tokens in `col.scss` (variables only), shared classes in `ui.scss`
  (loaded once by `luma.scss`, never `@use`d from a component). Never write a raw hex in a
  component; never redefine a shared class locally. If two pages need the same furniture it
  belongs in `ui.scss`, if one page needs it keep it local.
- `h4` is **left-aligned** globally. It used to be centred, which every recruiter page
  undid with an inline `style="text-align: left"`. The applicant flow opts back in with
  `class="text-center"`.

---

## Out of scope for V1 (explicit)

- Cohort-based group/individual interview pairing (the deck's model)
- Custom rubrics per round
- Modeling eboard↔advisor coordination assignments (offline)
- Video/artifact upload as a _required_ field (URL link is fine)
- Self-hosted Docker path (Dockerfile stays in repo, untested)
- Migration consolidation
