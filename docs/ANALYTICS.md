# Analytics & Error Tracking (PostHog)

One vendor covers both product analytics and error tracking for V1. There is no Sentry.

## How it's wired

| Piece                       | Where                                       |
| --------------------------- | ------------------------------------------- |
| Init, helpers, event names  | `src/lib/analytics/posthog.ts`              |
| Boot + pageviews + identify | `src/routes/+layout.svelte`                 |
| Org grouping                | `src/routes/private/[slug]/+layout.svelte`  |
| Caught-error reporting      | `src/hooks.client.ts` (`handleError`)       |
| Config                      | `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` |

**Analytics is optional.** With `PUBLIC_POSTHOG_KEY` unset every helper is a no-op and
`posthog-js` is never even imported — that's the normal state for local dev and for
anyone cloning the repo. This is why the module reads `$env/dynamic/public` and not
`$env/static/public`: the static variant fails the _build_ on a missing key, and
analytics must never be the reason a deploy doesn't ship.

## Adding a new event — the loop

**1. Name it in `EVENTS` first.** Do not pass a string literal to `capture()`.

```ts
// src/lib/analytics/posthog.ts
export const EVENTS = {
	// ...
	DECISION_MADE: 'decision_made'
} as const;
```

The `AnalyticsEvent` type is derived from this object, so a typo becomes a _compile_
error. Skip this step and a misspelled event name is indistinguishable from "nobody ever
did this" on the dashboard — silently, forever.

**2. Capture at the point of success**, not the point of intent. After the DB write
resolves, before any `goto()`:

```svelte
<script lang="ts">
	import { capture, EVENTS } from '$lib/analytics/posthog';

	await saveDecision(candidate.id, outcome);
	capture(EVENTS.DECISION_MADE, { org_id: org.id, outcome, team_id: team.id });
	goto(`/private/${slug}/candidates`);
</script>
```

**3. Send IDs and enums. Never send applicant content.** Properties are queryable and
exportable — an applicant's essay answer does not belong in an analytics warehouse.
Counts are fine (`question_count`, `rule_count`); the answers are not. The existing
auto-reject event records _how many_ rules fired, deliberately not which answer tripped
them.

**4. Fire in a redirecting form action?** The redirect kills the page before a normal
capture runs. Capture inside `use:enhance` on the `redirect` result, as
`src/routes/invite/[token]/+page.svelte` does:

```svelte
<form
	method="POST"
	action="?/accept"
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				capture(EVENTS.INVITE_ACCEPTED, { org_slug: invite.org_slug });
				await applyAction(result);
			} else {
				await update();
			}
		};
	}}
>
	<button type="submit">Join</button>
</form>
```

**5. Verify it landed.** `npm run dev`, do the thing, then PostHog → Activity. Events
appear within seconds. If nothing shows, see Troubleshooting below.

## Current events

| Event                        | Fires when                                   | Key properties                                    |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `application_started`        | Apply form renders successfully              | `org_id`, `job_id`, `resumed`                     |
| `application_step_completed` | _reserved — not yet emitted_                 | —                                                 |
| `application_draft_saved`    | _reserved — needs save-and-resume (Phase 2)_ | —                                                 |
| `application_submitted`      | After the applicant row is inserted          | `org_id`, `job_id`, `team_count`, `auto_rejected` |
| `application_auto_rejected`  | Submission matched a `reject_if` rule        | `org_id`, `job_id`, `rule_count`                  |
| `candidate_reviewed`         | _reserved — not yet emitted_                 | —                                                 |
| `interview_scheduled`        | _reserved — not yet emitted_                 | —                                                 |
| `interview_evaluated`        | _reserved — not yet emitted_                 | —                                                 |
| `decision_made`              | _reserved — needs Phase 5_                   | —                                                 |
| `org_created`                | Org registration completes                   | `org_id`, `org_slug`                              |
| `invite_created`             | Admin generates an invite link               | `org_id`, `role`, `open_link`                     |
| `invite_accepted`            | Invitee redeems a link                       | `org_slug`, `role`                                |

Names marked _reserved_ exist in `EVENTS` but have no `capture()` call yet — they are the
funnel steps the dashboard below expects. Wiring them up is tracked in `TODO.md` Phase 6.

## The funnel to build in PostHog

Product → Funnels, with these steps in order:

1. `application_started`
2. `application_submitted`
3. `interview_scheduled`
4. `decision_made`

Break down by the `organization` group to compare orgs. A drop-off above ~30% between
steps 1 and 2 means a form bug, not applicant disinterest — that's the number to watch
daily during a live cycle.

## Privacy posture

These are set deliberately in `initAnalytics()`; think before loosening any of them:

- `autocapture: false` — no automatic click/input capture. Autocapture on an application
  form would record form field interactions across pages of personal data.
- `disable_session_recording: true` — LUMA handles names, emails, and essay answers.
- `capture_pageview: false` — SvelteKit navigates client-side, so PostHog's automatic
  pageview would fire exactly once per hard load. The root layout captures each
  navigation in `afterNavigate` instead.
- `capture_exceptions: true` — this is the error tracking. Uncaught errors and unhandled
  rejections become PostHog issues.

Identity: recruiters are `identify()`d on auth state change and `reset()` on sign-out (so
a shared machine doesn't merge two people). **Applicants are never identified** — they
stay anonymous through the whole apply funnel.

## Troubleshooting

**No events at all.** Check the key is actually loaded:

```bash
grep POSTHOG .env.local
```

Both names must be bare — `PUBLIC_POSTHOG_KEY=phc_...`. Backticks or quotes _around the
variable name_ silently produce a var Vite won't expose, and the app carries on with
analytics off because every helper no-ops. This exact mistake was live in this repo.
Restart `npm run dev` after editing `.env.local`; Vite only reads it at boot.

**Key format.** The client key starts `phc_` and is a public, write-only ingest key —
safe in the browser bundle and in `env.example`. A `phx_` key is a _personal_ API key
with read access; it must never appear in client code.

**Host.** `https://us.i.posthog.com` (US) or `https://eu.i.posthog.com` (EU). It must
match the region the project was created in, and it must include the scheme.

**Events in dev pollute prod numbers.** Use a separate PostHog project for local work and
point `.env.local` at that key, per `DEPLOYMENT.md`.

## Production setup

`PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` must be set in **Vercel → Project →
Settings → Environment Variables** for the Production environment. They are `PUBLIC_`
vars, so they are inlined at build time — changing them requires a redeploy, not just a
restart.
