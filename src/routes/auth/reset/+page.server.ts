import type { PageServerLoad } from './$types';

/**
 * Tell the page whether the visitor actually arrived from a recovery link.
 *
 * Without this the page rendered its form unconditionally, and someone who hit
 * /auth/reset directly (or came back to a stale tab after the link expired) got
 * Supabase's raw "Auth session missing" only *after* typing a new password —
 * with no hint that the fix is to request a fresh link. The distinction between
 * "no session" and "something failed" is exactly the collapse that cost real
 * debugging time on the old settings page; don't reintroduce it here.
 *
 * New recovery emails route through /auth/confirm, which establishes the
 * session before redirecting here. Emails already sitting in inboxes point
 * straight at this page with the raw `?code=` on them, so redeem that here too
 * — otherwise every link issued before this change reports itself as expired
 * for as long as it is otherwise valid.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const code = url.searchParams.get('code');
	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (error) console.error('recovery exchangeCodeForSession failed:', error.message);
	}

	const { session } = await safeGetSession();
	return { hasSession: !!session };
};
