import { writable } from 'svelte/store';

/**
 * Blind mode: show candidates as numbers instead of names (see utils/blind.ts).
 *
 * A per-browser preference, remembered in localStorage — it holds a boolean,
 * never applicant data. Starts off on the server and until `initBlindMode()`
 * runs in the browser, so server-rendered markup never disagrees with it.
 */
const KEY = 'luma:blind-mode';

export const blindMode = writable(false);

let initialised = false;

export function initBlindMode(): void {
	if (initialised || typeof localStorage === 'undefined') return;
	initialised = true;
	try {
		blindMode.set(localStorage.getItem(KEY) === '1');
	} catch {
		// Storage blocked: blind mode just starts off.
	}
	blindMode.subscribe((on) => {
		try {
			localStorage.setItem(KEY, on ? '1' : '0');
		} catch {
			// Not remembered; still works for this page.
		}
	});
}
