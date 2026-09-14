// Remembered list filters.
//
// Filters live in sessionStorage: they survive leaving a page and coming back
// (including a reload) for as long as the tab is open, and are forgotten when
// it closes, so a stale filter never greets someone days later. Only the filter
// settings are stored — never the data they filter.
//
// Storage can be unavailable (private windows, blocked site data, SSR), so
// every access fails soft: no storage just means filters start at defaults.

const PREFIX = 'luma:filters:';

export function readFilters<T extends object>(key: string): Partial<T> | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(PREFIX + key);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null;
	} catch {
		return null;
	}
}

export function writeFilters(key: string, value: object): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Quota or blocked storage: the filters just won't be remembered.
	}
}
