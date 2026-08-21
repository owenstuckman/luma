import { fail, redirect } from '@sveltejs/kit';

import type { InviteDetails } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * Invite landing page. Deliberately server-loaded: the visitor usually has no
 * account yet, so there's no client session to read from, and `get_invite_details`
 * is granted to `anon` precisely so this render works logged-out.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const { data, error } = await supabase.rpc('get_invite_details', {
		invite_token: params.token
	});

	if (error) {
		console.error('Error reading invite:', error);
		return {
			invite: { valid: false, reason: 'not_found' } as InviteDetails,
			token: params.token,
			userEmail: user?.email ?? null
		};
	}

	return {
		invite: data as InviteDetails,
		token: params.token,
		userEmail: user?.email ?? null
	};
};

export const actions: Actions = {
	accept: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			redirect(303, `/auth?redirect=${encodeURIComponent(`/invite/${params.token}`)}`);
		}

		const { data, error } = await supabase.rpc('accept_org_invite', {
			invite_token: params.token
		});

		if (error) return fail(400, { error: error.message });
		if (data?.error) return fail(400, { error: data.error });

		redirect(303, `/private/${data.slug}/dashboard`);
	}
};
