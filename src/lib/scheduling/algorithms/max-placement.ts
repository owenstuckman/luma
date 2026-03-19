import type {
	SchedulingAlgorithm,
	SchedulerInput,
	SchedulerOutput,
	ProposedInterview
} from '../types';
import { findOverlappingSlots, toISO, toMinutes, fromMinutes } from '../utils';

/**
 * Recursive backtracking scheduler that maximizes the number of placed applicants.
 *
 * Strategy:
 * 1. Sort applicants by most constrained first (fewest available slots).
 * 2. For each applicant, try every valid (interviewer, slot) assignment.
 * 3. Recurse on remaining applicants. If placing this applicant leads to fewer
 *    total placements than skipping them, backtrack and try the next option.
 * 4. Track the best complete assignment found so far and prune branches that
 *    can't beat it.
 */
export const maxPlacement: SchedulingAlgorithm = {
	id: 'max-placement',
	name: 'Maximize Placement (Backtracking)',
	description:
		'Recursive DFS with backtracking that maximizes the total number of scheduled interviews. Explores assignment orderings and backtracks when a choice blocks future placements.',
	configSchema: [
		{
			key: 'timeLimitMs',
			label: 'Time limit (ms)',
			type: 'number',
			default: 5000
		}
	],
	run(input: SchedulerInput): SchedulerOutput {
		const { applicants, interviewers, existingInterviews, config } = input;
		const warnings: string[] = [];
		const timeLimitMs = (config as Record<string, unknown>).timeLimitMs as number ?? 5000;

		if (interviewers.length === 0) {
			warnings.push('No interviewers with availability found.');
			return {
				interviews: [],
				unmatched: applicants.map((a) => a.email),
				warnings
			};
		}

		// Count existing assignments per interviewer
		const existingCount = new Map<string, number>();
		for (const iv of existingInterviews) {
			existingCount.set(iv.interviewer, (existingCount.get(iv.interviewer) || 0) + 1);
		}

		// Pre-compute candidate slots for each (applicant, interviewer) pair
		// Each candidate is a concrete time slot that doesn't conflict with existing interviews
		interface CandidateSlot {
			interviewerIdx: number;
			date: string;
			startMins: number;
			endMins: number;
		}

		const duration = config.slotDurationMinutes;
		const breakMins = config.breakBetweenMinutes;
		const maxPerInterviewer = config.maxInterviewsPerInterviewer;

		// For each applicant, build list of all candidate slots across all interviewers
		const applicantCandidates: CandidateSlot[][] = applicants.map((applicant) => {
			const candidates: CandidateSlot[] = [];

			for (let iIdx = 0; iIdx < interviewers.length; iIdx++) {
				const interviewer = interviewers[iIdx];
				const overlaps = findOverlappingSlots(
					applicant.availability,
					interviewer.availability,
					duration
				);

				for (const overlap of overlaps) {
					let cursor = toMinutes(overlap.start);
					const windowEnd = toMinutes(overlap.end);

					while (cursor + duration <= windowEnd) {
						// Check against existing interviews only (proposed checked at search time)
						const startStr = fromMinutes(cursor);
						const endStr = fromMinutes(cursor + duration);
						const date = overlap.date;

						const existingConflict = hasExistingConflict(
							date,
							cursor,
							cursor + duration + breakMins,
							applicant.email,
							interviewer.email,
							existingInterviews
						);

						if (!existingConflict) {
							candidates.push({
								interviewerIdx: iIdx,
								date,
								startMins: cursor,
								endMins: cursor + duration
							});
						}
						cursor += 15;
					}
				}
			}

			return candidates;
		});

		// Sort applicants by most constrained first (fewest candidates)
		const applicantOrder = applicants
			.map((_, i) => i)
			.sort((a, b) => applicantCandidates[a].length - applicantCandidates[b].length);

		// State for the search
		// Track interviewer load: interviewerIdx → count of proposed interviews
		const interviewerLoad = new Map<number, number>();
		for (let i = 0; i < interviewers.length; i++) {
			interviewerLoad.set(i, existingCount.get(interviewers[i].email) || 0);
		}

		// Track occupied time blocks per person (email → list of {date, startMins, endMins})
		interface TimeBlock {
			date: string;
			startMins: number;
			endMins: number;
		}
		const occupiedBlocks = new Map<string, TimeBlock[]>();

		// Initialize with existing interviews
		for (const iv of existingInterviews) {
			const date = iv.startTime.substring(0, 10);
			const startMins = toMinutes(iv.startTime.substring(11, 16));
			const endMins = toMinutes((iv.endTime || iv.startTime).substring(11, 16));
			const block = { date, startMins, endMins };

			for (const email of [iv.interviewer, iv.applicant]) {
				if (!occupiedBlocks.has(email)) occupiedBlocks.set(email, []);
				occupiedBlocks.get(email)!.push({ ...block });
			}
		}

		function personHasConflict(email: string, date: string, startMins: number, endMins: number): boolean {
			const blocks = occupiedBlocks.get(email);
			if (!blocks) return false;
			const effectiveEnd = endMins + breakMins;
			for (const b of blocks) {
				if (b.date !== date) continue;
				if (startMins < b.endMins + breakMins && effectiveEnd > b.startMins) return true;
			}
			return false;
		}

		function addBlock(email: string, date: string, startMins: number, endMins: number): void {
			if (!occupiedBlocks.has(email)) occupiedBlocks.set(email, []);
			occupiedBlocks.get(email)!.push({ date, startMins, endMins });
		}

		function removeLastBlock(email: string): void {
			occupiedBlocks.get(email)?.pop();
		}

		// Assignment tracking
		interface Assignment {
			applicantIdx: number;
			slot: CandidateSlot;
		}
		let bestAssignments: Assignment[] = [];
		const currentAssignments: Assignment[] = [];
		const startTime = Date.now();
		let timedOut = false;

		function dfs(orderIdx: number): void {
			// Time limit check
			if (Date.now() - startTime > timeLimitMs) {
				timedOut = true;
				return;
			}

			// Pruning: even if we place all remaining applicants, can we beat best?
			const remaining = applicantOrder.length - orderIdx;
			if (currentAssignments.length + remaining <= bestAssignments.length) {
				return;
			}

			// Update best if current is better
			if (currentAssignments.length > bestAssignments.length) {
				bestAssignments = [...currentAssignments];
			}

			// All applicants placed = optimal for this branch
			if (currentAssignments.length === applicants.length) {
				return;
			}

			if (orderIdx >= applicantOrder.length) {
				return;
			}

			const aIdx = applicantOrder[orderIdx];
			const applicant = applicants[aIdx];
			const candidates = applicantCandidates[aIdx];

			// Try placing this applicant in each candidate slot
			for (const slot of candidates) {
				if (timedOut) return;

				const interviewer = interviewers[slot.interviewerIdx];
				const load = interviewerLoad.get(slot.interviewerIdx)!;

				// Check interviewer capacity
				if (maxPerInterviewer > 0 && load >= maxPerInterviewer) continue;

				// Check time conflicts
				if (personHasConflict(applicant.email, slot.date, slot.startMins, slot.endMins)) continue;
				if (personHasConflict(interviewer.email, slot.date, slot.startMins, slot.endMins)) continue;

				// Place the assignment
				currentAssignments.push({ applicantIdx: aIdx, slot });
				interviewerLoad.set(slot.interviewerIdx, load + 1);
				addBlock(applicant.email, slot.date, slot.startMins, slot.endMins);
				addBlock(interviewer.email, slot.date, slot.startMins, slot.endMins);

				dfs(orderIdx + 1);

				// Backtrack
				removeLastBlock(interviewer.email);
				removeLastBlock(applicant.email);
				interviewerLoad.set(slot.interviewerIdx, load);
				currentAssignments.pop();

				if (timedOut) return;

				// If we found a perfect solution, stop
				if (bestAssignments.length === applicants.length) return;
			}

			// Also try skipping this applicant (maybe placing others yields more total)
			dfs(orderIdx + 1);
		}

		dfs(0);

		if (timedOut) {
			warnings.push(
				`Search timed out after ${timeLimitMs}ms. Result may not be globally optimal but is the best found within the time limit.`
			);
		}

		// Convert best assignments to ProposedInterview[]
		const proposed: ProposedInterview[] = bestAssignments.map(({ applicantIdx, slot }) => {
			const applicant = applicants[applicantIdx];
			const interviewer = interviewers[slot.interviewerIdx];
			return {
				startTime: toISO(slot.date, fromMinutes(slot.startMins)),
				endTime: toISO(slot.date, fromMinutes(slot.endMins)),
				applicant: applicant.email,
				interviewer: interviewer.email,
				location: config.location,
				type: config.interviewType,
				jobId: applicant.jobId
			};
		});

		const placedEmails = new Set(bestAssignments.map((a) => applicants[a.applicantIdx].email));
		const unmatched = applicants.filter((a) => !placedEmails.has(a.email)).map((a) => a.email);

		if (unmatched.length > 0) {
			warnings.push(
				`${unmatched.length} applicant(s) could not be scheduled. The algorithm explored all options to minimize this number.`
			);
		}

		return { interviews: proposed, unmatched, warnings };
	}
};

/** Check if a slot conflicts with any existing (already committed) interviews for either person */
function hasExistingConflict(
	date: string,
	startMins: number,
	endMinsWithBreak: number,
	applicantEmail: string,
	interviewerEmail: string,
	existing: { startTime: string; endTime: string; interviewer: string; applicant: string }[]
): boolean {
	for (const iv of existing) {
		const iDate = iv.startTime.substring(0, 10);
		if (iDate !== date) continue;

		const isInvolved = iv.interviewer === interviewerEmail || iv.applicant === applicantEmail;
		if (!isInvolved) continue;

		const iStart = toMinutes(iv.startTime.substring(11, 16));
		const iEnd = toMinutes((iv.endTime || iv.startTime).substring(11, 16));

		if (startMins < iEnd && endMinsWithBreak > iStart) return true;
	}
	return false;
}
