# Questions to Answer Before V1 Plan

Fill in answers under each question. Anything left blank, I'll either flag as a blocker in HUMAN-TODO.md or pick a sensible default and note the assumption. Goal: produce CLAUDE.md, TODO.md, HUMAN-TODO.md, FEATURES.md, and a concrete deployment plan once these are answered.

---

## 1. Organization & Scope

**1.1** This rebuild is for Archimedes only — should I strip the multi-tenant `organizations` / `org_members` / `slug` machinery and collapse everything to a single org, or keep multi-tenancy on the off chance another VT org uses it?
> 

**1.2** What are the four subteams? (Names + 1-line description of each so I can seed them in the DB and reference them in copy.)
> Team 1:
> Team 2:
> Team 3:
> Team 4:

**1.3** Are advisors / eboard / interviewers / candidates all the user roles, or are there more (e.g., team lead, observer)? List the roles you want in the system.
> 

**1.4** Is this hosted under a specific domain (e.g., `apply.archimedes.vt.edu`) or staying on a Vercel preview URL for V1?
> 

---

## 2. Application Form (single form, four teams)

**2.1** Confirm the model: **one** application form, applicant picks 1-4 teams to apply to, sees the team-specific questions only for the teams they selected. Correct?
> 

**2.2** How many "shared" (all-teams) questions roughly, and how many per-team questions? Rough number is fine — I just want to size the form builder.
> Shared:
> Per team:

**2.3** Question types needed (check all): short text, long text, single-select, multi-select, file upload, date, video link, scale 1-5, availability grid, other?
> 

**2.4** Should applicants be able to **save & resume** a partial application, or is it single-session only? If save-and-resume, do we require email-based magic link or full account creation?
> 

**2.5** What's the auto-reject logic? Background mentions 18+, time commitment, prior team experience. List the disqualifying answers explicitly (I'll wire them into the question schema as `reject_if` rules).
> 

**2.6** Do we need a video / artifact upload as a hard requirement, or is that a "nice to have" we defer past V1?
> 

---

## 3. Review & Manual Reject Stage

**3.1** Background says "3 approves to get through." Confirm the threshold and: do we also need a hard reject power (1 reject = out), or is it pure approval-count?
> 

**3.2** Should reviewers see applicant identity (name/email/year) or be blinded?
> 

**3.3** Does each application get reviewed by a fixed pool, or do we want auto-assignment (round-robin) of N reviewers per app?
> 

---

## 4. Scheduling (Round 1)

**4.1** The auto-scheduler deck describes cohort logic (8 applicants, 4 recruiters, group + individual back-to-back). Is this still the model for Round 1, or are we simplifying for V1?
> 

**4.2** What scheduling algorithm do you want as the default? Options I see in the repo: `greedy-first-available`, `round-robin`, `balanced-load`, `batch-scheduler`. Pick one or say "keep all, default to X."
> 

**4.3** Should advisors be **excluded** from Round 1 interviewer pool by default? (Background says yes — confirming.)
> 

**4.4** "Returning member preference" — if an applicant was on Infinitum last year, prefer Infinitum interviewers. Should we model `prior_team` on applicants and pass it to the scheduler, or is this a manual override?
> 

**4.5** Buffer / break time between interviews — what's the default in minutes?
> 

---

## 5. Round 2 & Round 3

**5.1** Round 2 is per-team, "all advisors for that team interview each candidate." How many advisors per team typically (so I can size the slot length)?
> 

**5.2** Is Round 2 scheduled by the same auto-scheduler, or do advisors send candidates a Calendly-style "pick a slot" link?
> 

**5.3** Round 3 is optional / ad hoc. Do you want it as a first-class round in the system, or just a "schedule a follow-up" button on the candidate page?
> 

**5.4** "If candidate selected for two teams" — how should the system surface this conflict? (Flag on dashboard, blocking modal, automatic email to both team advisors?)
> 

---

## 6. Selection / Decisions

**6.1** Team selection is done by advisors "in the format they decide." Do you want any structured tooling here (ranked list, drag-to-team-bucket, scoring rubric), or just a "mark hired / rejected / waitlisted" button per candidate?
> 

**6.2** Should final decisions trigger automatic emails (offer / rejection / waitlist), or are emails sent manually after the fact?
> 

---

## 7. Email & Calendar

**7.1** Email provider: keep current setup (whatever is wired now), or switch to Resend / Postmark / SendGrid? Any preference?
> 

**7.2** Sending domain — do you control DNS for an Archimedes domain, or do we send from a generic noreply address for V1?
> 

**7.3** Calendar invites: do we attach `.ics` files (already in repo), or push to Google Calendar via OAuth?
> 

---

## 8. Tech / Deployment

**8.1** Hosting target — confirm Vercel (current `@sveltejs/adapter-vercel`) or move to self-hosted via the existing Dockerfile?
> 

**8.2** Supabase: existing project (which env vars are in `.env.local` today) or fresh project for V1? If fresh, do you want me to consolidate the 13 migrations into a clean V1 schema, or keep the migration history?
> 

**8.3** Custom domain + SSL — handled by Vercel automatically, or is there a VT IT process you need to follow (likely HUMAN-TODO item)?
> 

**8.4** Analytics / error tracking — do you want Sentry, PostHog, both, neither for V1?
> 

**8.5** Timeline — when does V1 need to be live? (Drives whether HUMAN-TODO.md is "do today" vs "do over 4 weeks.")
> 

---

## 9. What's Already Done vs. What's Missing

I'll audit the repo myself, but it'd save time if you flagged:

**9.1** Which existing features you consider **good enough to ship as-is**:
> 

**9.2** Which existing features you want **scrapped and rebuilt**:
> 

**9.3** Anything in the codebase you don't trust / is half-finished and should be deleted before V1:
> 

---

## 10. Open Items From Background

**10.1** "Weighted average scoring for round 1" — in or out for V1?
> 

**10.2** "Blinded review in initial screen" — in or out for V1?
> 

**10.3** "Unique question per team / custom questions per team" — already covered by Q2, but: do questions vary per round too (e.g., Round 2 has its own rubric per team)?
> 

**10.4** "Eboard person works with each set of advisors" — does the system need to model this assignment, or is it purely an offline coordination thing?
> 
