/**
 * Password policy, shared by signup and the reset flow.
 *
 * Supabase's own floor is 6 characters and nothing else — and this project has
 * leaked-password protection turned OFF (confirmed via get_advisors), so
 * "password" and "123456" are both accepted by the platform. Until that toggle
 * is enabled in the dashboard, this is the only check standing between a
 * recruiter account and a trivially guessable password.
 *
 * Deliberately not a composition rule ("one uppercase, one symbol"): those push
 * people toward `Password1!` and are worse than length. Length plus a small
 * blocklist of the passwords actually used in credential-stuffing catches far
 * more for far less friction.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** Lowercased. Short list on purpose — the real defence is the length floor. */
const COMMON = new Set([
	'password',
	'password1',
	'password123',
	'passw0rd',
	'12345678',
	'123456789',
	'1234567890',
	'qwertyuiop',
	'letmein123',
	'iloveyou',
	'admin123',
	'welcome123',
	'changeme',
	'trustno1'
]);

/**
 * Returns an error message, or null when the password is acceptable.
 * Runs on the server so it cannot be skipped by disabling JS or posting the
 * form action directly — the `minlength` attribute alone never stopped anyone.
 */
export function validatePassword(password: string | null | undefined): string | null {
	const value = password ?? '';

	if (value.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	// Guard the tail end of what bcrypt actually hashes; longer is silently
	// truncated by some implementations, which makes the extra length a lie.
	if (value.length > 72) {
		return 'Password must be 72 characters or fewer.';
	}
	if (COMMON.has(value.toLowerCase())) {
		return 'That password is too common. Please choose something harder to guess.';
	}
	if (/^(.)\1+$/.test(value)) {
		return 'Password cannot be a single repeated character.';
	}
	return null;
}
