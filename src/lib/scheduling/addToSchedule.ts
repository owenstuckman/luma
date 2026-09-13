/**
 * Fit ONE candidate into a schedule that already exists.
 *
 * The batch scheduler builds a whole schedule from nothing. Once that schedule
 * is live and emails are out, a late addition — a candidate advanced after the
 * fact, or one who dropped and came back — cannot go through it again without
 * reshuffling everyone else. Before this existed the fix was done by hand in
 * SQL: find a group session with a spare seat on the day they asked for, find a
 * free room and a free interviewer for an individual slot right next to it,
 * then insert one row per interviewer.
 *
 * This module does exactly that, and nothing else. It works from the live
 * interview rows rather than from a saved scheduler config, because the config
 * that produced a schedule is not necessarily the one saved — the shape of the
 * schedule itself (session lengths, which rooms were in use on which evening,
 * who is staffing what) is the ground truth.
 *
 * Pure: no DB, no DOM. Times are handled as LOCAL wall-clock date + minutes so
 * a candidate's "Monday 6–9pm" compares directly; `toLocalSlot` / `localToISO`
 * convert at the edges.
 */
import type { TimeRange } from './types';
import { toMinutes, fromMinutes } from './utils';

export interface ExistingRow {
	start_time: string;
	end_time: string | null;
	location: string | null;
	type: 'individual' | 'group';
	interviewer: string | null;
	applicant: string | null;
}

export interface InterviewerHours extends TimeRange {
	email: string;
}

export interface AddToScheduleOptions {
	/** YYYY-MM-DD the candidate would rather come in on. Other days still appear, ranked lower. */
	preferredDate?: string | null;
	/**
	 * Largest a group session may grow to by adding this candidate. Null reads it
	 * off the schedule: fill up to the largest session running, and once every
	 * session is that size, allow exactly one more — a full schedule is the
	 * normal state by the time someone is being added late.
	 */
	maxGroupSize: number | null;
	/**
	 * Local "YYYY-MM-DDTHH:mm" before which nothing is offered. A session that
	 * has already happened is not an opening.
	 */
	notBefore?: string | null;
	/** Shortest break between the individual and the group interview. */
	minGapMinutes: number;
	/** Longest the candidate should be left waiting between the two. */
	maxGapMinutes: number;
	/** Granularity of candidate start times. */
	stepMinutes: number;
	/** How many options to return. */
	limit: number;
}

export const DEFAULT_ADD_OPTIONS: AddToScheduleOptions = {
	preferredDate: null,
	maxGroupSize: null,
	notBefore: null,
	minGapMinutes: 5,
	maxGapMinutes: 30,
	stepMinutes: 5,
	limit: 6
};

export interface PlannedIndividual {
	date: string;
	start: string;
	end: string;
	location: string;
	interviewer: string;
}

export interface PlannedGroup {
	date: string;
	start: string;
	end: string;
	location: string;
	interviewers: string[];
	/** Candidates already in the session, before this one joins. */
	currentSize: number;
}

export interface PlacementOption {
	date: string;
	individual: PlannedIndividual | null;
	group: PlannedGroup | null;
	/** True when some part falls outside what the candidate said they were free for. */
	outsideAvailability: boolean;
	preferredDay: boolean;
	score: number;
}

export interface AddToScheduleResult {
	options: PlacementOption[];
	/** The candidate's existing interviews, if any — adding them again would double-book. */
	alreadyScheduled: LocalSlot[];
	/** Which interview types the live schedule uses, so the UI can say what it is placing. */
	needsIndividual: boolean;
	needsGroup: boolean;
	/** The group size cap that was actually applied. */
	groupCap: number;
	warnings: string[];
}

export interface LocalSlot {
	date: string;
	startMin: number;
	endMin: number;
	location: string;
	type: 'individual' | 'group';
	interviewer: string;
	applicant: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A stored timestamp as local wall-clock date + minutes since midnight. */
export function toLocalSlot(row: ExistingRow): LocalSlot {
	const s = new Date(row.start_time);
	const e = new Date(row.end_time ?? row.start_time);
	return {
		date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
		startMin: s.getHours() * 60 + s.getMinutes(),
		endMin: e.getHours() * 60 + e.getMinutes(),
		location: row.location ?? '',
		type: row.type,
		interviewer: (row.interviewer ?? '').toLowerCase(),
		applicant: (row.applicant ?? '').toLowerCase()
	};
}

/**
 * Local wall-clock date + "HH:mm" as a real UTC instant.
 *
 * Deliberately NOT `toISO()` from utils, which emits a zone-less string that
 * Postgres stores as UTC — four hours off for an evening interview in EDT.
 */
export function localToISO(date: string, time: string): string {
	return new Date(`${date}T${time}:00`).toISOString();
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
	aStart < bEnd && aEnd > bStart;

const within = (ranges: TimeRange[], date: string, start: number, end: number) =>
	ranges.some((r) => r.date === date && toMinutes(r.start) <= start && toMinutes(r.end) >= end);

/** Most common value, used to read session lengths off the schedule itself. */
function mode(values: number[]): number | null {
	if (!values.length) return null;
	const counts = new Map<number, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export function findPlacements(input: {
	applicantEmail: string;
	availability: TimeRange[];
	rows: ExistingRow[];
	interviewerHours: InterviewerHours[];
	options?: Partial<AddToScheduleOptions>;
}): AddToScheduleResult {
	const opt = { ...DEFAULT_ADD_OPTIONS, ...input.options };
	const me = input.applicantEmail.toLowerCase();
	const slots = input.rows.map(toLocalSlot);
	const warnings: string[] = [];

	const alreadyScheduled = slots.filter((s) => s.applicant === me);

	const individualLength = mode(
		slots.filter((s) => s.type === 'individual').map((s) => s.endMin - s.startMin)
	);
	const needsIndividual = individualLength !== null;

	// ── Group sessions: one per (location, date, start) ──
	type Session = PlannedGroup & { startMin: number; endMin: number; applicants: Set<string> };
	const sessions = new Map<string, Session>();
	for (const s of slots.filter((x) => x.type === 'group')) {
		const key = `${s.location}|${s.date}|${s.startMin}`;
		let sess = sessions.get(key);
		if (!sess) {
			sess = {
				date: s.date,
				start: fromMinutes(s.startMin),
				end: fromMinutes(s.endMin),
				startMin: s.startMin,
				endMin: s.endMin,
				location: s.location,
				interviewers: [],
				currentSize: 0,
				applicants: new Set()
			};
			sessions.set(key, sess);
		}
		if (s.interviewer && !sess.interviewers.includes(s.interviewer))
			sess.interviewers.push(s.interviewer);
		if (s.applicant) sess.applicants.add(s.applicant);
	}
	for (const sess of sessions.values()) {
		sess.currentSize = sess.applicants.size;
		sess.interviewers.sort();
	}
	const needsGroup = sessions.size > 0;

	const [cutDate, cutTime] = (opt.notBefore ?? '').split('T');
	const cutMin = cutTime ? toMinutes(cutTime) : 0;
	/** Not already in the past. The candidate has no interviews yet, so that is the only test. */
	const upcoming = (date: string, start: number) =>
		!cutDate || date > cutDate || (date === cutDate && start >= cutMin);

	// Size the cap from sessions still to come: the small groups are usually the
	// early ones, and they are over by the time anyone is added late.
	const sizes = [...sessions.values()]
		.filter((x) => upcoming(x.date, x.startMin))
		.map((x) => x.currentSize);
	const largest = sizes.length ? Math.max(...sizes) : 0;
	const groupCap =
		opt.maxGroupSize ?? (sizes.length && sizes.every((n) => n >= largest) ? largest + 1 : largest);

	const empty = (warning: string): AddToScheduleResult => ({
		options: [],
		alreadyScheduled,
		needsIndividual,
		needsGroup,
		groupCap,
		warnings: [warning]
	});
	if (!needsIndividual && !needsGroup) {
		return empty('There is no schedule yet for this posting — run the scheduler first.');
	}
	if (alreadyScheduled.length) {
		return empty('This candidate is already on the schedule.');
	}
	if (!input.availability.length) {
		warnings.push(
			"This candidate gave no availability, so every option is outside what they've confirmed."
		);
	}

	// ── Rooms: a room counts as booked on a day between its first and last use ──
	// Real bookings aren't stored against the schedule, so the span the room was
	// actually used for that evening is the safest stand-in: it never places
	// anyone in a room at an hour nobody had it.
	const roomSpan = new Map<
		string,
		{ date: string; location: string; open: number; close: number }
	>();
	for (const s of slots) {
		if (!s.location) continue;
		const key = `${s.date}|${s.location}`;
		const span = roomSpan.get(key);
		if (!span)
			roomSpan.set(key, { date: s.date, location: s.location, open: s.startMin, close: s.endMin });
		else {
			span.open = Math.min(span.open, s.startMin);
			span.close = Math.max(span.close, s.endMin);
		}
	}

	const roomFree = (date: string, location: string, start: number, end: number) =>
		!slots.some(
			(s) =>
				s.date === date && s.location === location && overlaps(s.startMin, s.endMin, start, end)
		);

	const busy = (email: string, date: string, start: number, end: number) =>
		slots.some(
			(s) =>
				s.interviewer === email && s.date === date && overlaps(s.startMin, s.endMin, start, end)
		);

	const load = new Map<string, number>();
	for (const s of slots) {
		if (s.type === 'individual' && s.interviewer)
			load.set(s.interviewer, (load.get(s.interviewer) ?? 0) + 1);
	}
	// Group sessions count once per session, not once per candidate in them.
	for (const sess of sessions.values())
		for (const iv of sess.interviewers) load.set(iv, (load.get(iv) ?? 0) + 1);

	const hoursByEmail = new Map<string, TimeRange[]>();
	for (const h of input.interviewerHours) {
		const email = h.email.toLowerCase();
		const list = hoursByEmail.get(email) ?? [];
		list.push({ date: h.date, start: h.start.substring(0, 5), end: h.end.substring(0, 5) });
		hoursByEmail.set(email, list);
	}

	/** Best individual slot at exactly [start, end), or null. */
	function individualAt(
		date: string,
		start: number,
		end: number,
		avoid: string[]
	): PlannedIndividual | null {
		const rooms = [...roomSpan.values()]
			.filter((r) => r.date === date && r.open <= start && r.close >= end)
			.filter((r) => roomFree(date, r.location, start, end))
			.map((r) => r.location)
			.sort();
		if (!rooms.length) return null;

		const people = [...hoursByEmail.entries()]
			.filter(([email, hours]) => within(hours, date, start, end) && !busy(email, date, start, end))
			.map(([email]) => email)
			// Someone other than the group panel gives the candidate a second
			// opinion; then spread the extra interview to whoever has done least.
			.sort(
				(a, b) =>
					Number(avoid.includes(a)) - Number(avoid.includes(b)) ||
					(load.get(a) ?? 0) - (load.get(b) ?? 0) ||
					a.localeCompare(b)
			);
		if (!people.length) return null;

		return {
			date,
			start: fromMinutes(start),
			end: fromMinutes(end),
			location: rooms[0],
			interviewer: people[0]
		};
	}

	const options: PlacementOption[] = [];
	const scoreDay = (date: string) => (opt.preferredDate && date === opt.preferredDate ? 1000 : 0);

	if (needsGroup) {
		for (const sess of sessions.values()) {
			if (sess.currentSize >= groupCap) continue;
			if (!upcoming(sess.date, sess.startMin)) continue;
			const groupOutside = !within(input.availability, sess.date, sess.startMin, sess.endMin);

			let best: PlacementOption | null = null;
			const consider = (individual: PlannedIndividual | null, gap: number) => {
				const outside =
					groupOutside ||
					(individual !== null &&
						!within(
							input.availability,
							individual.date,
							toMinutes(individual.start),
							toMinutes(individual.end)
						));
				const score =
					scoreDay(sess.date) +
					(outside ? 0 : 500) -
					gap -
					// Top up the smallest rooms first so sessions stay even.
					sess.currentSize * 10;
				if (!best || score > best.score)
					best = {
						date: sess.date,
						individual,
						group: {
							date: sess.date,
							start: sess.start,
							end: sess.end,
							location: sess.location,
							interviewers: sess.interviewers,
							currentSize: sess.currentSize
						},
						outsideAvailability: outside,
						preferredDay: !!opt.preferredDate && sess.date === opt.preferredDate,
						score
					};
			};

			if (!needsIndividual) {
				consider(null, 0);
			} else {
				const len = individualLength!;
				for (let gap = opt.minGapMinutes; gap <= opt.maxGapMinutes; gap += opt.stepMinutes) {
					// Before the group, then after it.
					for (const start of [sess.startMin - gap - len, sess.endMin + gap]) {
						const end = start + len;
						if (start < 0 || !upcoming(sess.date, start)) continue;
						const ind = individualAt(sess.date, start, end, sess.interviewers);
						if (ind) consider(ind, gap);
					}
				}
			}
			if (best) options.push(best);
		}
	} else {
		// Individual-only schedule: any free slot in a room that was in use that day.
		const len = individualLength!;
		const days = [...new Set([...roomSpan.values()].map((r) => r.date))];
		for (const date of days) {
			const spans = [...roomSpan.values()].filter((r) => r.date === date);
			const open = Math.min(...spans.map((r) => r.open));
			const close = Math.max(...spans.map((r) => r.close));
			for (let start = open; start + len <= close; start += opt.stepMinutes) {
				if (!upcoming(date, start)) continue;
				const ind = individualAt(date, start, start + len, []);
				if (!ind) continue;
				const outside = !within(input.availability, date, start, start + len);
				options.push({
					date,
					individual: ind,
					group: null,
					outsideAvailability: outside,
					preferredDay: !!opt.preferredDate && date === opt.preferredDate,
					score: scoreDay(date) + (outside ? 0 : 500) - start / 1000
				});
			}
		}
	}

	options.sort((a, b) => b.score - a.score);

	// Prefer options that respect availability; only show the rest if that's all there is.
	const inside = options.filter((o) => !o.outsideAvailability);
	const pool = inside.length ? inside : options;
	if (!inside.length && options.length) {
		warnings.push(
			'No opening fits their stated availability — these options would need them to confirm.'
		);
	}
	if (opt.preferredDate && !pool.some((o) => o.preferredDay) && pool.length) {
		warnings.push(`Nothing is open on ${opt.preferredDate}; showing the closest alternatives.`);
	}
	if (!options.length) {
		warnings.push(
			needsGroup
				? `No upcoming group session has room below ${groupCap}, or no room and interviewer are free next to one. Try a larger maximum group size.`
				: 'No room and interviewer are free at any time on the schedule.'
		);
	}

	return {
		options: pool.slice(0, opt.limit),
		alreadyScheduled,
		needsIndividual,
		needsGroup,
		groupCap,
		warnings
	};
}

/**
 * A candidate's availability answer, from wherever the form stored it.
 *
 * The question id varies by posting (`interview_availability`, `availability`,
 * …), so any key mentioning availability is tried. Moved here from the
 * Auto-Scheduling page so the full scheduler and the late-add panel read an
 * answer the same way.
 */
export function parseApplicantAvailability(
	recruitInfo: Record<string, string> | null
): TimeRange[] {
	if (!recruitInfo) return [];
	for (const [key, value] of Object.entries(recruitInfo)) {
		if (!key.toLowerCase().includes('avail')) continue;
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) return parsed as TimeRange[];
			if (parsed?.ranges && Array.isArray(parsed.ranges)) return parsed.ranges as TimeRange[];
		} catch {
			/* not JSON, skip */
		}
	}
	return [];
}

/** "Monday 14 September" */
export function formatDay(date: string): string {
	const d = new Date(`${date}T12:00:00`);
	return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
}

/** "18:50" → "6:50" / "6:50 pm" */
function clock(time: string, withMeridiem: boolean): string {
	const [h, m] = time.split(':').map(Number);
	const hour = h % 12 === 0 ? 12 : h % 12;
	return `${hour}:${String(m).padStart(2, '0')}${withMeridiem ? (h < 12 ? ' am' : ' pm') : ''}`;
}

/** "6:50 – 7:05 pm", dropping the first meridiem when both ends share it. */
export function formatRange(start: string, end: string): string {
	const sameHalf = toMinutes(start) < 720 === toMinutes(end) < 720;
	return `${clock(start, !sameHalf)} – ${clock(end, true)}`;
}

/** "kaeli74@vt.edu" → "kaeli74" — how the team refers to each other. */
export const handle = (email: string) => email.split('@')[0];

/** Plain-text summary for pasting into a message or an email to the candidate. */
export function describePlacement(name: string, option: PlacementOption): string {
	const lines = [`${name} — ${formatDay(option.date)}`, ''];
	if (option.individual) {
		const i = option.individual;
		lines.push(
			`Individual: ${formatRange(i.start, i.end)}, ${i.location} — with ${handle(i.interviewer)}`
		);
	}
	if (option.group) {
		const g = option.group;
		lines.push(
			`Group: ${formatRange(g.start, g.end)}, ${g.location} — with ${g.interviewers.map(handle).join(', ')}`
		);
	}
	return lines.join('\n');
}
