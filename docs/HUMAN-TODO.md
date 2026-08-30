# HUMAN-TODO.md

Things only Owen can do — accounts, DNS, secrets, decisions. Sorted by when they block engineering work. Don't start Phase 1 of `TODO.md` until everything under "Before any code ships" is done.

---

## Before any code ships (blockers)

### ✅ Unapplied migrations on prod (found 2026-08-18, applied 2026-08-20)

Two migration files in the repo had never been applied to the live database. Both caused
**silent** wrongness, not errors, which is why earlier "all routes return 200" checks
missed them. Both are now applied and verified.

- [x] **`00013_rename_interview_columns.sql`** — the live `interviews` table still had
      `"startTime"` / `"endTime"` while every query in the app asked for `start_time` /
      `end_time`, so **891 interview rows were invisible to the app**. `/candidates` and
      the candidate timeline swallowed the failed query by design (failure-tolerant reads),
      so every candidate showed 0 interviews, no rating, and a stage stuck at "In Review" —
      the roster looked fine and was wrong. Applied; `select count(start_time)` now returns
      all 891 rows, spanning 2025-09-11 to 2026-03-17.
- [x] **`00012_org_assets_bucket.sql`** — `storage.buckets` was empty, so the `org-assets`
      bucket didn't exist and logo upload in Settings → Branding failed. Bucket and its four
      RLS policies created.
- [x] **`00021_org_invites.sql`** — the new invite-link feature. Applied at the same time.
- [x] **`00022_harden_invite_grants.sql`** — revokes the over-broad default grants Supabase
      hands `anon`/`authenticated` on any new table, and the `PUBLIC` execute on the invite
      admin RPCs. Nothing was exploitable (RLS held; the functions fail closed for anonymous
      callers) — this is the second layer.

_(`00011_interview_violations` was already applied. `00001_initial_schema` predates
Supabase migration tracking; the schema is present.)_

**Lesson worth keeping:** failure-tolerant reads hide schema drift. The reads in
`candidates.ts` are still failure-tolerant on purpose — a partially-migrated org shouldn't
500 — so re-check `list_migrations` against `supabase/migrations/` after any deploy rather
than trusting a smoke test.

### 🔑 Platform admin access

- [x] **`ostuckman@vt.edu` added to `platform_admins`** — 2026-08-21, on your say-so. Gives
      cross-org access to `/admin`. The other platform admin is `testuser@test.com`.
- [ ] **Decide whether `testuser@test.com` should stay a platform admin.** It's a test
      account with full read/write on every org's applicants and members. _Recommend: remove
      it before launch._ You can now do this yourself: `/admin` → Admins → Remove, or the
      shield button next to them in any org's member list.

Adding platform admins no longer needs a SQL insert — `/admin` → **Admins** takes an email,
and each member row in a Settings panel has a shield toggle when you're viewing as a
platform admin.

_(Org settings were briefly platform-admin-only on 2026-08-21 and reverted the same day —
org admins configure their own org again. See `TODO.md` Phase 3.5.)_

### Local dev environment

- [ ] **Upgrade Node on Windows to 22 LTS** — currently 20.18.0, which is the cause of both
      the `npm run dev` 500 and the `EBADENGINE` install failures. `@supabase/realtime-js`
      requires a native `WebSocket` (Node 22+) and version-gates on it, so on Node 20 every
      server-rendered route throws in `src/hooks.server.ts`. WSL is already on Node 25.

      Note `.npmrc` sets `engine-strict=true`, so with the `engines.node: ">=22"` field now
      in `package.json`, **`npm install` refuses to run at all on Node 20** — it errors
      rather than warning. Upgrade first, then install; the order matters.

      ```powershell
      winget install OpenJS.NodeJS.LTS
      ```

      Then, from either environment: `npm install` followed by `npm run deps:cross`.
      Verify with `node -v` in **both** PowerShell and WSL — they are separate installs.

### Accounts & API keys

- [x] **Sending address** — `noreply@archimedesvt.org` (confirmed).

> 📧 **Resend setup — needed before Phase 5 (Decisions) and before any real email sends.**
>
> - [ ] **Resend API key** — resend.com → API Keys → create. Set it as a Supabase Edge
>       Function secret, **not** in `.env.local` and **not** in Vercel client env:
>       `supabase secrets set RESEND_API_KEY=re_...`
> - [ ] **Verify the sending domain** — add Resend's SPF/DKIM DNS records for
>       `archimedesvt.org`. Until this shows "Verified", delivery will fail or land in spam.
> - [ ] **Set the from address:**
>       `supabase secrets set LUMA_FROM_EMAIL="Archimedes Society <noreply@archimedesvt.org>"`
> - [ ] Confirm real delivery. **Without `RESEND_API_KEY` the edge functions run in dry-run
>       mode** — they report success and a count, but send nothing. Easy to mistake for working.

- [x] **PostHog** — keys are in `.env.local` and **now actually work.** They were present
      but unusable until 2026-08-20: the variable _names_ were wrapped in backticks
      (`` `PUBLIC_POSTHOG_KEY`= ``), which Vite doesn't expose, and the host value was
      missing its leading `h` (`ttps://us.i.posthog.com`). Analytics silently no-ops when
      the key is absent, so this looked exactly like "nothing happening yet". Both fixed.
- [ ] **Add `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` to Vercel** → Settings →
      Environment Variables, Production. They're `PUBLIC_` vars inlined at build time, so a
      change needs a redeploy, not just a restart. Consider a separate PostHog project for
      Preview/Development so local clicks don't pollute production funnels.
- [x] **Supabase** — project `cspuessflpakiyxygcay` was paused/unreachable on 2026-08-16
      (`getaddrinfo ENOTFOUND` → `npm run dev` flooded with `TypeError: fetch failed`).
      Owen restored it the same day. Re-verified end to end: DNS resolves, `/auth/v1/health`
      200, PostgREST schema cache warm, anon key valid (ref matches, role `anon`, exp 2035),
      and `npm run dev` serves `/`, `/auth`, `/apply/archimedes`,
      `/private/archimedes/{review,candidates}` with **zero** fetch errors.
      _Caveat: HTTP 200 on those routes did **not** mean the data was right — see the
      unapplied-migration section above, which those checks failed to catch._
      Orgs present: `archimedes` (id 2), `gdg-at-vt` (id 5).
      _If it pauses again, the symptom is identical — restore from the Supabase dashboard
      and allow ~2 min for the origin (HTTP 521) and schema cache (PGRST002) to warm up._
- [x] **Supabase service role key** — `SUPABASE_SERVICE_ROLE_KEY`. Needed for server-side admin actions (auto-reject writes, decision emails). Get from Supabase dashboard → Settings → API → `service_role` (secret). Put in Vercel env, NOT in `.env.local` if `.env.local` is committed (it shouldn't be).

### Vercel project setup

- [x] Confirm the Vercel project for `luma.archimedesvt.org` exists and is connected to this GitHub repo. If not, create it; import the repo; framework = SvelteKit; build command auto-detected.
- [x] Add the env vars above to Vercel → Settings → Environment Variables. Set them for **Production**, **Preview**, and **Development** (use placeholder values for preview/dev if you want to keep prod isolated).
- [x] Confirm the domain `luma.archimedesvt.org` is attached to the Vercel project under Settings → Domains. If not, add it (Vercel will show you the DNS CNAME / A record to add).
- [x] Add the DNS record Vercel asks for at your DNS provider (probably the same place as the Resend records).
- [x] Wait for SSL cert provisioning (Vercel does this automatically, takes <10 min after DNS resolves).

### Decisions I need from you

- [x] **Email provider — RESEND.** Decided 2026-08-16. All EmailJS references purged from
      `docs/CLAUDE.md`, `docs/DEPLOYMENT.md`, and this file. No code changes were needed —
      everything already used Resend.
- [x] **Sending email address** — `noreply@archimedesvt.org`.
- [ ] **Org name displayed in emails** — "Archimedes Society"? "Archimedes @ VT"?
- [ ] **Whether to wipe the current Supabase prod data** before V1 launch, or migrate it forward. (If you have real applicants in there, migration; if it's test data, wipe is easier.)
- [ ] **Who else gets admin access** to the production app on day 1? List emails — I'll seed them as admins.

These were sitting only in `TODO.md`'s "Open Decisions" and needed to be here, since each
one blocks a phase until you answer. My recommendation is given for each — say "all
recommended" and I'll proceed with every one of them.

- [ ] **Phase 3.5 — can an org owner grant the `owner` role?** `remove_org_member` refuses to
      remove owners, so a mis-click is unrecoverable through the UI. _Recommend: no — keep
      owner changes behind an explicit "transfer ownership" action._
      **Interim:** `create_org_invite` allows an `owner` invite but only when the creator is
      themselves an owner, and the settings UI doesn't offer `owner` in the dropdown at all.
      So the hole isn't reachable through the app today, but the RPC would permit it.
- [ ] **Should invite links be emailed automatically?** Today an admin creates a link and it
      lands on their clipboard to send however they like — no Resend dependency, works
      before the sending domain is verified. _Recommend: add the emailed version once the
      Resend domain is live, keep copy-link as the fallback._
- [ ] **Phase 4 — should the candidate-picks-slot link expire?** _Recommend: yes, 7 days._
- [ ] **Phase 5 — per-outcome decision-email toggles** (auto-send hires but not rejects)?
      _Recommend: yes, three independent toggles._
- [ ] **Add `vitest` as a dev dependency?** `formSchema.ts` and `review.ts` are pure logic
      currently covered only by throwaway assertion scripts (33 and 29) that were never
      committed — and the formSchema one caught a real bug before it shipped (`Number('')`
      is `0`, so a `lt` GPA rule auto-rejected every blank answer). _Recommend: yes. Vite is
      already here, so it's near-zero config._ Not done unprompted since it adds a dependency.
- [ ] **Ship with client-side auto-reject and blinded review, or block launch on moving them
      server-side?** Both currently run in the browser. Neither is a new hole — the existing
      submit path already trusts the client for every answer — but a determined applicant
      could skip auto-reject, and a curious reviewer could read un-blinded data in devtools.
      _Recommend: move both server-side before launch; they're small changes._

**Resolved, recorded here so they don't get re-litigated:** validation is hand-rolled (no
zod); review auto-advance fires immediately on the crossing vote rather than waiting for
admin confirmation; **invite links bind to the invited email address** (a forwarded link
can't join a stranger), with "anyone with the link" as a separate, explicitly-labelled
mode; **PostHog is the only analytics/error vendor** — no Sentry, no session replay, no
autocapture, and applicants are never `identify()`d.

---

## During build (not blocking, but needed before specific phases)

### Before Phase 2 (Form Builder)

- [x] ✅ **Migrations `00014`–`00020` APPLIED** — 2026-08-16, via the Supabase MCP server
      once Owen authorized it. Applied individually so each is registered in Supabase's
      migration history rather than pasted as one blob.

  Verified after applying:
  - 4 V1 tables exist: `teams`, `job_reviewers`, `decisions`, `application_drafts`
  - `applicants.prior_team_id` + `selected_team_slugs` present
  - `org_members.roles` present, `has_app_role()` created
  - 4 Archimedes teams seeded (Infinitum / Astra / Terra / Juvo)
  - **RLS enabled with policies on all four** (teams 5, decisions 4, job_reviewers 4,
    drafts 2). Anon can read active teams — which the public apply form needs — but gets
    `[]` from `decisions` and `application_drafts`.
  - Security advisors: **0 ERROR-level**, no RLS or policy findings. The 95 WARNs are all
    pre-existing categories (SECURITY DEFINER exposure, pg_graphql), unrelated to V1.
  - App re-verified against the migrated schema: `/apply/archimedes/6`, `/candidates`,
    `/review`, `/settings/jobs/6` all 200 with zero runtime errors.

- [x] ~~Send me the **actual question list**~~ — supplied 2026-08-29 and built as the
      **2026 Fall Recruitment** posting (`job_posting` id **7**, org `archimedes`), seeded by
      migration `00024`. Shared: major, expected graduation year (flagged `blinded`), and
      "Why are you interested in Archimedes?". Per-team: "Why are you interested in
      {team}?" as a `per_team` question, so it is asked once for **each** team the applicant
      picks. Team-scoped: Astra asks U.S. citizen/permanent resident; Infinitum asks 18+.
      Terra and Juvo add nothing beyond the shared set, as specified.
      The VT email requirement is enforced as `settings.application.email_domain = 'vt.edu'`
      on the org rather than as a second question — see docs/CLAUDE.md for why.
- [x] ~~Tell me your **auto-reject rules**~~ — supplied 2026-08-29. Both eligibility gates
      auto-reject on "No" (`reject_if: { op: 'eq', value: 'No' }`), and under the per-team
      model that denies **only that team's application**: answering "No" to the Astra
      citizenship question leaves the same person's Terra and Juvo applications pending.
  - ⚠️ Still worth your attention: auto-reject runs **client-side** at submit, so a crafted
    request can bypass it. Low severity (the whole submit path already trusts the client,
    and the fallback is that a human reviews them), but it is on the Phase 2 list to move
    server-side before the cycle opens.

### Before Phase 3 (Review)

- [ ] List of **reviewers** for the V1 cycle (names + emails). I'll create their accounts and assign them to the reviewer pool.

      ⚠️ Note on how adding people works today: `Settings → Members` can only add someone who
      **already has a LUMA account** — it looks the email up in `auth.users` and errors with
      `No user found with email: ...` otherwise. So each reviewer must sign up at `/auth`
      first, then be added. A real invite flow (pending invite + emailed link) is Phase 3.5.
      Until that ships, either have people self-signup first, or send me the list and I'll
      seed the rows directly.

- [ ] Confirm **threshold defaults**: I'm planning 3 approves to advance, 2 rejects to deny. Override if you want different.

### Before Phase 4 (Scheduling)

- [ ] Tell me which **scheduling algorithm** is the default. I'm going with `greedy-first-available` unless you say otherwise.
- [ ] Will recruiters submit availability via the existing `/availability` page, or do you want to pre-import from a spreadsheet? If spreadsheet, send the format.

### Before Phase 5 (Decisions)

- [ ] Write the **hire / reject / waitlist email templates** (or give me last year's text and I'll adapt). These are user-facing and important — better to write them yourselves.

---

## Pre-launch (day-of)

- [ ] **DNS final check** — `dig luma.archimedesvt.org` resolves to Vercel. Verify the sending domain shows "Verified" in the Resend dashboard (Domains).
- [ ] **Re-check applied migrations against the repo** — `list_migrations` vs the file count
      in `supabase/migrations/`. Two had silently drifted before; failure-tolerant reads mean
      a smoke test won't catch it.
- [ ] **Confirm PostHog is receiving events from production** — open the app, then PostHog →
      Activity. Silence means the env vars didn't make it into the Vercel build.
- [ ] Send yourself a test email through the app's "submit application" flow — confirm it arrives, looks right, no spam folder.
- [ ] Add a real applicant test through the full flow on production. Then delete the test row.
- [ ] Announce go-live to advisors / eboard.

---

## Post-launch (week 1)

- [ ] Watch PostHog daily for the first week — drop-offs in the apply funnel are the first thing to fix.
- [ ] Check Resend → Logs for failed sends, and query `email_log` for `status = 'failed'` rows. Bounces arrive via the webhook at `/api/email-webhook`.
- [ ] Be ready to manually un-reject if auto-reject rules fire wrong.

---

## Supabase dashboard — auth settings (found in the 2026-08-30 auth audit)

These are console toggles; none of them can be fixed from the repo.

- [ ] **Confirm custom SMTP is configured** (Auth → Settings → SMTP Settings). Nothing in the
      repo configures SMTP for Supabase _Auth_ — `RESEND_API_KEY` is only wired into the
      `notify-interviews` Edge Function, which is a completely separate send path. If Auth is
      still on Supabase's built-in mailer it is capped at roughly 2–4 emails/hour and is
      documented as not for production use. Signup confirmation, magic link and password
      reset all ride on it, and they fail **silently** the same way the PostHog env vars did.
      This is the single highest-risk item before the cycle opens.
- [ ] **Enable leaked-password protection** (Auth → Policies). Currently off, confirmed via
      `get_advisors`. Combined with the 6-character floor, compromised passwords are accepted.
- [ ] **Confirm the "Confirm email" toggle** matches what the signup action assumes. The action
      always shows "Check your email" regardless; if confirmation were disabled, users would
      already hold a session while being told to go check their inbox.
