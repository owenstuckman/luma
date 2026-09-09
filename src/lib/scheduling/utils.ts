import type { TimeRange, ProposedInterview, BatchRound, BatchSessionWindow } from './types';

/** Convert "HH:mm" to minutes since midnight */
export function toMinutes(t: string): number {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
}

/** Convert minutes since midnight back to "HH:mm" */
export function fromMinutes(mins: number): string {
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Build ISO datetime string from date + time */
export function toISO(date: string, time: string): string {
	return `${date}T${time}:00`;
}

/**
 * Find all overlapping slot windows between two sets of availability ranges.
 * Returns candidate slots of at least `durationMins` length on matching dates.
 * If applicant has no availability (rangesA is empty), use all interviewer slots.
 */
export function findOverlappingSlots(
	rangesA: TimeRange[],
	rangesB: TimeRange[],
	durationMins: number
): { date: string; start: string; end: string }[] {
	const results: { date: string; start: string; end: string }[] = [];

	// If applicant has no availability, treat them as available anytime —
	// use all interviewer slots directly.
	if (rangesA.length === 0) {
		for (const b of rangesB) {
			if (toMinutes(b.end) - toMinutes(b.start) >= durationMins) {
				results.push({ date: b.date, start: b.start, end: b.end });
			}
		}
		return results;
	}

	for (const a of rangesA) {
		for (const b of rangesB) {
			if (a.date !== b.date) continue;
			const overlapStart = Math.max(toMinutes(a.start), toMinutes(b.start));
			const overlapEnd = Math.min(toMinutes(a.end), toMinutes(b.end));
			if (overlapEnd - overlapStart >= durationMins) {
				results.push({
					date: a.date,
					start: fromMinutes(overlapStart),
					end: fromMinutes(overlapEnd)
				});
			}
		}
	}
	return results;
}

/**
 * Check if a proposed slot conflicts with any existing/proposed interviews
 * for a given person (interviewer or applicant email).
 */
export function hasConflict(
	date: string,
	startTime: string,
	endTime: string,
	personEmail: string,
	existing: { startTime: string; endTime: string; interviewer: string; applicant: string }[],
	proposed: ProposedInterview[],
	breakMins: number
): boolean {
	const slotStart = toMinutes(startTime);
	const slotEnd = toMinutes(endTime) + breakMins;

	for (const interview of [...existing, ...proposed]) {
		const isInvolved = interview.interviewer === personEmail || interview.applicant === personEmail;
		if (!isInvolved) continue;

		// Extract date and time from interview startTime/endTime
		const iDate = interview.startTime.substring(0, 10);
		if (iDate !== date) continue;

		const iStart = toMinutes(interview.startTime.substring(11, 16));
		const iEnd = toMinutes((interview.endTime || interview.startTime).substring(11, 16));

		if (slotStart < iEnd && slotEnd > iStart) return true;
	}
	return false;
}

/**
 * Try to find the first available slot from overlapping windows,
 * checking conflicts for both applicant and interviewer.
 */
export function findFirstAvailableSlot(
	applicantEmail: string,
	interviewerEmail: string,
	overlaps: { date: string; start: string; end: string }[],
	durationMins: number,
	breakMins: number,
	existing: { startTime: string; endTime: string; interviewer: string; applicant: string }[],
	proposed: ProposedInterview[],
	/**
	 * Optional extra test a slot must pass — used to reject a time when every
	 * room is already occupied. Without it the caller could only discard the
	 * whole (applicant, interviewer) pairing on a room clash; with it the search
	 * simply moves on to the next quarter hour and keeps looking.
	 */
	slotUsable?: (date: string, start: string, end: string) => boolean
): { date: string; start: string; end: string } | null {
	for (const overlap of overlaps) {
		let cursor = toMinutes(overlap.start);
		const windowEnd = toMinutes(overlap.end);

		while (cursor + durationMins <= windowEnd) {
			const startStr = fromMinutes(cursor);
			const endStr = fromMinutes(cursor + durationMins);

			const interviewerBusy = hasConflict(
				overlap.date,
				startStr,
				endStr,
				interviewerEmail,
				existing,
				proposed,
				breakMins
			);
			const applicantBusy = hasConflict(
				overlap.date,
				startStr,
				endStr,
				applicantEmail,
				existing,
				proposed,
				breakMins
			);

			if (
				!interviewerBusy &&
				!applicantBusy &&
				(!slotUsable || slotUsable(overlap.date, startStr, endStr))
			) {
				return { date: overlap.date, start: startStr, end: endStr };
			}

			cursor += 15; // advance by 15 min increments
		}
	}
	return null;
}

// ── Batch Scheduler Helpers ───────────────────────────────────────────────────

/**
 * Check if a TimeRange[] covers a specific (date, startMins, endMins) window.
 * If applicant has no availability data, treat them as available anytime.
 */
export function applicantAvailableAt(
	availability: TimeRange[],
	date: string,
	startMins: number,
	endMins: number
): boolean {
	// No availability data = available anytime
	if (availability.length === 0) return true;

	for (const range of availability) {
		if (range.date !== date) continue;
		if (toMinutes(range.start) <= startMins && toMinutes(range.end) >= endMins) {
			return true;
		}
	}
	return false;
}

export interface RoomSlot {
	id: string;
	room: string;
	round: BatchRound;
	date: string;
	startTime: string; // HH:mm
	endTime: string; // HH:mm
	startMins: number;
	endMins: number;
	assignedApplicants: string[]; // emails
	assignedInterviewers: string[]; // emails
}

/**
 * Generate all room×time slots for every round across all session windows.
 * Each slot represents a (room, date, startTime, endTime) that can hold
 * up to round.groupSize applicants.
 */
export function generateRoomSlots(
	rooms: string[],
	rounds: BatchRound[],
	sessionWindows: BatchSessionWindow[],
	slotStepMinutes: number,
	blockBreakMinutes: number
): RoomSlot[] {
	const slots: RoomSlot[] = [];

	for (const window of sessionWindows) {
		const windowStart = toMinutes(window.startTime);
		const windowEnd = toMinutes(window.endTime);
		// Per-window rooms win; the shared list is the fallback for configs that
		// predate them.
		const windowRooms = window.rooms && window.rooms.length > 0 ? window.rooms : rooms;
		if (windowRooms.length === 0) continue;

		for (const round of rounds) {
			const duration = round.durationMinutes;
			let cursor = windowStart;
			let slotIndex = 0;

			while (cursor + duration <= windowEnd) {
				const startTime = fromMinutes(cursor);
				const endTime = fromMinutes(cursor + duration);

				for (const room of windowRooms) {
					slots.push({
						id: `${window.date}-${room}-${round.id}-${slotIndex}`,
						room,
						round,
						date: window.date,
						startTime,
						endTime,
						startMins: cursor,
						endMins: cursor + duration,
						assignedApplicants: [],
						assignedInterviewers: []
					});
				}

				cursor += slotStepMinutes + blockBreakMinutes;
				slotIndex++;
			}
		}
	}

	return slots;
}

/**
 * Check if an applicant already has a conflicting interview in the proposed list
 * at the given (date, startMins, endMins) window.
 */
export function applicantHasConflict(
	email: string,
	date: string,
	startMins: number,
	endMins: number,
	proposed: ProposedInterview[],
	existing: { startTime: string; endTime: string; interviewer: string; applicant: string }[]
): boolean {
	const all = [
		...proposed.map((p) => ({ startTime: p.startTime, endTime: p.endTime, person: p.applicant })),
		...existing.map((e) => ({ startTime: e.startTime, endTime: e.endTime, person: e.applicant }))
	];

	for (const interview of all) {
		if (interview.person !== email) continue;
		const iDate = interview.startTime.substring(0, 10);
		if (iDate !== date) continue;
		const iStart = toMinutes(interview.startTime.substring(11, 16));
		const iEnd = toMinutes((interview.endTime || interview.startTime).substring(11, 16));
		if (startMins < iEnd && endMins > iStart) return true;
	}
	return false;
}

/**
 * Check if an interviewer is free at (date, startMins, endMins).
 */
export function interviewerFreeAt(
	email: string,
	date: string,
	startMins: number,
	endMins: number,
	assignedSlots: RoomSlot[]
): boolean {
	for (const slot of assignedSlots) {
		if (slot.date !== date) continue;
		if (!slot.assignedInterviewers.includes(email)) continue;
		if (startMins < slot.endMins && endMins > slot.startMins) return false;
	}
	return true;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

/**
 * Turn whatever someone pasted into a clean room list.
 *
 * Room bookings arrive from wherever the university's room system spat them
 * out, and asking a recruiter to reformat a 66-line booking list by hand before
 * scheduling is how mistakes get made. So this accepts the shapes that actually
 * show up:
 *
 *   MCB 238 @ 5-9PM          → "MCB 238"   (a trailing time annotation is dropped)
 *   - MCB 230                → "MCB 230"   (bullets and "1." numbering are stripped)
 *   MCB 230, MCB 231         → two rooms   (commas, semicolons and tabs all split)
 *   September 9th:           → dropped     (a line ending in ':' is a heading)
 *
 * Duplicates are removed case-insensitively, keeping the first spelling seen,
 * so pasting several days at once yields each room once.
 *
 * The deliberate trade-off is that a room whose name contains a comma or an '@'
 * cannot be expressed. No real room here does, and silently mangling the common
 * case to protect a hypothetical one is the worse bargain.
 */
export function parseRoomList(raw: string | null | undefined): string[] {
	if (!raw) return [];

	const out: string[] = [];
	const seen = new Set<string>();

	for (const line of raw.split(/[\n;,\t]+/)) {
		let room = line.trim();
		if (!room) continue;

		// "September 9th:" and friends — a heading, not a room.
		if (room.endsWith(':')) continue;

		room = room.replace(/^[-*•\u2013\u2014]\s*/, ''); // bullets
		room = room.replace(/^\d+[.)]\s+/, ''); // "1. " / "1) "
		room = room.split('@')[0]; // "MCB 238 @ 5-9PM"
		room = room.replace(/\s+/g, ' ').trim();
		if (!room) continue;

		const key = room.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(room);
	}

	return out;
}

/** A room held for one interview, in minutes-from-midnight on one date. */
export interface RoomBooking {
	room: string;
	date: string;
	startMins: number;
	endMins: number;
}

/**
 * First room with nothing in it for this window, or null when all are busy.
 *
 * Two interviews cannot share a room, so a null here is a real capacity limit
 * rather than a reason to place the interview anyway — callers must treat it as
 * "this time does not work" and keep searching.
 */
export function findFreeRoom(
	rooms: string[],
	date: string,
	startMins: number,
	endMins: number,
	booked: RoomBooking[]
): string | null {
	for (const room of rooms) {
		const clash = booked.some(
			(b) => b.room === room && b.date === date && startMins < b.endMins && endMins > b.startMins
		);
		if (!clash) return room;
	}
	return null;
}

/**
 * The rooms a run should use, from either the multi-room list or the older
 * single `location` box. Returns [] when neither is set, which callers read as
 * "no room tracking — fall back to config.location", preserving the behaviour
 * of every schedule built before rooms existed.
 */
export function roomsFromConfig(config: { rooms?: unknown; location?: unknown }): string[] {
	if (Array.isArray(config.rooms)) {
		return config.rooms.map((r) => String(r).trim()).filter(Boolean);
	}
	if (typeof config.rooms === 'string') return parseRoomList(config.rooms);
	return [];
}
