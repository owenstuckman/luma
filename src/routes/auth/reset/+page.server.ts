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
 * The recovery link puts a normal session cookie in place before this runs (see
 * the cookie plumbing in hooks.server.ts), so a present session is the signal.
 */
export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session } = await safeGetSession();
	return { hasSession: !!session };
};
