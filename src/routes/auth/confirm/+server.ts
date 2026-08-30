import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;
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
	redirectTo.searchParams.delete('token_hash');
	redirectTo.searchParams.delete('type');

	if (token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ type, token_hash });
		if (!error) {
			redirectTo.searchParams.delete('next');
			redirect(303, redirectTo);
		}
	}

	redirectTo.pathname = '/auth/error';
	redirect(303, redirectTo);
};
