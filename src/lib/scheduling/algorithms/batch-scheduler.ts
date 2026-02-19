import type {
	SchedulingAlgorithm,
	SchedulerInput,
	SchedulerOutput,
	ProposedInterview,
	UnmatchedApplicant,
	BatchSchedulerConfig,
	BatchRoundStat,
	SuggestedSlot
} from '../types';
import {
	toISO,
	generateRoomSlots,
	applicantAvailableAt,
	applicantHasConflict,
	interviewerFreeAt,
	type RoomSlot
} from '../utils';

export const batchScheduler: SchedulingAlgorithm = {
	id: 'batch-scheduler',
	name: 'Batch Scheduler',
	description:
		'Schedules large cohorts through multiple rounds (individual and/or group) across many rooms in parallel. Applicants are matched to slots based on their availability. Unmatched applicants receive suggested alternate slots for manual placement.',
	configSchema: [
		{
			key: 'rooms',
			label: 'Room list (one per line)',
			type: 'string',
			default: 'MCB230\nMCB231\nMCB232'
		},
		{
			key: 'slotStepMinutes',
			label: 'Minutes between slot start times',
			type: 'number',
			default: 15
		},
		{
			key: 'blockBreakMinutes',
			label: 'Break between consecutive slots (minutes)',
			type: 'number',
			default: 5
		},
		{
			key: 'requireAllRounds',
			label: 'Require all rounds',
			type: 'boolean',
			default: false
		}
	],

	run(input: SchedulerInput): SchedulerOutput {
		const cfg = input.config as unknown as BatchSchedulerConfig;
		const { applicants, interviewers, existingInterviews } = input;

		// ── Validate config ────────────────────────────────────────────────────
		if (!cfg.rooms?.length) {
			return { interviews: [], unmatched: applicants.map((a) => a.email), warnings: ['No rooms configured.'] };
		}
		if (!cfg.rounds?.length) {
			return { interviews: [], unmatched: applicants.map((a) => a.email), warnings: ['No rounds configured.'] };
		}
		if (!cfg.sessionWindows?.length) {
			return { interviews: [], unmatched: applicants.map((a) => a.email), warnings: ['No session windows configured.'] };
		}

		const slotStep = cfg.slotStepMinutes ?? 15;
		const blockBreak = cfg.blockBreakMinutes ?? 5;
		const requireAll = cfg.requireAllRounds ?? false;

		// ── Generate all slots ─────────────────────────────────────────────────
		const allSlots = generateRoomSlots(
			cfg.rooms,
			cfg.rounds,
			cfg.sessionWindows,
			slotStep,
			blockBreak
		);

		const warnings: string[] = [];
		const proposed: ProposedInterview[] = [];

		// Track which applicants were assigned per round
		const assignedPerRound = new Map<string, Set<string>>(); // roundId → Set<email>
		for (const round of cfg.rounds) {
			assignedPerRound.set(round.id, new Set());
		}

		// ── Assign interviewers to slots ───────────────────────────────────────
		for (const slot of allSlots) {
			const needed = slot.round.interviewersPerRoom;
			const available = interviewers.filter((iv) => {
				// If interviewer has no availability data, treat as always available
				if (!iv.availability.length) return true;
				return applicantAvailableAt(iv.availability, slot.date, slot.startMins, slot.endMins);
			});

			// Pick interviewers who aren't already committed to another slot at this time
			const picked: string[] = [];
			for (const iv of available) {
				if (picked.length >= needed) break;
				if (interviewerFreeAt(iv.email, slot.date, slot.startMins, slot.endMins, allSlots)) {
					picked.push(iv.email);
				}
			}

			// If not enough interviewers, fall back to round-robin from the full list
			if (picked.length < needed && interviewers.length > 0) {
				const slotIndex = allSlots.indexOf(slot);
				for (let i = picked.length; i < needed; i++) {
					const iv = interviewers[(slotIndex + i) % interviewers.length];
					if (!picked.includes(iv.email)) picked.push(iv.email);
				}
			}

			slot.assignedInterviewers = picked;

			if (picked.length < needed) {
				warnings.push(
					`Slot ${slot.id}: needed ${needed} interviewer(s), only ${picked.length} available.`
				);
			}
		}

		// ── Fill slots with applicants ─────────────────────────────────────────
		// Process each round independently
		for (const round of cfg.rounds) {
			const roundSlots = allSlots.filter((s) => s.round.id === round.id);

			// Sort applicants by how many slots they're available for (most constrained first)
			const sortedApplicants = [...applicants].sort((a, b) => {
				const aCount = roundSlots.filter((s) =>
					applicantAvailableAt(a.availability, s.date, s.startMins, s.endMins)
				).length;
				const bCount = roundSlots.filter((s) =>
					applicantAvailableAt(b.availability, s.date, s.startMins, s.endMins)
				).length;
				return aCount - bCount; // fewest options first
			});

			for (const applicant of sortedApplicants) {
				// Skip if already assigned to this round
				if (assignedPerRound.get(round.id)?.has(applicant.email)) continue;

				// Find a slot with capacity where the applicant is available and has no conflicts
				let placed = false;
				for (const slot of roundSlots) {
					if (slot.assignedApplicants.length >= round.groupSize) continue;
					if (!applicantAvailableAt(applicant.availability, slot.date, slot.startMins, slot.endMins)) continue;
					if (applicantHasConflict(applicant.email, slot.date, slot.startMins, slot.endMins, proposed, existingInterviews)) continue;

					// Assign applicant to this slot
					slot.assignedApplicants.push(applicant.email);
					assignedPerRound.get(round.id)!.add(applicant.email);

					// Create one interview row per assigned interviewer (matches DB model)
					for (const ivEmail of slot.assignedInterviewers) {
						proposed.push({
							startTime: toISO(slot.date, slot.startTime),
							endTime: toISO(slot.date, slot.endTime),
							applicant: applicant.email,
							interviewer: ivEmail || 'tbd',
							location: slot.room,
							type: round.type,
							jobId: applicant.jobId
						});
					}

					placed = true;
					break;
				}

				if (!placed) {
					// Will be handled in the unmatched pass below
				}
			}
		}

		// ── Apply requireAllRounds ─────────────────────────────────────────────
		// Find applicants who are missing one or more rounds
		const unmatchedEmails = new Set<string>();
		for (const applicant of applicants) {
			for (const round of cfg.rounds) {
				if (!assignedPerRound.get(round.id)?.has(applicant.email)) {
					unmatchedEmails.add(applicant.email);
					break;
				}
			}
		}

		let finalProposed = proposed;
		if (requireAll && unmatchedEmails.size > 0) {
			// Remove all assignments for applicants who missed any round
			finalProposed = proposed.filter((p) => !unmatchedEmails.has(p.applicant));
			// Also remove them from slot tracking (they may now free up space)
			for (const slot of allSlots) {
				slot.assignedApplicants = slot.assignedApplicants.filter(
					(e) => !unmatchedEmails.has(e)
				);
			}
			// Clear their round assignments so stats reflect reality
			for (const round of cfg.rounds) {
				const set = assignedPerRound.get(round.id);
				if (set) {
					unmatchedEmails.forEach((email) => set.delete(email));
				}
			}
		}

		// ── Build unmatched details ────────────────────────────────────────────
		const unmatchedDetails: UnmatchedApplicant[] = [];

		for (const applicant of applicants) {
			const missedRounds: string[] = [];
			const suggestedSlots: SuggestedSlot[] = [];

			for (const round of cfg.rounds) {
				const isAssigned = !unmatchedEmails.has(applicant.email)
					? assignedPerRound.get(round.id)?.has(applicant.email)
					: false;

				if (!isAssigned) {
					missedRounds.push(round.id);

					// Find slots this applicant could attend (for manual placement)
					const roundSlots = allSlots.filter((s) => s.round.id === round.id);
					for (const slot of roundSlots) {
						if (!applicantAvailableAt(applicant.availability, slot.date, slot.startMins, slot.endMins)) continue;
						suggestedSlots.push({
							roundId: round.id,
							date: slot.date,
							startTime: slot.startTime,
							endTime: slot.endTime,
							room: slot.room,
							isFull: slot.assignedApplicants.length >= round.groupSize
						});
					}
				}
			}

			if (missedRounds.length > 0) {
				unmatchedDetails.push({
					email: applicant.email,
					name: applicant.name,
					missedRounds,
					suggestedSlots
				});
			}
		}

		if (unmatchedDetails.length > 0) {
			warnings.push(
				`${unmatchedDetails.length} applicant(s) could not be fully scheduled. See unmatchedDetails for suggested alternate slots.`
			);
		}

		// ── Build stats per round ──────────────────────────────────────────────
		const stats: BatchRoundStat[] = cfg.rounds.map((round) => {
			const roundSlots = allSlots.filter((s) => s.round.id === round.id);
			const scheduled = assignedPerRound.get(round.id)?.size ?? 0;
			const total = applicants.length;
			const filledSlots = roundSlots.filter((s) => s.assignedApplicants.length > 0).length;

			return {
				roundId: round.id,
				roundLabel: round.label,
				scheduled,
				missed: total - scheduled,
				totalSlots: roundSlots.length,
				filledSlots
			};
		});

		return {
			interviews: finalProposed,
			unmatched: unmatchedDetails.map((u) => u.email),
			warnings,
			unmatchedDetails,
			stats
		};
	}
};
