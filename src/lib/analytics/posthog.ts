/**
 * PostHog — product analytics AND error tracking (one vendor, per docs/CLAUDE.md).
 *
 * Everything here is a no-op when `PUBLIC_POSTHOG_KEY` is unset, which is the
 * normal state for local dev and for anyone who clones the repo. That's why
 * this reads `$env/dynamic/public` rather than `$env/static/public`: the static
 * variant would fail the BUILD on a missing key, and analytics should never be
 * the reason a deploy doesn't go out.
 *
 * Import from here rather than reaching for `posthog-js` directly — the guard,
 * the browser check, and the event-name constants all live in this file.
 */
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

import type { PostHog } from 'posthog-js';

let client: PostHog | null = null;
let initialized = false;

/** True when a key is configured and we're running in the browser. */
export const analyticsEnabled = () => browser && Boolean(env.PUBLIC_POSTHOG_KEY);

/**
 * Boot PostHog. Safe to call more than once; only the first call does work.
 * Called from the root layout, so every route is covered.
 */
export const initAnalytics = async (): Promise<void> => {
	if (initialized || !analyticsEnabled()) return;
	initialized = true;

	// Dynamic import keeps posthog-js out of the bundle for the applicant-facing
	// routes when analytics is switched off.
	const { default: posthog } = await import('posthog-js');

	posthog.init(env.PUBLIC_POSTHOG_KEY as string, {
		api_host: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
		// SvelteKit client-side navigation doesn't reload the page, so PostHog's
		// automatic pageview would only ever fire once. We capture manually in
		// the root layout's afterNavigate instead.
		capture_pageview: false,
		capture_pageleave: true,
		persistence: 'localStorage+cookie',
		// Uncaught exceptions and unhandled rejections become PostHog issues —
		// this is what replaces Sentry for V1.
		capture_exceptions: true,
		// Applicant answers are personal data. Never let session replay or
		// autocapture hoover up what someone typed into the form.
		autocapture: false,
		mask_all_text: false,
		disable_session_recording: true
	});

	client = posthog;
};

/** The raw client, or null when analytics is off. Prefer the helpers below. */
export const getAnalytics = () => client;

/** Record a pageview. Called on every navigation from the root layout. */
export const capturePageview = (url: URL): void => {
	client?.capture('$pageview', {
		$current_url: url.href,
		// Grouping by route id rather than href keeps `/apply/archimedes/12` and
		// `/apply/vt/47` in the same funnel step.
		route: url.pathname
	});
};

/**
 * Tie events to a person. Call after auth resolves so recruiter-side funnels
 * are attributable; applicants stay anonymous until they submit.
 */
export const identifyUser = (userId: string, properties: Record<string, unknown> = {}): void => {
	client?.identify(userId, properties);
};

/** Associate the current person with an org, enabling per-org breakdowns. */
export const setOrgGroup = (orgId: number, orgName?: string): void => {
	client?.group('organization', String(orgId), orgName ? { name: orgName } : undefined);
};

/** Clear identity on logout so the next user doesn't inherit the last one's. */
export const resetAnalytics = (): void => {
	client?.reset();
};

/**
 * Canonical event names. Keep every `capture()` call pointed at one of these —
 * PostHog funnels break silently when an event name drifts, and a typo'd name
 * looks exactly like "nobody did this" on the dashboard.
 */
export const EVENTS = {
	// Apply funnel, in order.
	APPLICATION_STARTED: 'application_started',
	APPLICATION_STEP_COMPLETED: 'application_step_completed',
	APPLICATION_DRAFT_SAVED: 'application_draft_saved',
	APPLICATION_SUBMITTED: 'application_submitted',
	APPLICATION_AUTO_REJECTED: 'application_auto_rejected',
	// Recruiter pipeline.
	CANDIDATE_REVIEWED: 'candidate_reviewed',
	INTERVIEW_SCHEDULED: 'interview_scheduled',
	INTERVIEW_EVALUATED: 'interview_evaluated',
	DECISION_MADE: 'decision_made',
	// Org lifecycle.
	ORG_CREATED: 'org_created',
	INVITE_CREATED: 'invite_created',
	INVITE_ACCEPTED: 'invite_accepted'
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Record a product event.
 *
 * Pass IDs and enums, never free text an applicant typed — PostHog properties
 * are queryable and exportable, and application answers don't belong there.
 */
export const capture = (event: AnalyticsEvent, properties: Record<string, unknown> = {}): void => {
	client?.capture(event, properties);
};

/**
 * Report a handled error. Uncaught ones are captured automatically by
 * `capture_exceptions`; use this for errors you caught and recovered from but
 * still want to see.
 */
export const captureError = (error: unknown, context: Record<string, unknown> = {}): void => {
	if (!client) return;
	client.captureException(error instanceof Error ? error : new Error(String(error)), context);
};
