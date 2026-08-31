import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/**
 * Server-side gate for the cross-org platform admin panel.
 *
 * The page already checked `isPlatformAdmin()` in onMount, and every RPC and
 * table behind it re-checks server-side, so this closes no data leak. What it
 * closes is the gap where a non-admin loads the whole admin bundle and sits in
 * a broken-looking shell — and it means the authorization decision no longer
 * depends solely on client code that a determined user controls.
 *
 * `is_platform_admin()` is SECURITY DEFINER and keys off auth.uid(), so calling
 * it with the request-scoped client is authoritative.
 */
export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (!session) redirect(303, '/auth?redirect=%2Fadmin');

	const { data, error } = await supabase.rpc('is_platform_admin');

	// Fail closed, but keep "couldn't check" distinct from "not an admin" — the
	// two collapsing into one message is the misdiagnosis that cost real time on
	// the old settings page.
	if (error) {
		return { isPlatformAdmin: false, checkFailed: true };
	}
	if (!data) redirect(303, '/private');

	return { isPlatformAdmin: true, checkFailed: false };
};
