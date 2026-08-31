/**
 * In-memory fixed-window rate limiting for the auth routes.
 *
 * Scope, stated plainly: this is per server instance. On Vercel each function
 * instance keeps its own Map, so a determined attacker gets a fresh allowance
 * from a cold instance and this is a speed bump, not a wall. Making it durable
 * needs a shared store (Redis/Upstash) — tracked in docs/TODO.md.
 *
 * It is still worth having. The realistic abuse here is someone pointing the
 * password-reset form at a stranger's inbox and holding down submit; neither
 * `resetPasswordForEmail` nor `signInWithOtp` requires you to own the address,
 * so without an address-keyed limit the app is a usable email-bombing relay
 * against people who have never heard of it. Supabase applies its own limits
 * underneath, but those are project-wide and coarse.
 *
 * Deliberately NOT backed by a database function: the SvelteKit server talks to
 * Supabase with the anon key, so any RPC it can call is callable by the public
 * too — which would hand anyone a way to burn a specific victim's reset budget
 * and lock them out of their own account. Trading email-bombing for targeted
 * denial-of-recovery is not an improvement.
 */

interface Window {
	count: number;
	resetAt: number;
}

const windows = new Map<string, Window>();

// Bound the map so a flood of distinct keys can't grow it without limit.
const MAX_KEYS = 10_000;

/**
 * Consume one unit against `key`. Returns true when the caller may proceed.
 * Callers that only want to look are better served by simply not calling.
 */
export function consume(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const entry = windows.get(key);

	if (!entry || now > entry.resetAt) {
		if (windows.size >= MAX_KEYS) sweep(now);
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (entry.count >= limit) return false;
	entry.count++;
	return true;
}

function sweep(now: number) {
	for (const [key, entry] of windows) {
		if (now > entry.resetAt) windows.delete(key);
	}
	// Still full of live entries: drop the oldest-expiring to stay bounded.
	if (windows.size >= MAX_KEYS) {
		const oldest = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
		for (const [key] of oldest.slice(0, Math.ceil(MAX_KEYS / 10))) windows.delete(key);
	}
}

// Periodically drop expired entries so idle memory doesn't creep.
setInterval(() => sweep(Date.now()), 60_000);

/**
 * How many emails one address may receive from us in an hour, across password
 * reset and magic link combined. Low on purpose: a real person needs one, maybe
 * two if the first lands in spam.
 */
export const EMAIL_PER_ADDRESS_LIMIT = 4;
export const EMAIL_PER_ADDRESS_WINDOW_MS = 60 * 60 * 1000;

/**
 * Guard an outbound auth email to `email`. Returns true when we should send.
 * Keyed on the address, NOT the requester, because the person being protected
 * is the recipient — who may have nothing to do with whoever is submitting.
 */
export function allowAuthEmail(email: string): boolean {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return false;
	return consume(`email:${normalized}`, EMAIL_PER_ADDRESS_LIMIT, EMAIL_PER_ADDRESS_WINDOW_MS);
}
