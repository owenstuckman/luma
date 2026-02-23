import type {
	SchedulingAlgorithm,
	SchedulerInput,
	SchedulerOutput,
	ProposedInterview,
	UnmatchedApplicant,
	BatchSchedulerConfig,
	BatchRoundStat,
	SuggestedSlot,
	ScheduleViolation,
	AttributeMatchRule
} from '../types';
import {
	toISO,
	generateRoomSlots,
	applicantAvailableAt,
	applicantHasConflict,
	interviewerFreeAt,
	type RoomSlot
} from '../utils';

// ── Attribute matching helpers ────────────────────────────────────────────────

function normalizeAttr(val: string | string[] | undefined): string[] {
	if (!val) return [];
	if (Array.isArray(val)) return val.map((v) => v.toLowerCase().trim()).filter(Boolean);
	// Comma-separated strings from checkbox multi-select
	return val.split(',').map((v) => v.toLowerCase().trim()).filter(Boolean);
}

function slotAttributeScore(
	applicant: SchedulerInput['applicants'][number],
	slot: RoomSlot,
	interviewers: SchedulerInput['interviewers'],
	rules: AttributeMatchRule[]
): number {
	let score = 0;
	for (const rule of rules) {
		const applicantVals = normalizeAttr(applicant.attributes?.[rule.applicantQuestionId]);
		if (applicantVals.length === 0) continue;

		for (const ivEmail of slot.assignedInterviewers) {
			const iv = interviewers.find((i) => i.email === ivEmail);
			if (!iv) continue;
			const ivVals = normalizeAttr(iv.attributes?.[rule.interviewerAttributeKey]);
			if (applicantVals.some((v) => ivVals.includes(v))) {
				score += rule.weight;
			}
		}
	}
	return score;
}

/**
 * Returns true if there are hard attribute rules and at least one slot in
 * `candidates` satisfies them for this applicant.
 */
function hasHardRuleMatch(
	applicant: SchedulerInput['applicants'][number],
	candidates: RoomSlot[],
	interviewers: SchedulerInput['interviewers'],
	rules: AttributeMatchRule[]
): boolean {
	const hardRules = rules.filter((r) => r.hard);
	if (hardRules.length === 0) return false; // no hard rules → no constraint

	return candidates.some((slot) => {
		for (const rule of hardRules) {
			const applicantVals = normalizeAttr(applicant.attributes?.[rule.applicantQuestionId]);
			if (applicantVals.length === 0) continue;
			for (const ivEmail of slot.assignedInterviewers) {
				const iv = interviewers.find((i) => i.email === ivEmail);
				if (!iv) continue;
				const ivVals = normalizeAttr(iv.attributes?.[rule.interviewerAttributeKey]);
				if (applicantVals.some((v) => ivVals.includes(v))) return true;
			}
		}
		return false;
	});
}

// ── Slot picker ───────────────────────────────────────────────────────────────

interface SlotCandidate {
	slot: RoomSlot;
	score: number;
	violations: ScheduleViolation[];
}

/**
 * Pick the best slot for an applicant from a set of candidates.
 * Returns null if no slot is available (all full or conflicting).
 * When allowAvailabilityViolation is true, slots outside stated availability
 * are considered with a penalty applied to score.
 */
function pickBestSlot(
	applicant: SchedulerInput['applicants'][number],
	roundSlots: RoomSlot[],
	groupSize: number,
	interviewers: SchedulerInput['interviewers'],
	attributeRules: AttributeMatchRule[],
	proposed: ProposedInterview[],
	existingInterviews: SchedulerInput['existingInterviews'],
	allowAvailabilityViolation: boolean,
	availabilityPenalty: number
): SlotCandidate | null {
	const hardRules = attributeRules.filter((r) => r.hard);

	// Collect all non-full, non-conflicting candidates
	let candidates: SlotCandidate[] = [];

	for (const slot of roundSlots) {
		if (slot.assignedApplicants.length >= groupSize) continue;
		if (applicantHasConflict(applicant.email, slot.date, slot.startMins, slot.endMins, proposed, existingInterviews)) continue;

		const available = applicantAvailableAt(applicant.availability, slot.date, slot.startMins, slot.endMins);
		if (!available && !allowAvailabilityViolation) continue;

		const violations: ScheduleViolation[] = [];
		let score = 100;

		if (!available) {
			score -= availabilityPenalty;
			violations.push({ type: 'availability', detail: 'Applicant unavailable at this time — relaxed placement, please confirm' });
		}

		score += slotAttributeScore(applicant, slot, interviewers, attributeRules);

		// Attribute mismatch violation (soft rules only — hard handled below)
		if (attributeRules.length > 0) {
			const attrScore = slotAttributeScore(applicant, slot, interviewers, attributeRules.filter((r) => !r.hard));
			if (attrScore === 0 && attributeRules.some((r) => !r.hard && normalizeAttr(applicant.attributes?.[r.applicantQuestionId]).length > 0)) {
				violations.push({ type: 'attribute_mismatch', detail: 'No matching interviewer attribute for applicant preference' });
			}
		}

		candidates.push({ slot, score, violations });
	}

	if (candidates.length === 0) return null;

	// Hard rule enforcement: if hard-rule-matching candidates exist, restrict to those
	if (hardRules.length > 0) {
		const hardMatches = candidates.filter((c) => {
			return hardRules.every((rule) => {
				const applicantVals = normalizeAttr(applicant.attributes?.[rule.applicantQuestionId]);
				if (applicantVals.length === 0) return true; // no preference stated, no constraint
				return c.slot.assignedInterviewers.some((ivEmail) => {
					const iv = interviewers.find((i) => i.email === ivEmail);
					if (!iv) return false;
					const ivVals = normalizeAttr(iv.attributes?.[rule.interviewerAttributeKey]);
					return applicantVals.some((v) => ivVals.includes(v));
				});
			});
		});
		if (hardMatches.length > 0) candidates = hardMatches;
	}

	// Return highest-scoring candidate
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0];
}

// ── Algorithm ─────────────────────────────────────────────────────────────────

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
		},
		{
			key: 'relaxedFallback',
			label: 'Relaxed fallback (schedule unmatched applicants with flagged violations)',
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
		const relaxedFallback = cfg.relaxedFallback ?? false;
		const relaxedPenalty = cfg.relaxedAvailabilityPenalty ?? 10;
		const attributeRules = cfg.attributeMatching?.enabled ? (cfg.attributeMatching.rules ?? []) : [];

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
		// Track which placements were relaxed (for per-round stats)
		const relaxedPerRound = new Map<string, Set<string>>(); // roundId → Set<email>
		for (const round of cfg.rounds) {
			assignedPerRound.set(round.id, new Set());
			relaxedPerRound.set(round.id, new Set());
		}

		// ── Assign interviewers to slots ───────────────────────────────────────
		for (const slot of allSlots) {
			const needed = slot.round.interviewersPerRoom;
			const available = interviewers.filter((iv) => {
				if (!iv.availability.length) return true;
				return applicantAvailableAt(iv.availability, slot.date, slot.startMins, slot.endMins);
			});

			const picked: string[] = [];
			for (const iv of available) {
				if (picked.length >= needed) break;
				if (interviewerFreeAt(iv.email, slot.date, slot.startMins, slot.endMins, allSlots)) {
					picked.push(iv.email);
				}
			}

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

		// ── Fill slots with applicants (strict pass) ───────────────────────────
		for (const round of cfg.rounds) {
			const roundSlots = allSlots.filter((s) => s.round.id === round.id);

			// Sort applicants: high priority first, then most-constrained first
			const sortedApplicants = [...applicants].sort((a, b) => {
				const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
				if (priorityDiff !== 0) return priorityDiff;
				const aCount = roundSlots.filter((s) =>
					applicantAvailableAt(a.availability, s.date, s.startMins, s.endMins)
				).length;
				const bCount = roundSlots.filter((s) =>
					applicantAvailableAt(b.availability, s.date, s.startMins, s.endMins)
				).length;
				return aCount - bCount;
			});

			for (const applicant of sortedApplicants) {
				if (assignedPerRound.get(round.id)?.has(applicant.email)) continue;

				const best = pickBestSlot(
					applicant,
					roundSlots,
					round.groupSize,
					interviewers,
					attributeRules,
					proposed,
					existingInterviews,
					false, // strict: no availability violations
					0
				);

				if (!best) continue;

				best.slot.assignedApplicants.push(applicant.email);
				assignedPerRound.get(round.id)!.add(applicant.email);

				for (const ivEmail of best.slot.assignedInterviewers) {
					proposed.push({
						startTime: toISO(best.slot.date, best.slot.startTime),
						endTime: toISO(best.slot.date, best.slot.endTime),
						applicant: applicant.email,
						interviewer: ivEmail || 'tbd',
						location: best.slot.room,
						type: round.type,
						jobId: applicant.jobId,
						violations: best.violations.length > 0 ? best.violations : undefined
					});
				}
			}
		}

		// ── Relaxed second pass ────────────────────────────────────────────────
		let relaxedCount = 0;

		if (relaxedFallback) {
			for (const round of cfg.rounds) {
				const roundSlots = allSlots.filter((s) => s.round.id === round.id);

				// Only process applicants not yet assigned in this round
				const unassigned = applicants.filter(
					(a) => !assignedPerRound.get(round.id)?.has(a.email)
				);

				// Keep priority + constrained ordering for the relaxed pass
				const sorted = [...unassigned].sort((a, b) => {
					const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
					if (priorityDiff !== 0) return priorityDiff;
					// In relaxed pass, sort by fewest non-full slots (most constrained first)
					const aCount = roundSlots.filter((s) => s.assignedApplicants.length < round.groupSize).length;
					const bCount = roundSlots.filter((s) => s.assignedApplicants.length < round.groupSize).length;
					return aCount - bCount;
				});

				for (const applicant of sorted) {
					if (assignedPerRound.get(round.id)?.has(applicant.email)) continue;

					const best = pickBestSlot(
						applicant,
						roundSlots,
						round.groupSize,
						interviewers,
						attributeRules,
						proposed,
						existingInterviews,
						true, // relaxed: allow availability violations
						relaxedPenalty
					);

					if (!best) continue;

					best.slot.assignedApplicants.push(applicant.email);
					assignedPerRound.get(round.id)!.add(applicant.email);
					relaxedPerRound.get(round.id)!.add(applicant.email);
					relaxedCount++;

					for (const ivEmail of best.slot.assignedInterviewers) {
						proposed.push({
							startTime: toISO(best.slot.date, best.slot.startTime),
							endTime: toISO(best.slot.date, best.slot.endTime),
							applicant: applicant.email,
							interviewer: ivEmail || 'tbd',
							location: best.slot.room,
							type: round.type,
							jobId: applicant.jobId,
							violations: best.violations.length > 0 ? best.violations : undefined
						});
					}
				}
			}
		}

		// ── Apply requireAllRounds ─────────────────────────────────────────────
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
			finalProposed = proposed.filter((p) => !unmatchedEmails.has(p.applicant));
			for (const slot of allSlots) {
				slot.assignedApplicants = slot.assignedApplicants.filter(
					(e) => !unmatchedEmails.has(e)
				);
			}
			for (const round of cfg.rounds) {
				const set = assignedPerRound.get(round.id);
				const rset = relaxedPerRound.get(round.id);
				if (set) unmatchedEmails.forEach((email) => set.delete(email));
				if (rset) unmatchedEmails.forEach((email) => rset.delete(email));
			}
			// Recalculate relaxedCount after removals
			relaxedCount = [...relaxedPerRound.values()].reduce((sum, s) => sum + s.size, 0);
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
		if (relaxedCount > 0) {
			warnings.push(
				`${relaxedCount} interview(s) were placed via relaxed constraints and are flagged for review.`
			);
		}

		// ── Build stats per round ──────────────────────────────────────────────
		const stats: BatchRoundStat[] = cfg.rounds.map((round) => {
			const roundSlots = allSlots.filter((s) => s.round.id === round.id);
			const scheduled = assignedPerRound.get(round.id)?.size ?? 0;
			const total = applicants.length;
			const filledSlots = roundSlots.filter((s) => s.assignedApplicants.length > 0).length;
			const roundRelaxed = relaxedPerRound.get(round.id)?.size ?? 0;

			return {
				roundId: round.id,
				roundLabel: round.label,
				scheduled,
				missed: total - scheduled,
				totalSlots: roundSlots.length,
				filledSlots,
				relaxedCount: roundRelaxed
			};
		});

		return {
			interviews: finalProposed,
			unmatched: unmatchedDetails.map((u) => u.email),
			warnings,
			unmatchedDetails,
			stats,
			relaxedCount
		};
	}
};
