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
 */
export function findOverlappingSlots(
	rangesA: TimeRange[],
	rangesB: TimeRange[],
	durationMins: number
): { date: string; start: string; end: string }[] {
	const results: { date: string; start: string; end: string }[] = [];

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
		const isInvolved =
			interview.interviewer === personEmail || interview.applicant === personEmail;
		if (!isInvolved) continue;

		// Extract date and time from interview startTime/endTime
		const iDate = interview.startTime.substring(0, 10);
		if (iDate !== date) continue;

		const iStart = toMinutes(interview.startTime.substring(11, 16));
		const iEnd = toMinutes(
			(interview.endTime || interview.startTime).substring(11, 16)
		);

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
	proposed: ProposedInterview[]
): { date: string; start: string; end: string } | null {
	for (const overlap of overlaps) {
		let cursor = toMinutes(overlap.start);
		const windowEnd = toMinutes(overlap.end);

		while (cursor + durationMins <= windowEnd) {
			const startStr = fromMinutes(cursor);
			const endStr = fromMinutes(cursor + durationMins);

			const interviewerBusy = hasConflict(
				overlap.date, startStr, endStr,
				interviewerEmail, existing, proposed, breakMins
			);
			const applicantBusy = hasConflict(
				overlap.date, startStr, endStr,
				applicantEmail, existing, proposed, breakMins
			);

			if (!interviewerBusy && !applicantBusy) {
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
 */
export function applicantAvailableAt(
	availability: TimeRange[],
	date: string,
	startMins: number,
	endMins: number
): boolean {
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

		for (const round of rounds) {
			const duration = round.durationMinutes;
			let cursor = windowStart;
			let slotIndex = 0;

			while (cursor + duration <= windowEnd) {
				const startTime = fromMinutes(cursor);
				const endTime = fromMinutes(cursor + duration);

				for (const room of rooms) {
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
