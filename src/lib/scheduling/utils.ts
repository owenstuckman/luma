import type { TimeRange, ProposedInterview } from './types';

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
