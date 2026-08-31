import { redirect } from '@sveltejs/kit';

import { allowAuthEmail } from '$lib/server/rateLimit';
import { validatePassword } from '$lib/utils/password';

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

		// Checked here rather than only in the browser: `minlength` on the input is
		// advisory, and this action is reachable by posting the form directly.
		const pwProblem = validatePassword(password);
		if (pwProblem) {
			const params = new URLSearchParams({ error: pwProblem });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}

		// Carry `redirect` through the confirmation email too. Without this an
		// invited user confirms their address and lands on `/`, stranded from the
		// invite link they started at.
		const next = redirectTo || '/private';
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: { emailRedirectTo: `${url.origin}/auth/confirm?next=${encodeURIComponent(next)}` }
		});
		if (error) {
			console.error(error);
			const params = new URLSearchParams({ error: error.message });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}

		// Whether a confirmation email is sent at all is a project-level Supabase
		// setting, not something this code controls. With "Confirm email" OFF,
		// signUp returns a live session and the account is already usable — telling
		// that person to go and check their inbox sends them to wait for a message
		// that will never arrive. Branch on what actually came back instead.
		if (data.session) {
			redirect(303, next);
		}

		const params = new URLSearchParams({ message: 'Check your email to confirm your account.' });
		if (redirectTo) params.set('redirect', redirectTo);
		redirect(303, '/auth?' + params.toString());
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

		// Keyed on the recipient, not the requester: nothing here proves the person
		// submitting owns this address, so the inbox being protected may belong to
		// someone with no connection to the app. Reported as success either way —
		// saying "that address is rate limited" would confirm the address exists.
		if (!allowAuthEmail(email)) {
			redirect(
				303,
				'/auth?message=' + encodeURIComponent('Password reset link sent! Check your email.')
			);
		}

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/reset`
		});
		if (error) {
			console.error(error);
			redirect(303, '/auth?mode=forgot&error=' + encodeURIComponent(error.message));
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

		// Same recipient-keyed guard as resetPassword, and the same silent success.
		if (!allowAuthEmail(email)) {
			const params = new URLSearchParams({ message: 'Magic link sent! Check your email.' });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}

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
			const params = new URLSearchParams({ mode: 'magic', error: error.message });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		} else {
			const params = new URLSearchParams({ message: 'Magic link sent! Check your email.' });
			if (redirectTo) params.set('redirect', redirectTo);
			redirect(303, '/auth?' + params.toString());
		}
	},
	updatePassword: async ({ request, locals: { supabase, safeGetSession } }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;
		const passwordConfirm = formData.get('passwordConfirm') as string | null;

		// updateUser() acts on whatever session cookie is present, so without this
		// the endpoint silently doubled as an unauthenticated password-change
		// attempt that failed with Supabase's opaque "Auth session missing".
		const { session } = await safeGetSession();
		if (!session) {
			redirect(
				303,
				'/auth/reset?error=' +
					encodeURIComponent('Your reset link has expired. Please request a new one.')
			);
		}

		if (passwordConfirm !== null && password !== passwordConfirm) {
			redirect(303, '/auth/reset?error=' + encodeURIComponent('Both passwords must match.'));
		}

		const pwProblem = validatePassword(password);
		if (pwProblem) {
			redirect(303, '/auth/reset?error=' + encodeURIComponent(pwProblem));
		}

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
