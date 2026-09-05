import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/**
 * Land every emailed auth link here — magic link, signup confirmation, and
 * password recovery alike.
 *
 * Three different things can arrive at this URL, and for a long time only one
 * of them worked:
 *
 *  - `?token_hash=…&type=…`  a link built from a CUSTOM email template that
 *    uses `{{ .TokenHash }}`. Verified with `verifyOtp`. This is the only shape
 *    the route originally handled, and it is the one that works when the link
 *    is opened on a different device from the one that requested it.
 *  - `?code=…`  what Supabase actually sends with the DEFAULT templates, since
 *    `@supabase/ssr` uses the PKCE flow. Needs `exchangeCodeForSession`.
 *    Without this branch a perfectly valid link fell straight through to the
 *    error page, which is indistinguishable to the user from an expired one.
 *  - `?error=…&error_code=…`  GoTrue rejected the token before we ever saw it,
 *    typically because it had already been consumed. Worth reporting as its own
 *    thing rather than as a generic failure.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;
	const code = url.searchParams.get('code');
	const rawNext = url.searchParams.get('next') ?? '/';

	// Assigning to `redirectTo.pathname` below already keeps this on our own
	// origin (the URL setter writes only the path component), so this is belt
	// and braces — but it stops a confirm link from being crafted to dump the
	// user on an arbitrary in-app page, and keeps the rule identical to
	// safeRedirect() in ../+page.server.ts.
	const next =
		rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
			? rawNext
			: '/';

	/**
	 * Clean up the redirect URL by deleting the Auth flow parameters.
	 *
	 * `next` is preserved for now, because it's needed in the error case.
	 */
	const redirectTo = new URL(url);
	redirectTo.pathname = next;
	for (const p of ['token_hash', 'type', 'code', 'error', 'error_code', 'error_description']) {
		redirectTo.searchParams.delete(p);
	}

	const succeed = () => {
		redirectTo.searchParams.delete('next');
		redirect(303, redirectTo);
	};

	// GoTrue already refused the token; it never reached us intact.
	const upstreamError = url.searchParams.get('error_code') ?? url.searchParams.get('error');

	if (!upstreamError && token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ type, token_hash });
		if (!error) succeed();
		console.error('verifyOtp failed:', error?.message);
	} else if (!upstreamError && code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) succeed();
		console.error('exchangeCodeForSession failed:', error?.message);
	}

	// Back to the sign-in page rather than a dead end, carrying an explanation
	// and — for a magic link — the form that issues a fresh one. `next` rides
	// along so a redemption interrupted mid-invite resumes where it left off.
	const params = new URLSearchParams({
		error:
			'That link is no longer valid. Links can only be used once, and some email providers open them automatically before you do. Request a new one below.'
	});
	if (type === 'recovery') params.set('mode', 'forgot');
	else params.set('mode', 'magic');
	if (next !== '/') params.set('redirect', next);
	redirect(303, '/auth?' + params.toString());
};
