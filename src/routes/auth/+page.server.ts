import { redirect } from '@sveltejs/kit';

import type { Actions } from './$types';

/**
 * Only ever redirect to a path on this site.
 *
 * `redirect` arrives as a hidden form field fed straight from the `?redirect=`
 * query param, so without this an attacker could send someone
 * `/auth?redirect=https://evil.example` — the victim logs in on the real login
 * page, with the real cert, and is then handed to the attacker's site, primed
 * to re-enter their credentials on a convincing "session expired" page.
 *
 * A leading `//` (or `/\\`) is rejected too: browsers read `//evil.example` as
 * protocol-relative and would leave the origin.
 */
function safeRedirect(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith('/')) return null;
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
	return raw;
}

export const actions: Actions = {
	signup: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const redirectTo = safeRedirect(formData.get('redirect') as string | null);

		// Carry `redirect` through the confirmation email too. Without this an
		// invited user confirms their address and lands on `/`, stranded from the
		// invite link they started at.
		const next = redirectTo || '/private';
		const { error } = await supabase.auth.signUp({
			email,
			password,
			options: { emailRedirectTo: `${url.origin}/auth/confirm?next=${encodeURIComponent(next)}` }
		});
		if (error) {
			console.error(error);
			const params = new URLSearchParams({ error: error.message });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		} else {
			const params = new URLSearchParams({ message: 'Check your email to confirm your account.' });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}
	},
	login: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const redirectTo = safeRedirect(formData.get('redirect') as string | null);

		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) {
			console.error(error);
			const params = new URLSearchParams({ error: error.message });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		} else {
			redirect(303, redirectTo || '/private');
		}
	},
	resetPassword: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/reset`
		});
		if (error) {
			console.error(error);
			redirect(303, '/auth?error=' + encodeURIComponent(error.message));
		} else {
			redirect(
				303,
				'/auth?message=' + encodeURIComponent('Password reset link sent! Check your email.')
			);
		}
	},
	magicLink: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const redirectTo = safeRedirect(formData.get('redirect') as string | null);

		// Same reasoning as signup: someone who lands here from an invite link and
		// picks "magic link" instead of a password must come back to the invite,
		// not to /private, or they confirm their address and are stranded.
		const next = redirectTo || '/private';
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: `${url.origin}/auth/confirm?next=${encodeURIComponent(next)}` }
		});
		if (error) {
			console.error(error);
			const params = new URLSearchParams({ error: error.message });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		} else {
			const params = new URLSearchParams({ message: 'Magic link sent! Check your email.' });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}
	},
	updatePassword: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;

		const { error } = await supabase.auth.updateUser({ password });
		if (error) {
			console.error(error);
			redirect(303, '/auth/reset?error=' + encodeURIComponent(error.message));
		} else {
			redirect(
				303,
				'/auth?message=' + encodeURIComponent('Password updated successfully! You can now log in.')
			);
		}
	}
};
