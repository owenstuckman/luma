# HUMAN-TODO.md

Things only Owen can do — accounts, DNS, secrets, decisions. Sorted by when they block engineering work. Don't start Phase 1 of `TODO.md` until everything under "Before any code ships" is done.

---

## Before any code ships (blockers)

### 🔴 Unapplied migrations on prod (found 2026-08-18)

Two migration files in the repo were never applied to the live database. Both cause
**silent** wrongness, not errors, which is why earlier "all routes return 200" checks
missed them. Verified against prod via `list_migrations` + schema inspection.

- [ ] **Apply `00013_rename_interview_columns.sql`** — ⚠️ **highest priority.**
      The live `interviews` table still has `"startTime"` / `"endTime"`; every DB query in
      the app asks for `start_time` / `end_time`. There are **891 interview rows** currently
      invisible to the app: - `/candidates` and the candidate timeline swallow the failed query by design
      (failure-tolerant reads), so every candidate shows 0 interviews, no rating, and a
      pipeline stage that never advances past "In Review". **The roster looks fine and is
      wrong.** - `/evaluate` orders by `start_time` and will error outright.

      Safe to apply: it is a pure rename, and no code writes the camelCase names — the
      scheduler's `startTime`/`endTime` are in-memory DTOs converted at the DB boundary
      (`start_time: iv.startTime`). Confirmed zero camelCase writes.

- [ ] **Apply `00012_org_assets_bucket.sql`** — `storage.buckets` is empty, so the
      `org-assets` bucket does not exist. Org logo upload in `Settings → Branding` writes to
      it and fails. Lower severity than 00013 but user-visible.

_(`00011_interview_violations` **is** applied — the `violations` column exists.
`00001_initial_schema` predates Supabase migration tracking; the schema is present.)_

**Say the word and I'll apply both** — I did not do it unprompted because it changes the
production schema.

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

- [x] **PostHog** — keys confirmed correct, in `.env.local`.
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
admin confirmation.

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

- [ ] Send me the **actual question list** you want for the V1 Archimedes cycle: shared questions + per-team questions. Even a rough Google Doc works — I'll convert it to the JSON schema. If you want me to draft it from the V1 background doc + last year's CSVs, say so.
- [ ] Tell me your **auto-reject rules** in plain English (e.g., "if 'Are you 18+' = No → reject"). I'll wire them into the question schema.

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
- [ ] Send yourself a test email through the app's "submit application" flow — confirm it arrives, looks right, no spam folder.
- [ ] Add a real applicant test through the full flow on production. Then delete the test row.
- [ ] Announce go-live to advisors / eboard.

---

## Post-launch (week 1)

- [ ] Watch PostHog daily for the first week — drop-offs in the apply funnel are the first thing to fix.
- [ ] Check Resend → Logs for failed sends, and query `email_log` for `status = 'failed'` rows. Bounces arrive via the webhook at `/api/email-webhook`.
- [ ] Be ready to manually un-reject if auto-reject rules fire wrong.
