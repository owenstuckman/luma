// Blind mode: candidates as numbers, not names.
//
// Names carry bias however well-meaning the reader, so blind mode swaps every
// candidate's name for a stable number and scrubs candidate names out of
// interview notes. Recruiters stay named — who wrote a note matters, so a team
// can ask its author what they meant. Pure: no DB or DOM access.

/**
 * A candidate's number: the lowest application id among their applications for
 * the posting. Stable, the same on every team's list, and meaningless on its own.
 */
export const candidateNumber = (applicationIds: number[]): number => Math.min(...applicationIds);

export const blindName = (number: number) => `Candidate #${number}`;

export interface NamedCandidate {
	name: string;
	number: number;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words in a name worth matching: skip initials and particles like "de" or "Jr". */
function nameParts(name: string): string[] {
	const skip = new Set(['de', 'da', 'del', 'la', 'le', 'van', 'von', 'jr', 'sr', 'ii', 'iii']);
	return name
		.split(/[\s\-']+/)
		.map((p) => p.replace(/[^\p{L}]/gu, ''))
		.filter((p) => p.length >= 3 && !skip.has(p.toLowerCase()));
}

/**
 * Build a function that replaces candidate names in free text with their numbers.
 *
 * Every name part of every candidate in `people` is matched as a whole,
 * capitalised word ("Delaney", "Feury"). For the `nearby` candidates — the ones
 * who shared a session, whose names actually appear in each other's notes — a
 * shortened first name is also caught ("Zach" for Zachary, "Nick" for
 * Nicholas), which would be too loose to apply to the whole roster.
 */
export function buildNameScrubber(
	people: NamedCandidate[],
	nearby: NamedCandidate[] = []
): (text: string) => string {
	const replacements = new Map<string, string>();
	const add = (word: string, number: number) => {
		const key = word.toLowerCase();
		// A word shared by two candidates ("Smith") can't say which one it was.
		const label = blindName(number);
		const existing = replacements.get(key);
		replacements.set(key, existing && existing !== label ? '[candidate]' : label);
	};

	for (const p of people) for (const part of nameParts(p.name)) add(part, p.number);

	const prefixes: { prefix: string; label: string }[] = [];
	for (const p of nearby) {
		const first = nameParts(p.name)[0];
		if (first && first.length > 4) {
			for (let len = 3; len < first.length; len++) {
				prefixes.push({ prefix: first.slice(0, len).toLowerCase(), label: blindName(p.number) });
			}
		}
	}

	if (replacements.size === 0 && prefixes.length === 0) return (text) => text;

	// Longest first, so "Romero Florero" isn't half-replaced by a shorter match.
	const words = [...replacements.keys(), ...prefixes.map((p) => p.prefix)].sort(
		(a, b) => b.length - a.length
	);
	const pattern = new RegExp(
		`(?<![\\p{L}])(${words.map(escapeRegExp).join('|')})(?![\\p{L}])('s)?`,
		'giu'
	);

	return (text) =>
		text
			.replace(pattern, (match: string, word: string, possessive: string | undefined) => {
				// Only capitalised words: "will", "grace" and "hope" in lowercase are words.
				if (word[0] !== word[0].toUpperCase()) return match;
				const key = word.toLowerCase();
				const label =
					replacements.get(key) ?? prefixes.find((p) => p.prefix === key)?.label ?? word;
				return label + (possessive ?? '');
			})
			// "Santiago Romero Florero" is three matches for one person: say it once.
			.replace(/(Candidate #\d+|\[candidate\])(?:\s+\1)+/g, '$1');
}
