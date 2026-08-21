import { captureError } from '$lib/analytics/posthog';

import type { HandleClientError } from '@sveltejs/kit';

/**
 * Client-side error tracking. PostHog's `capture_exceptions` picks up genuinely
 * uncaught errors on its own; this hook covers the ones SvelteKit intercepts
 * during load/render and turns into an error page, which would otherwise never
 * reach the global handler.
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
	// 404s are navigation, not failures — logging them buries the real errors.
	if (status !== 404) {
		captureError(error, { route: event.route?.id, url: event.url?.pathname, status });
	}

	return { message };
};
