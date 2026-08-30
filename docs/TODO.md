# TODO.md — V1 Build Tasks (Claude)

Engineering work tracked here. Human-side work (DNS, accounts, etc.) lives in `HUMAN-TODO.md`. Deployment plan in `DEPLOYMENT.md`.

Order is roughly the build order — earlier phases unblock later ones. Within a phase, items can parallelize.

---

## Snapshot — what's actually left

Phases 0, 1, 1.5, 1.6, 1.7, 4.5 and 6 are done. Everything still outstanding, in rough
dependency order:

| #   | Work                                                                 | Blocks                         |
| --- | -------------------------------------------------------------------- | ------------------------------ |
| ⛔  | **Upgrade Windows Node to 22+** (owner action)                       | All Windows dev                |
| 2   | Save-and-resume drafts + magic link; submit confirmation email       | —                              |
| 2   | Move auto-reject enforcement server-side                             | Launch hardening               |
| 3   | Reviewer-pool assignment UI; filter `/review` to the current user    | Needs 3.5                      |
| 3   | Move blinded redaction server-side                                   | Launch hardening               |
| 3.5 | Membership leftovers: `roles[]` editor, `review_weight` field        | Phase 3 pool, Phase 4 advisors |
| 4   | Scheduling polish, buffer setting, advisor exclusion, R2/R3 triggers | Needs 3.5 for advisors         |
| 5   | Hire/reject/waitlist decisions + automated emails                    | —                              |
| 7   | Pre-launch QA, E2E, load test, security pass                         | Everything above               |

Invite links shipped, so "how do I add someone to my org?" is answered — what's left in
3.5 is the `roles[]` and `review_weight` editors, not the invite path itself.

Phase 6.5 (design system) is done: the whole app now renders one visual language, defined
in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Read that before adding any UI.

Cross-cutting, not tied to one phase:

- **No unit test runner.** `formSchema.ts` and `review.ts` are pure logic verified only by
  throwaway assertion scripts (33 and 29 respectively) that were never committed. The
  formSchema one caught a real bug (`Number('')` is `0`, so a `lt` GPA rule rejected every
  blank answer). Recommend `vitest` — Vite is already here, so it's near-zero config.
- **Client-side trust.** Auto-reject and blinded redaction both run in the browser. Neither
  is a new hole (`sendApplication()` already trusts the client for every answer), but both
  should move server-side before launch.
- **`CommentEntry` has no timestamp**, so review votes sort last on the candidate timeline.

## Phase 0 — Audit & Cleanup ✅ (complete)

- [x] **Git status assessed.** 89/93 "modified" files were pure CRLF noise from Windows/WSL line endings; only the 4 docs we edited had real changes. No commit/revert needed — `npm run format` normalized everything. _(Recurred afterward; permanently fixed in Phase 1.6 with `.gitattributes`.)_
- [x] **`npm install` + `npm run check` + `npm run lint`** all green. Fixes applied:
  - `src/hooks.server.ts`: `event.url.pathname` instead of `event.request.url.pathname`; cast supabase client through `unknown` to bridge `@supabase/ssr` ↔ `@supabase/supabase-js` generic mismatch.
  - `src/app.d.ts`: dropped reference to nonexistent `./database.types.ts`; `SupabaseClient` no longer parameterized (acceptable for V1 — generate types in Phase 1).
  - `src/routes/private/[slug]/+layout.svelte`: added missing `metadata: {}` to platform-admin synthetic `OrgMember`.
  - `src/routes/private/[slug]/review/+page.svelte`: `getActiveRoles(orgId ?? undefined)` to satisfy `number | undefined` signature.
  - `src/lib/scheduling/algorithms/batch-scheduler.ts`: removed dead `hasHardRuleMatch` helper.
  - `src/lib/scheduling/algorithms/max-placement.ts`: removed unused `startStr`/`endStr` locals.
  - `scripts/setup.mjs`: dropped unused `readFileSync`, `copyFileSync` imports.
  - `src/routes/auth/+page.server.ts`: dropped unused `url` destructure.
  - `src/routes/private/[slug]/settings/+page.svelte`: prettier had mangled an angle-bracketed placeholder into broken Svelte; rewrote as `noreply@archimedes.vt.edu`.
- [x] **Toolchain upgrades** done during cleanup:
  - Reinstalled `node_modules` to fix `@rollup/rollup-linux-x64-gnu` missing-optional-deps bug (lockfile was Windows-generated).
  - Pinned `prettier@3.6.2` — `3.9.1` had a `getVisitorKeys` regression with Svelte files.
  - Upgraded `typescript-eslint` and `prettier-plugin-svelte` to latest.
  - Added `.claude/` to `.prettierignore`.
  - In `eslint.config.js`: disabled `@typescript-eslint/no-unused-vars` for `.svelte` files (incompat with svelte-eslint-parser + projectService; svelte-check covers this already). Downgraded 9 pre-existing rule violations to `warn` (200+ findings, all style/best-practice from newer plugin versions — not real bugs, defer to a quality pass).
- [x] **`archive/` deleted** — confirmed zero imports referenced it.
- [ ] ~~Delete `docs/v0/`~~ — kept as historical reference (versioned alongside `docs/v1/`).
- [x] **`npm run build`** clean (one harmless `@opentelemetry/api` soft-import warning from supabase-js).
- [ ] Open the app locally against current Supabase, walk: signup → create org → create job → submit application → review → schedule. _Skipped here — needs human in the loop with running browser. Recommend doing during Phase 7 QA._
- [x] Verify migrations 00001-00013 applied to prod Supabase. **Done 2026-08-18 — and it
      found two that were not applied:** `00013_rename_interview_columns` (so 891 interview
      rows are invisible to every query) and `00012_org_assets_bucket` (so logo upload
      fails). `00011` is applied; `00001` predates migration tracking but its schema is
      present. _Owner action to apply the two — see `HUMAN-TODO.md`._

**Net result:** lint green (0 errors / 203 warnings), check green (0 errors / 117 warnings), build green. Safe to start Phase 1.

## Phase 1 — Schema & Types Foundation ✅ (complete)

- [x] **`00014_v1_question_schema.sql`** — documents the extended question JSON shape (`team_scope`, `reject_if`, `blinded`); adds a light `jsonb_typeof` CHECK on `job_posting.questions` to enforce the outer object/`steps` array shape. Forward-compatible (extra keys not validated).
- [x] **`00015_v1_teams.sql`** — `teams` table (org-scoped: `name`, `slug`, `description`, `display_order`, `active`), unique on `(org_id, slug)`, GIN-friendly RLS via `is_org_member` / `has_org_role`. Seeds Infinitum / Astra / Terra / Juvo for the Archimedes org (idempotent).
- [x] **`00016_v1_member_roles.sql`** — adds `roles text[]` to `org_members`, backfills from singular `role` (legacy `recruiter` → `['interviewer', 'recruiter']`), GIN index, and new helper `has_app_role(org_id, role_name)` that checks both `roles[]` and the singular `role` for back-compat.
- [x] **`00017_v1_application_drafts.sql`** — drafts table for save-and-resume (`email`, `job_id`, `data` JSONB, `selected_team_slugs`, `magic_token` UNIQUE, `expires_at` default +14d). Public INSERT allowed; SELECT/UPDATE go through server endpoints (token verified server-side). Auto-updates `updated_at` via trigger.
- [x] **`00018_v1_reviewer_pool.sql`** — `job_reviewers` join (`job_id`, `user_id`, `weight` for weighted scoring). Seeds `review_thresholds` defaults into `organizations.settings` for any org missing them (non-destructive jsonb merge).
- [x] **`00019_v1_decisions.sql`** — `decisions` table with `decision_outcome` enum (`hire | reject | waitlist`), one row per `(applicant, team)`, `email_sent_at` for outbound tracking. RLS allows advisors + admins to write, all org members to read.
- [x] **`00020_v1_applicant_prior_team.sql`** — `applicants.prior_team_id` (nullable FK to teams) and `applicants.selected_team_slugs text[]` for the teams the applicant chose at submission.
- [x] **`src/lib/types/index.ts`** — added `AppRole`, `Team`, `ApplicationDraft`, `Decision`, `DecisionOutcome`, `JobReviewer`, `TeamScope`, `RejectRule`; extended `OrgMember` with `roles: AppRole[]`, `FormQuestion` with `team_scope` / `reject_if` / `blinded`, `Applicant` with `prior_team_id` / `selected_team_slugs`.
- [x] **`src/lib/types/orgSettings.ts`** — canonical `OrgSettings` type covering `review_thresholds`, `scheduling`, `email`. Hand-rolled `readOrgSettings(raw)` normalizer (no zod): missing/malformed keys fall back to `DEFAULT_ORG_SETTINGS`, never throws. Always read settings through this — never touch `org.settings.foo` directly.
- [x] Fixed downstream type break: platform-admin synthetic `OrgMember` in `src/routes/private/[slug]/+layout.svelte` now carries `roles: ['owner']`.

**Net result:** `npm run check` (0 errors), `npm run lint` (0 errors), `npm run build` clean. 7 new migrations land additively (no drops, no renames). Safe to start Phase 2 once migrations are applied to Supabase.

**✅ Applied 2026-08-16** via the Supabase MCP server, each migration registered separately
in Supabase's migration history. All four V1 tables exist with RLS + policies, the Archimedes
teams are seeded, and security advisors report 0 ERROR-level findings. See `HUMAN-TODO.md`
for the full verification. **Everything gated on "migrations not applied" is now unblocked.**

## Phase 1.5 — Candidate Profiles & Roster ✅ (complete)

Added to scope mid-build: a single place to see every candidate and click through
to their full history.

- [x] **`src/lib/utils/candidates.ts`** — the only module that joins the pipeline tables.
      `getCandidates(orgId, jobId?)` returns `CandidateRow` (applicant + job name, team
      names, interview/evaluation counts, avg rating, decisions, derived stage, hire-conflict
      flag). `getCandidateTimeline(orgId, applicant)` unions `application_drafts`,
      `applicants`, `interviews` (scheduled / held / evaluated), `decisions`, `email_log`,
      and inline comments into one sorted `TimelineEvent[]`. Queries against V1 tables are
      failure-tolerant so an un-migrated deployment degrades instead of erroring.
- [x] **`CandidateList.svelte`** — shared list owning search / stage+status filter / sort /
      pagination / selection, with card and table views. Host pages supply toolbar buttons
      via the `actions` slot and bulk UI via `bulk` / `bulk-panels`.
- [x] **`/private/[slug]/candidates`** — org-wide roster: stage-count strip, hire-conflict
      banner, job filter, bulk status update, CSV export.
- [x] **`/review` refactored onto `CandidateList`** — keeps its job picker, realtime toast,
      and all four bulk actions; gains stage/rating/decision columns. Realtime INSERT now
      re-fetches instead of pushing the raw row (the list needs enriched state).
- [x] **Timeline card on `/review/candidate`** — chronological pipeline history with
      per-kind icons/colors. Back link honors `?from=candidates`.
- [x] **Sidebar** — new "Candidates" item (`currentStep === 8`), desktop + mobile drawer.

Known gaps, deliberately left for later phases:

- Inline comments have no stored timestamp, so they sort to the end of the timeline
  labeled "No timestamp". Fix when Phase 3 replaces them with timestamped votes.
- Round numbers are derived by ordering interviews on `start_time`. Switch to
  `interview.metadata.round` once Phase 4 writes it.
- Stage transitions aren't recorded as events (no audit table); stage is derived at
  read time from current state.
- `/candidates` shows all org candidates to any member. Revisit if Phase 3 blinded
  review needs to apply here too.

## Phase 1.6 — Cross-platform dev environment ✅ (complete)

The repo lives on a Windows drive and is used from both PowerShell and WSL, which share
one `node_modules` and one working tree. Two recurring failures came from that:

- [x] **`npm run dev` failed in PowerShell.** Rollup, esbuild, and lightningcss each ship
      their native binary as a separate platform-specific package, and `npm install` only
      fetches the one matching the installing OS. Phase 0 reinstalled from WSL, so only
      `rollup-linux-x64-gnu` / `@esbuild/linux-x64` / `lightningcss-linux-x64-gnu` were
      present and Windows died with `Cannot find module @rollup/rollup-win32-x64-msvc`.
      Fixed by installing both platforms' binaries side by side — they're inert on the OS
      they don't match, since each library resolves from `process.platform` at runtime.
- [x] **`scripts/cross-platform-deps.mjs` + `npm run deps:cross`** — restores the other
      platform's binaries after any `npm install`, pinned to the installed host versions.
      Uses `--no-save --force` so the manifests stay byte-identical (verified by diff).
      Deliberately not a `postinstall` hook: Vercel builds on Linux.
- [x] **`.gitattributes` (`* text=auto eol=lf`)** — ends the recurring CRLF churn that
      showed ~17 migration/Dockerfile/CSV files as fully modified whenever the OS changed.
      Adding it cleared them from `git status` immediately, with no renormalize commit
      needed (the index was already LF).
- [x] **Docs refreshed** — root `CLAUDE.md` had stale routing (`/applicant/1_verification`,
      `/private/recruiter/*`), a stale table list, a claim that no Svelte stores exist, and a
      reference to the deleted `archive/`. README gained the cross-platform section, the
      candidate-roster feature, and the V1 tables.

**Open issue surfaced here, resolved 2026-08-16:** the docs specified **EmailJS** while all
shipped code used **Resend**. Owen chose Resend — zero rewrite. See Phase 4.5.

## Phase 1.7 — Windows runtime fixes ✅ (complete)

Phase 1.6 fixed _a_ cross-platform problem but not all of them. Windows was still unusable:
`npm install` errored and `npm run dev` returned 500 on every page. Two independent causes.

- [x] **Node 20 on Windows → 500 on every SSR route.** `@supabase/realtime-js` requires a
      native global `WebSocket` and hard-gates on `nodeVersion >= 22`. Under Node 20 the
      server client throws the instant it is constructed in `src/hooks.server.ts`:
      `Error: Node.js 20 detected without native WebSocket support`. WSL was on Node 25 and
      worked, which is why this looked Windows-specific rather than version-specific.
      The same Node 20 caused the `EBADENGINE` install failures (`sass`, `chokidar`,
      `readdirp`, `eslint-visitor-keys` all want `>=20.19`), made hard errors rather than
      warnings by the pre-existing `engine-strict=true` in `.npmrc`.
      **Recorded as `engines.node: ">=22"` + `.nvmrc`.** _Owner action to upgrade — see
      `HUMAN-TODO.md`._
- [x] **`deps:cross` only handled the top-level copy of each native dep.** A package can
      appear many times in the tree at different versions — this repo has `esbuild` four
      times across three versions (top-level, plus nested under `vite` and
      `@sveltejs/adapter-vercel`), and `rollup` twice. Each copy loads a binary of its own
      version and refuses any binary whose version differs, with a
      `Host version ... does not match binary version ...` error. The script now walks the
      whole tree and places a correctly-versioned binary beside every copy.
- [x] **Nested installs can't use `npm install --prefix <dir>`.** npm then reads that
      dependency's own `package.json` as a project manifest, and vite's declares
      `link:./src/types`, which only resolves inside vite's repo → `EUNSUPPORTEDPROTOCOL`.
      Nested targets go through `npm pack` + tar extract instead, which is safe because
      these platform packages are a prebuilt binary plus a manifest, with no install scripts.

**Verified:** Windows `npm run build` passes (it failed before); Windows dev server starts
and serves. WSL `build` / `lint` / `check` unchanged. The only remaining Windows blocker is
the Node upgrade, which needs Owen.

## Phase 2 — Form Builder + Application Flow — 🔧 in progress (only save-and-resume left)

Done:

- [x] **`src/lib/utils/formSchema.ts`** — pure, DB- and DOM-free schema logic, so the same
      code runs on the client (hiding questions live) and on a server endpoint later.
      Exports `isQuestionVisible` / `visibleSteps` (team_scope) and
      `matchesRule` / `evaluateRejectRules` / `describeRejectMatch` (reject_if).
      **Safety property:** apart from `falsy`, no rule fires on an unanswered question —
      auto-reject is silent and destructive, so "skipped it" must never be treated as
      "gave the disqualifying answer".
- [x] **Verified with 33 assertions** (`esbuild` transpile + `node:assert`; no test runner
      is installed — see the open question below). This caught a real bug before it shipped:
      `Number('')` is `0`, so a `lt` rule on GPA auto-rejected every applicant who left the
      field blank. Fixed by rejecting blank input in `toNumber`.
- [x] **Team picker step** on `/apply/[slug]/[job_id]` — inserted after Personal Info, only
      when the org has teams. Selection persists to `localStorage` and is validated before
      advancing. Slugs that no longer exist are dropped on load.
- [x] **team_scope honored** — later steps render only questions in scope for the picked
      teams, and steps emptied by filtering are skipped rather than shown blank.
- [x] **Auto-reject on submit** — evaluated against _visible_ questions only, so a rule on a
      team the applicant didn't pick can't reject them. Sets `status: 'denied'` and writes
      `metadata.auto_rejected` / `auto_reject_reasons` / `auto_rejected_at` for the audit trail.
- [x] **Graceful degradation** — `getTeams()` returns `[]` if the `teams` table is missing,
      and `selected_team_slugs` is only sent when non-empty. An org without migrations
      `00015`/`00020` keeps a working application form instead of 400-ing on unknown columns.
      Verified against the live DB, which currently has neither table.

- [x] **Form builder UI** — shipped at `/private/[slug]/settings/jobs/[job_id]` (not a
      separate `/builder` route: the job edit page already owned the schema, so a second
      route would have split ownership of the same JSON). Add/remove/reorder steps and
      questions, edit type/title/options, and set the V1 per-question metadata
      (`team_scope`, `reject_if`, `blinded`). Unset keys are omitted from the stored JSON
      rather than written as nulls, and a live preview renders the form as an applicant
      sees it.

Remaining:

- [ ] Save-and-resume — **unblocked** (provider decided: Resend, 2026-08-16). The last
      substantial Phase 2 item:
  - [ ] Magic-link endpoint: `POST /api/applicant/start` → emails resume link
  - [ ] Draft autosave on form change (debounced 1s) → `application_drafts`
  - [ ] Resume route loads draft by token, prefills form
- [ ] Confirmation email on submit — template ready (`applicationReceivedEmail` in
      `src/lib/email/templates.ts`); needs the send call wired to Resend.
- [ ] Update `/apply/[slug]/[job_id]/success/+page.svelte` to handle both happy path and auto-rejected (different copy if admin enables auto-reject email).
- [ ] **Move auto-reject enforcement server-side.** It currently runs in the browser, so a
      crafted request could skip it. Severity is low — the existing `sendApplication()` already
      trusts the client for name, email, and every answer, so this is consistent with the
      current trust model rather than a new hole, and the fallback is that a human reviews
      the applicant instead. Harden with the rest of the submit path.

**Open question — no unit test runner.** `formSchema.ts` is exactly the kind of pure logic
that wants unit tests, and its first version shipped a real bug that assertions caught.
`npm test` only runs Playwright. Recommend adding `vitest` (Vite is already present, so it's
near-zero config) and committing the 33 assertions as a real suite. Not done unprompted
because it adds a dev dependency.

## Phase 2.6 — Per-team applications + the Archimedes 2026 form ✅

Requested 2026-08-29: build the **2026 Fall Recruitment** form for Archimedes, and treat an
application to each team as a **distinct** application rather than one row tagged with
several teams.

### The model change

- [x] **`00024_per_team_applications.sql`** — `applicants.team_id` (FK to `teams`) and
      `applicants.submission_group` (uuid), plus indexes. Backfills `team_id` only where
      `selected_team_slugs` held exactly one slug; historical multi-team rows are left alone
      because splitting them would have to invent which answers belonged to which team, and
      the per-team essays those rows would need were never collected.
- [x] **`splitSubmissionByTeam()`** in `formSchema.ts` — pure. Turns one filled-in form into
      one submission per selected team, carrying the shared answers plus only that team's
      scoped questions. An Astra reviewer never sees the Terra essay.
- [x] **`per_team` team scope** — `team_scope: { per_team: true }` asks a question once per
      team the applicant picked, substituting `{team}` in the title/subtitle/placeholder.
      The form expands it to unique ids (`why_team::astra`) so inputs can be keyed; the
      split collapses them back to the authored id (`why_team`) on the row that team owns.
      That collapse is what keeps rows comparable and lets `reject_if` keep matching against
      authored ids.
- [x] **Auto-reject is now per application.** Rules are evaluated against one team's answers
      under one team's scope, so "No" to the Astra citizenship question denies the Astra
      application and leaves Terra/Juvo pending.
- [x] **Ordering is the org's, not the applicant's.** Expansion and the split both order by
      `teams.display_order`, so two applicants who pick the same pair always see the same
      sequence regardless of click order.

### Constraints that made the split impossible (found by testing, not by reading)

- [x] **`00025_applicant_uniqueness.sql` + `00026_interview_applicant_id.sql`.** An `anon`-role insert of two sibling
      rows failed on `applicants_email_key`. Investigating turned up two bad constraints:
  - `UNIQUE (email)` — blocked the split, and more broadly made an address usable **once
    across the entire platform**: no reapplying in a later cycle, and no two orgs ever
    sharing a candidate.
  - `UNIQUE (name)` — a live bug unrelated to teams. Two applicants named "John Smith" could
    never both exist; at 400+ applicants a cycle that is close to certain, and the second
    one's submission would have failed with a constraint error they could not act on.
  - Replaced with `UNIQUE (job, email, team_id) NULLS NOT DISTINCT`. **The NULLS clause is
    load-bearing** — `team_id` is null for orgs with no teams and `job` is nullable, and
    under the default every such row compares unequal to every other, so the same form could
    be submitted unlimited times.
  - `interviews.applicant_id` added. `interviews.applicant` is the applicant's **email as
    text**, so once one address owns several applications an email join hands every sibling
    the same interviews — the Astra row would show Terra's interview and count it toward
    Astra's evaluation progress. Backfilled only where the email mapped to exactly one row.
- [x] A `23505` from the new index is translated by `sendApplications()` into "you have
      already applied to one of these teams", instead of a generic failure the applicant can
      only respond to by retrying and failing again.

### The Archimedes form

- [x] **`job_posting` id 7, "2026 Fall Recruitment"**, seeded in `00024`. Shared: major,
      expected graduation year (`blinded`), "Why are you interested in Archimedes?".
      Per-team: "Why are you interested in {team}?". Team-scoped: Astra → U.S. citizen or
      permanent resident; Infinitum → 18 or older. Terra and Juvo add nothing beyond the
      shared set. Both eligibility questions auto-reject on "No".
- [x] **VT email enforced as an org setting**, not a second question —
      `settings.application.email_domain = 'vt.edu'`, with subdomains accepted and null
      meaning unrestricted. Any org can set its own. It gates the existing address on
      purpose: interviews and `email_log` join applicants on that address, so a second
      "school email" field would fork the candidate's identity.
- [x] Applicant-facing copy states plainly that each team is submitted as its own
      application, and the review step says how many are about to be sent.
- [x] **Fixed a pre-existing bug** in the review step: "click a section to edit" jumped to
      `stepIndex + 1`, ignoring the team-picker step, so with teams configured every edit
      link landed one step short.

### Verified

- Pure logic exercised directly: picking Terra + Astra shows Astra's citizenship question
  and not Infinitum's, expands `why_team` into both teams in org order, and splits into two
  applications — Astra denied, Terra pending, neither carrying the other's essay.
- `anon`-role inserts confirmed against prod inside a rolled-back transaction: two sibling
  rows accepted, a duplicate Astra application rejected by the unique index, and a different
  team for the same person still allowed.

---

## Phase 3 — Review Stage (1-2 days) — 🔧 in progress

Done:

- [x] **`src/lib/utils/review.ts`** — pure review logic: `normalizeVote`, `tallyVotes`,
      `thresholdOutcome`, `votesRemaining`, `buildWeightMap`, `redactApplicant`, `shouldBlind`.
      **Verified with 29 assertions.**
- [x] **Approve/reject voting + auto-advance** on the candidate page. Votes are stored as
      comments (so they appear in the existing thread and the timeline) and crossing a
      threshold updates `applicants.status` immediately — the auto-advance option from the
      Open Decisions list.
- [x] **Last vote wins per reviewer.** A reviewer who changes their mind is counted once;
      without this they'd be double-counted and could cross a threshold alone.
- [x] **Split votes never advance.** Rejection is evaluated first, so an applicant meeting
      both thresholds is denied rather than silently advanced into interviews.
- [x] **Legacy vote spellings normalized** — `positive`/`accepted`/`yes` and
      `negative`/`denied`/`no` all count, so comments written before Phase 3 still tally.
- [x] **Weighted scoring** — reads `org_members.metadata.review_weight`; missing, non-numeric,
      or negative values fall back to 1 so a bad value can't erase someone's vote. Weights key
      off real emails via the `get_org_members_with_email` RPC (`org_members` only stores `user_id`).
- [x] **Blinded review** — plain reviewers see `Applicant #<id>`, a hidden email, and `[hidden]`
      for any answer whose question is flagged `blinded`. Advisors/admins/owners/eboard always
      see the real record. Redaction copies rather than mutates the source object.
- [x] **Per-question `blinded` / `team_scope` / `reject_if` controls in the form builder**
      (`settings/jobs/[job_id]`) — completes the Phase 2 builder item. Keys are omitted from
      the stored JSON when unset, and the reject operand is validated before the question can
      be added. Badges + a one-line summary surface the metadata on collapsed rows.

Remaining:

- [ ] Reviewer pool assignment UI on job edit page (needs `job_reviewers`, migration 00018).
- [ ] `/private/[slug]/review` — filter the list to the current user's assigned applications.
- [ ] **Move blinding server-side.** It is currently a client-side redaction, so the
      un-blinded record still reaches the browser. Fine for an honest-reviewer model, not for
      a hostile one — do it in a `+page.server.ts` load before launch.
- [ ] Auto-advance currently runs only when a vote is cast from the candidate page. A
      applicant whose threshold is crossed by a bulk comment won't advance until someone
      opens them. Consider a DB trigger or a nightly sweep.

## Phase 3.5 — Org Membership & Roles — 🔧 in progress (invites + admin move done)

**Why this is its own phase:** Phase 3's reviewer pool and Phase 4's advisor exclusion both
key off `org_members.roles[]`, and _nothing in the app can currently write that column_.
That is what still blocks them.

### Where org settings live (settled 2026-08-21)

**Two surfaces, one component.** `src/lib/components/admin/OrgSettingsPanel.svelte` is
mounted in both places, so they cannot drift:

| Surface                    | Who                              | Reached via                          |
| -------------------------- | -------------------------------- | ------------------------------------ |
| `/private/[slug]/settings` | That org's own `admin` / `owner` | Sidebar → Settings (`currentStep` 6) |
| `/admin` → Orgs → Settings | Platform admins, for any org     | Orgs tab → the org's Settings button |

Both cover org profile, logo, email settings, email log, members, and invite links. Every
write is RLS-gated on `has_org_role(org_id, 'admin')`, so mounting the panel on the org
page grants nothing a non-admin could act on.

Briefly, on 2026-08-21, org settings were moved to platform-admin-only and the org page was
deleted. That was reverted the same day: it left orgs registering through `/register` unable
to brand themselves, add members, or issue invites, which made `/register` a dead end.

**Platform-admin grants** are the one thing gated further. When the viewer is a platform
admin, each member row gains a shield button that grants or revokes platform admin for that
person, with a confirm spelling out that it means every org. Ordinary org admins never see
it, and `add_platform_admin_by_email` enforces the same rule server-side. `/admin` → Admins
still has the standalone add-by-email form.

### Adding people to an org — how it works now

Three paths, in the order you'd reach for them:

1. **Invite link (new, migration `00021`).** Settings → **Invite Links** (either surface). Pick
   "Invite one person" (bound to that email address, single use) or "Shareable link"
   (anyone holding it, up to N uses), set a role and an expiry, and the link is created
   and copied to the clipboard. The recipient opens `/invite/[token]`, signs up or logs
   in, and is joined automatically. Admins and owners only.
2. **Add an existing account.** The add-by-email box, backed by `invite_member_by_email()`
   (migration `00004`). Only works if the person already has a LUMA account — it looks the
   address up in `auth.users`. Kept because it's one click when they're already signed up.
3. **Platform admin.** `/admin` → `adminAddUserToOrg`, a superuser path, not an
   org-owner one.

Design notes on the invite path, since they constrain what can change later:

- The accept flow never reads `org_invites` directly — the person accepting is by
  definition not yet a member, so RLS would hide the row. Everything goes through
  `SECURITY DEFINER` functions (`get_invite_details`, `accept_org_invite`).
- `get_invite_details` is granted to `anon` so the landing page renders logged-out, and it
  deliberately does **not** return the invited email address — a guessed token leaks
  nothing but an org name.
- **Trust model decided:** an email-bound invite verifies the accepting user's address
  matches. A forwarded link cannot join a stranger. Open links are opt-in and explicitly
  labelled "anyone with the link".
- `accept_org_invite` takes `FOR UPDATE` on the row so two simultaneous accepts can't both
  slip past `max_uses`.
- An invite cannot grant `owner` unless the creator is themselves an owner.
- **Redemptions are recorded per account (migration `00023`).** `used_count` alone answers
  "how many", which is useless for a link posted in a group chat. `org_invite_redemptions`
  adds one row per accept — written in the same transaction that increments `used_count`
  and inserts the `org_members` row, so the count and the names can never disagree. The
  invite list shows "Used by N accounts", expandable to addresses and timestamps.
- The redemption row stores the email **as it was at accept time** and keeps the row when
  the account is deleted (`user_id` goes null, the address survives). Reads prefer the
  account's current address so the list matches the Members table, and flag anyone who has
  since been removed from the org rather than implying the roster is bigger than it is.
- No backfill was possible — redemptions before `00023` were never recorded, so older
  invites show their `used_count` with an explicit "no record of who" note instead of a
  misleading empty list.
- Signup carries `redirect` through the confirmation email
  (`/auth/confirm?next=/invite/...`), so a brand-new user isn't stranded on `/` after
  confirming their address.

### Tasks

- [x] **Real invitations** for people without accounts — `org_invites` table (`00021`), the
      five RPCs, `/invite/[token]`, and the Invite Links card on the settings page with copy
      and revoke.
- [x] **Extracted org settings into `OrgSettingsPanel.svelte`**, mounted on both the org
      settings page and the platform admin Orgs tab, plus platform-admin grant/revoke on
      each member row for platform admins.
- [x] **Grant hardening (`00022`).** The security advisor flagged that Supabase's defaults
      had given `anon` and `authenticated` full CRUD on `org_invites`, and that the `GRANT`s
      in `00021` had added `authenticated` without removing `anon`'s inherited `PUBLIC`
      execute. RLS was holding (anon read 0 rows, verified with `set local role anon`) and
      every admin function fails closed for an anonymous caller — but a table full of join
      tokens shouldn't sit one policy away from exposure. `anon` now has nothing on the
      table and can execute only `get_invite_details`, which is designed for untrusted
      callers.
- [x] **Track who used each invite link (`00023`).** `org_invite_redemptions` +
      `get_invite_redemptions()`, surfaced as an expandable "Used by N accounts" row under
      each invite on both settings surfaces. Same admin-only audience as the invites
      themselves; `anon` has nothing on the table and cannot execute the function.
- [x] **Decide the trust model for invite acceptance.** Bound to the invited address; open
      links are a separate, explicit mode.
- [ ] **Send the invite by email** rather than only copying the link. The Resend path
      exists (`schedule/notify` pattern); this just needs a template and a call.
- [ ] **Multi-role editor** on the Members table — checkboxes over `AppRole`, writing
      `org_members.roles[]`. Keep the singular `role` in sync (it still backs `has_org_role`
      and therefore most RLS policies) rather than dropping it. `org_invites.roles[]`
      already exists and is applied on accept, so the invite side is ready for this.
- [ ] **New migration** — `update_member_roles(target_org_id, target_user_id, roles text[])`,
      `SECURITY DEFINER`, admin/owner-gated, validating every entry against the `AppRole` set
      and refusing to strip the last owner.
- [ ] **`review_weight` field** on each member row (number, default 1). Small input next to
      the role editor; validate `> 0` before writing.
- [ ] Show each member's roles on the Members table (badges), not just the singular role.

### Open question

Should an org owner be able to invite someone as `owner`? `create_org_invite` currently
allows it but only when the creator is an owner. `remove_org_member` still refuses to
remove owners, so a mistaken owner grant remains unrecoverable through the UI. Recommend an
explicit "transfer ownership" action rather than the normal role editor —
`adminTransferOwnership` already exists for the platform-admin path and can be mirrored.

## Phase 4 — Scheduling Polish (1-2 days)

- [ ] Verify all four algorithms run end-to-end against real data. Write a smoke test per algorithm.
- [ ] Algorithm picker dropdown on job scheduling page (likely already there — confirm).
- [ ] Buffer-time setting on job (default 5min from `org.settings`).
- [ ] Advisor exclusion: scheduler reads `org_members.roles` — if includes `advisor`, exclude from R1 candidate pool unless explicitly overridden.
- [ ] `prior_team_id` admin override UI on candidate row. Pass to scheduler as soft preference.
- [ ] R2 trigger: "Schedule Round 2" button on candidate page → modal with two options: auto-schedule | candidate-picks-slot link.
- [ ] Candidate-picks-slot flow: tokenized URL `/schedule/pick/[token]` → shows available slots → writes interview on selection.
- [ ] R3 "Schedule Follow-Up" button — same modal, sets `interview.metadata.round = 3`.

## Phase 4.5 — Email layer on Resend ✅ (templates done)

Provider decided 2026-08-16: **Resend**. No code changed — everything already used it.

- [x] All EmailJS references purged from `docs/CLAUDE.md`, `docs/DEPLOYMENT.md`,
      `docs/HUMAN-TODO.md`. `DEPLOYMENT.md`'s env-var and DNS tables now describe
      `RESEND_API_KEY` / `LUMA_FROM_EMAIL` as Supabase Edge Function secrets.
- [x] **Three new templates** in `src/lib/email/templates.ts`, matching the existing
      plain-text `EmailDraft` style: `applicationReceivedEmail`, `autoRejectedEmail`,
      `decisionEmail` (hire / reject / waitlist, with an optional admin-authored override).
      **Verified with 14 assertions**, including two deliberate guarantees: - the auto-reject email **never says which rule fired** — naming the disqualifying
      answer just teaches people how to game a resubmit; - **reject and waitlist share a subject line**, so the outcome isn't spoiled in the
      inbox preview before the applicant opens it.
- [x] Fixed a typo in `.env.local`: `UPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`
      (missing leading `S`). Any server code reading the correct name was getting `undefined`.

Remaining — the **send path**, which is an architecture decision, not just wiring:

- [ ] Interview emails already send via the `notify-interviews` edge function, proxied
      through `/private/[slug]/schedule/notify` with the recruiter's JWT. Decision emails
      can reuse that pattern directly (recruiter-authenticated).
- [ ] The **application confirmation is different** — it fires for an _unauthenticated_
      applicant at submit time, so it cannot go through the JWT-proxied endpoint. Options:
      (a) a new edge function invoked with the anon key, (b) a Postgres webhook on
      `applicants` INSERT, or (c) a SvelteKit server endpoint holding the Resend key.
      (b) is the most robust — it can't be skipped by a client that never calls it.
- [ ] Wire `OrgSettings.email` toggles to each send.
- [ ] Record every send in `email_log` (table exists, migration 00010).

## Phase 5 — Selection & Decision Emails (1 day)

- [ ] Hire / Reject / Waitlist buttons per team on candidate page. Writes to `decisions` table.
- [ ] Dual-team conflict detection: if `decisions` has 2+ `hire` rows for same applicant across teams → flag.
- [ ] Dashboard conflict banner + per-row badge in candidate list.
- [ ] Settings page section: "Automatic decision emails" toggle + per-outcome template editor (hire, reject, waitlist). Use existing template system in `src/lib/email/templates.ts`.
- [ ] On decision write, if auto-email enabled, queue send via Resend; record `email_sent_at`.

## Phase 6 — Observability ✅ (complete)

Full guide, including how to add a new event, lives in **[ANALYTICS.md](ANALYTICS.md)**.

- [x] Installed `posthog-js`. Init lives in `src/lib/analytics/posthog.ts`, called from the
      root layout. Users are `identify()`d on auth change and `reset()` on sign-out; the
      org-scoped layout calls `setOrgGroup()` so events break down per org.
- [x] Error tracking via `capture_exceptions: true` plus a `handleError` hook in
      `src/hooks.client.ts` for errors SvelteKit swallows into an error page. 404s are
      excluded — logging them buries the real errors. No Sentry.
- [x] Events wired: `application_started`, `application_submitted`,
      `application_auto_rejected`, `org_created`, `invite_created`, `invite_accepted`.
      Names are constants in `EVENTS`, so a typo is a compile error rather than a silently
      empty funnel.
- [x] `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` documented in `env.example`.
- [x] Fixed two live config bugs in `.env.local`: the variable **names** were wrapped in
      backticks (Vite exposes nothing, and the app no-ops silently), and the host value was
      missing the leading `h` (`ttps://`). Analytics had never actually reported.

Deliberate privacy posture, set in `initAnalytics()` — `autocapture: false`,
`disable_session_recording: true`, applicants never `identify()`d. LUMA handles names,
emails and essay answers; none of that belongs in an analytics warehouse.

Remaining, and blocked on the features themselves rather than on analytics:

- [ ] `candidate_reviewed`, `interview_scheduled`, `interview_evaluated` — names reserved
      in `EVENTS`, no `capture()` call yet.
- [ ] `decision_made` — needs Phase 5.
- [ ] `application_draft_saved` — needs Phase 2 save-and-resume.
- [ ] Build the apply funnel in the PostHog UI once real events are flowing.

## Phase 6.5 — Design system ✅ (complete)

The app had grown four visual dialects — recruiter, applicant, admin, and public — that
shared a color file and nothing else. The platform admin panel was the best of them, so it
became the reference and everything else was moved onto it.

**What shipped:**

- `src/styles/col.scss` expanded from 7 brand colors to a full token set: surfaces, borders,
  four status tones (each a bg/fg/accent trio), a radius scale, a shadow scale, chrome
  constants. The status palette was not invented — it was already in use as ~350
  copy-pasted hex literals, `#878fa1` alone appearing 46 times as a retyped
  `$light-tertiary`.
- `src/styles/ui.scss` (new, ~730 lines) holds the shared classes, loaded exactly once by
  `luma.scss`. `col.scss` stays variables-only because ~30 components `@use` it with
  `as *`, so a rule there would be emitted once per component.
- Every surface migrated: 41 components and route pages. **1,213 lines of duplicated local
  SCSS removed**, 129 inline `style=` attributes replaced with classes, and **zero raw hex
  left** in any component style block.
- Chrome unified: both shells now use `$sidebar-width` and mark the current page the same
  way (yellow label + 3px yellow left rule).
- `h4` is left-aligned globally. It had been centered, which every recruiter page undid
  with an inline `style="text-align: left"`; the applicant flow opts back in with
  `.text-center`.

**Two bugs the migration surfaced**, both from local rules silently shadowing shared ones:
`CandidateList` and `AvailabilityGrid` each defined a local `.pill`, and the landing page
a local `.divider`. Svelte's scoping makes the local copy win, so the shared rule was
quietly restyling unrelated elements. See the naming-collisions table in
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) — that table exists because of these.

**Caught by visual verification, not by the build** (all four fixed):

1. **Tables were silently clipped.** `.panel-flush` set `overflow: hidden` for corner
   clipping, which also clips the Y axis. `.content-left` is a flex column, so a tall
   child is shrunk to fit — the candidates table rendered 4,236px of rows inside a 466px
   box and showed **5 of ~48 rows with no scrollbar**. `.panel-flush` no longer sets
   `overflow`, and `.table-scroll` sets `overflow-x` only plus `flex-shrink: 0`. Corner
   clipping is not worth silently hiding data.
2. **`.btn-sm` lost to `.btn-quaternary`.** Sass requires `@use` before other rules, so
   `ui.scss` is pulled in near the top of `luma.scss` and luma's own button rules come
   later in the output. Fixed by writing it `.btn.btn-sm` — two classes beats one, no
   `!important` needed. Any future shared rule that collides with a `luma.scss` rule needs
   the same treatment.
3. **The applicant sidebar never got the new active treatment**, because the component
   that has it (`src/lib/components/applicant/Sidebar.svelte`) is **dead code — imported
   nowhere**. The sidebar that actually renders is inline in
   `apply/[slug]/[job_id]/+page.svelte`. Both were updated; the dead one should probably
   be deleted.
4. **Two illegible buttons** on `/schedule/full`: `.btn-secondary` is white-on-transparent,
   built for the dark navbar, and was being used in a light page header. Switched to
   `.btn-quaternary`. `.btn-secondary` remains correct on dark chrome (both navbars, the
   error card).

Note for anyone verifying by hand: **Vite's file watcher does not fire on this repo's
`/mnt/c` path from WSL.** Edits appear to have no effect until the dev server is
restarted, which makes a working fix look broken. Check the Svelte scope hash
(`s-xxxxx`) — if it hasn't changed, you're looking at a stale build, not your CSS.

**Follow-ups, none blocking:**

- `Footer.svelte` and `NextButton.svelte` carry identical `.footer-buttons` rules. That is a
  component-consolidation question, not a design-system one.
- The applicant `Navbar` has a duplicated `id="dropdownYear"` and a stray `data-bs-toggle`.
  Pre-existing markup bugs, spotted during the pass and deliberately not touched.
- `review/candidate` still uses Bootstrap `.card` (capped at 500px) as its container rather
  than `.panel`. Moving it would change that page's width — a layout decision, not a
  cleanup.

---

## Phase 6.6 — Per-team applications + the Archimedes 2026 form ✅ (complete)

Owner ask: build the Archimedes **2026 Fall Recruitment** form, and make an application to
two teams be **two applications in the backend** — "treat each application as distinct. I
don't want to mark them in the same manner, ie showing all the teams they did for it."

### The model change

- [x] **`00024_per_team_applications.sql`** — `applicants.team_id` (FK to `teams`) and
      `applicants.submission_group` (uuid), plus indexes. One `applicants` row per team:
      applying to Astra and Terra creates two rows with their own `status`, their own
      review, and only the answers that team asked for.
- [x] **Legacy rows deliberately NOT split.** Backfill sets `team_id` only where
      `selected_team_slugs` holds exactly one slug. Splitting a historical multi-team row
      would have to invent which answers belonged to which team, and the per-team essays
      those rows would need were never collected. They stay as legacy combined
      applications, and read code must tolerate both shapes.
- [x] **`splitSubmissionByTeam()`** in `utils/formSchema.ts` — pure, so it can move
      server-side with the rest of the submit path. Emits in the org's configured team
      order, not the order the applicant ticked boxes, so sibling rows are created in a
      stable sequence.
- [x] **`submission_group` is for auditing, not for re-merging.** It links the siblings so a
      split is traceable and a resubmit is detectable. The reviewer UI must never label an
      application with every team the person applied to — that is the exact thing the owner
      asked not to happen.

### `per_team` questions

- [x] **`team_scope: { per_team: true }`** — a third scope mode. The question is asked once
      per team the applicant picked, with `{team}` in the title/subtitle/placeholder
      replaced by that team's name. This is what makes "Why are you interested in {team}?"
      a distinct answer per application, authored once instead of copy-pasted per team.
- [x] **Ids expand, then collapse.** The form renders unique ids (`why_team::astra`) so it
      can key inputs; the split writes the answer back under the _authored_ id (`why_team`)
      on the row that team owns. Every Astra application therefore stores its essay under
      the same key, and `reject_if` rules — written against authored ids — keep working
      without knowing expansion happened.
- [x] **Provenance is carried, not parsed.** Expanded copies get `base_id` / `per_team_slug`
      fields rather than the split re-deriving them from the id string, which would break
      the moment an author used the separator in an id of their own.

### Auto-reject is now per-team

- [x] Rules are evaluated **once per team**, against that team's answers under that team's
      scope. A "No" on the Astra citizenship question denies the Astra application and
      leaves the same person's Terra application pending. Previously one rule denied the
      whole candidate.

### Two legacy constraints that had to go (`00025_applicant_uniqueness.sql`)

- [x] **`applicants_email_key UNIQUE (email)`** — globally unique email meant one
      application per person _for all time_, across teams, jobs and cycles. It hard-blocked
      the second row of every split.
- [x] **`applicants_name_key UNIQUE (name)`** — **a live bug, unrelated to this work.** Two
      applicants who share a name could never both exist, in any org, ever. A second "John
      Smith" was rejected at the database and surfaced in the form as a generic failure.
- [x] Replaced by `applicants_job_email_team_uniq` on `(job, lower(email), team_id)`
      `NULLS NOT DISTINCT` — one application per person, per posting, per team. Still stops
      the double-tapped submit the old constraint was groping at, without forbidding the
      legitimate cases. `NULLS NOT DISTINCT` matters: without it an org with no teams
      (`team_id IS NULL`) gets no dedup at all, since NULLs compare distinct.
- [x] **`CREATE INDEX IF NOT EXISTS` silently kept the WRONG index.** The first live
      version of this index was created on raw `email`, and the statement above — same
      index _name_, different definition — did nothing at all, because `IF NOT EXISTS`
      matches on the name only. `SPLIT-TEST@vt.edu` then inserted happily alongside
      `split-test@vt.edu`. **`IF NOT EXISTS` makes a migration re-runnable; it does not
      make it corrective.** To change an existing index's definition you must drop it
      explicitly first. Caught only because the constraint was tested with a real duplicate
      insert instead of being assumed to work — and initially mis-diagnosed as Postgres
      dropping the `lower()` expression, which it does not do.
- [x] Email is now normalized to lowercase on write. Interviews, drafts and `email_log` all
      join applicants on that address, so drifting case forks one person into two
      candidates across every one of those joins.

### The Archimedes form (job posting id 7, seeded in `00024`)

Shared: major, expected graduation year (`blinded`). Per-team: Astra asks U.S.
citizen/permanent resident, Infinitum asks 18-or-older — both `reject_if` on "No", both
scoped so they only affect their own team's application. Terra and Juvo add nothing beyond
the shared set. Interest: "Why are you interested in Archimedes?" (shared) and "Why are you
interested in {team}?" (`per_team`).

- [x] **Applicant email domain restriction** — `organizations.settings.application.email_domain`
      (bare, e.g. `vt.edu`; null = unrestricted; subdomains accepted). Set for Archimedes.
      It constrains the **existing** email field rather than adding a second "school email"
      question, on purpose: interviews and `email_log` join applicants on that address, so a
      second address would fork the candidate's identity.

### Fixed in passing

- [x] **Review step "click a section to edit" jumped to the wrong step.** It used
      `stepIndex + 1`, ignoring that question steps start at index 2 when a team picker is
      present — so every edit link landed on the team picker instead of the question.

### Verified

Split logic exercised directly against a schema with all three scope modes: the Infinitum
question stays hidden for an Astra+Terra applicant, `why_team` expands to exactly two
questions in org order (not click order), the Astra row comes back denied while Terra stays
pending, and neither row carries the other's essay. Then the real insert was run **as the
`anon` role** against prod — which is what exposed both unique constraints, and what
confirmed the dedup index rejects a case-varied duplicate while still accepting a third
team for the same person. Test rows removed.

### Interviews now belong to an application (`00026_interview_applicant_id.sql`)

`interviews.applicant` is the applicant's EMAIL as text. That was unambiguous while an
address owned one application; after the split, joining on it hands every sibling row the
same interviews — the Astra application would show Terra's interview and count it toward
Astra's evaluation progress.

- [x] **`interviews.applicant_id`** (FK to `applicants`, `ON DELETE CASCADE`) + index.
- [x] **Backfilled only where unambiguous** — exactly one applicant row for that address in
      that org. On prod that linked **886 of 891** interviews; the remaining 5 stay null and
      fall back to the email join, which is correct for them precisely because they have no
      sibling to be confused with. Guessing on an ambiguous match would silently attach an
      interview to the wrong team's application.
- [x] The `applicant` email column **stays** — the scheduler, the `.ics` builder and
      `email_log` all still key off it. Readers prefer `applicant_id` and fall back to email.

Remaining:

- [ ] **Teach the scheduler to set `applicant_id`** when it creates interviews. Until it
      does, newly scheduled interviews have a null `applicant_id` and hit the email
      fallback, which reintroduces the fan-out for exactly the rows that matter most.

### One stray row in the prod migration ledger

`supabase_migrations.schema_migrations` on prod carries **version `20260830002519`,
`per_team_identity_constraints`**, which has no file in `supabase/migrations/`. It was a
duplicate of this phase's constraint work, applied four seconds before `applicant_uniqueness`
during parallel development; its effects are fully and correctly represented by `00025` and
`00026`, and the live schema matches those two files. It is left in place rather than
deleted, because a ledger row is an accurate record of something that really ran.

**So the `ls supabase/migrations/` vs `list_migrations` drift check now expects prod to have
exactly one more row than the repo has files, and that row is this one.** Any _other_
mismatch is real drift.

### Open question for the owner

**Which interview rounds are shared across a candidate's teams?** `docs/CLAUDE.md` describes
a shared R1 followed by per-team R2/R3. If R1 really is one interview for the whole person,
then fanning R1 across sibling applications is _correct_ and only R2/R3 must be per-team —
which is a different rule from "every interview belongs to one application". This is a
recruitment-process decision, not a code one, so it is recorded rather than guessed.

## Phase 7 — Pre-launch QA (half day)

- [ ] Run through complete flow end-to-end on a staging Vercel preview with a throwaway Supabase project.
- [ ] Verify Resend send works from the production sending domain.
- [ ] Verify `.ics` attachments open correctly in Apple Calendar, Google Calendar, Outlook.
- [ ] `npm run build` clean, `npm run check` clean, `npm run lint` clean.
- [ ] Run Playwright E2E suite (`npm test`). Add tests for the new submit + auto-reject path if not covered.
- [ ] Load test the scheduler against ~200 fake applicants to confirm performance.
- [ ] Manual security pass: try to read another org's data while authed as a different org's user.

---

## Open Decisions

**These live in `HUMAN-TODO.md` now** — anything needing Owen belongs in one place, so it
doesn't get missed here. Kept as a pointer only:

- ✅ **Resolved — Phase 1 / Phase 2:** hand-rolled validation, no zod.
- ✅ **Resolved — Phase 3:** auto-advance fires immediately on the crossing vote.
- ⏳ **Open:** Phase 3.5 owner-grant policy, Phase 4 slot-link expiry, Phase 5 per-outcome
  email toggles, adding `vitest`, and whether to move auto-reject + blinding server-side
  before launch. See **`HUMAN-TODO.md` → Decisions I need from you**.

---

## Phase 2.7 — Auth hardening (2026-08-30)

Four parallel audits covered password login + route guard, the email flows, invite
redemption + `/register`, and the role/RLS model. Everything below was verified by
execution against production inside rolled-back transactions, not inferred from policy text.

### Fixed — migration `00027_owner_escalation_guards.sql`

An **org admin could make themselves owner**, by three separate routes:

1. `update org_members set role='owner' where user_id = auth.uid()`. `members_update_admin`
   had a `USING` clause and **no `WITH CHECK`** — `USING` limits which rows you may touch,
   never the values you write. The same gap let an admin demote the real owner to `viewer`,
   or `DELETE` the owner's membership row outright.
2. `update_member_role(org, self, 'owner')` — the RPC refused to edit a row that already
   _was_ owner, but never refused to write `'owner'` **into** a row.
3. `update organizations set owner_id = auth.uid()` — same missing `WITH CHECK` on
   `orgs_update_admin`.

A `recruiter` was correctly blocked on all three; the boundary only leaked at `admin`.
`owner_id` is now immutable from the client via column-level grants (transfer still works
through the platform-admin RPC). `interviewer_availability`'s "own availability" policy also
gained the `is_org_member(org_id)` check it was missing — without it any authenticated user
could inject availability rows into any org and corrupt auto-scheduling.

### Fixed — app layer

- **The login rate limiter was dead code in production.** `trailingSlash = 'always'` means the
  form posts to `/auth/`, and the limiter tested `path === '/auth'`. 15 rapid bad logins all
  returned 200. Now normalised via `pathIs()`; verified the 11th request returns 429. The same
  bug silently disabled the authenticated-user bounce off `/auth`.
- **Open redirect** in the `login` and `signup` actions — `?redirect=` flowed unvalidated into
  `redirect(303, …)`. A victim could be sent `/auth?redirect=https://evil.example`, log in on
  the genuine page, and be handed straight to an attacker's "session expired" phish. Now
  filtered by `safeRedirect()` (same-origin relative paths only, `//` and `/\` rejected).
- **Magic link lost the invite context** — it hardcoded `next=/private` while signup correctly
  threaded `redirect` through, so anyone arriving from an invite who chose magic link over a
  password was stranded after confirming. Now threaded the same way signup does.
- `/private` guard tightened to a real path-segment boundary (`/privateXYZ` no longer matches).

### Still open

- [ ] **Blinded review redaction is client-side only.** `redactApplicant()` strips answers from
      an already-fetched row; `applicants_select_org` returns the full row to any org member, so
      a blinded reviewer can read the real answers straight off the REST endpoint. Already
      tracked in Phase 3 — this audit confirms it is live, not theoretical.
- [ ] **Rate limiting is per-instance and per-IP only.** The in-memory `Map` gives each
      serverless instance its own bucket, so a cold instance is a fresh allowance. More
      importantly there is no **per-email-address** limit on password reset / magic link, and
      neither requires owning the address — the app can be used to send ~10 emails per 15 min
      to an arbitrary third party. Wants a shared store (Redis/Upstash) plus an address-keyed
      limit, and probably a CAPTCHA on those two forms.
- [ ] **`/auth/reset` has no recovery-session guard**, and `updatePassword` never checks that
      the session came from a recovery flow. Visiting it directly yields Supabase's generic
      "Auth session missing" rather than "your reset link expired, request a new one."
- [ ] **`role` vs `roles[]` is unresolved.** `has_org_role()` reads only the singular `role`;
      `has_app_role()` reads `roles[] OR role` and currently backs only `decisions`. Org 2 has
      an admin whose `roles` is `['admin']`, so `has_app_role(2,'interviewer')` is false for
      them. Decide which column is authoritative **before** Phase 3 adds more `roles[]` gates,
      or admins will be under-granted on interviewer-only features.
- [ ] `/admin` has no SSR gate — it renders and relies on RLS + RPC self-checks to return
      nothing. No data leaks, but there is no defense in depth.
- [ ] `/register` creates the org and the owner membership as two unguarded client inserts; a
      failure between them leaves an org with no owner row.
