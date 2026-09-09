import type {
	SchedulingAlgorithm,
	SchedulerInput,
	SchedulerOutput,
	ProposedInterview,
	UnmatchedApplicant,
	BatchRound,
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
	type RoomSlot
} from '../utils';

// ── Attribute matching helpers ────────────────────────────────────────────────

function normalizeAttr(val: string | string[] | undefined): string[] {
	if (!val) return [];
	if (Array.isArray(val)) return val.map((v) => v.toLowerCase().trim()).filter(Boolean);
	// Comma-separated strings from checkbox multi-select
	return val
		.split(',')
		.map((v) => v.toLowerCase().trim())
		.filter(Boolean);
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
		if (
			applicantHasConflict(
				applicant.email,
				slot.date,
				slot.startMins,
				slot.endMins,
				proposed,
				existingInterviews
			)
		)
			continue;

		const available = applicantAvailableAt(
			applicant.availability,
			slot.date,
			slot.startMins,
			slot.endMins
		);
		if (!available && !allowAvailabilityViolation) continue;

		const violations: ScheduleViolation[] = [];
		let score = 100;

		if (!available) {
			score -= availabilityPenalty;
			violations.push({
				type: 'availability',
				detail: 'Applicant unavailable at this time — relaxed placement, please confirm'
			});
		}

		score += slotAttributeScore(applicant, slot, interviewers, attributeRules);

		// Attribute mismatch violation (soft rules only — hard handled below)
		if (attributeRules.length > 0) {
			const attrScore = slotAttributeScore(
				applicant,
				slot,
				interviewers,
				attributeRules.filter((r) => !r.hard)
			);
			if (
				attrScore === 0 &&
				attributeRules.some(
					(r) => !r.hard && normalizeAttr(applicant.attributes?.[r.applicantQuestionId]).length > 0
				)
			) {
				violations.push({
					type: 'attribute_mismatch',
					detail: 'No matching interviewer attribute for applicant preference'
				});
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
		// Rooms may be set per session window instead of globally, so the config is
		// only roomless when NEITHER carries any.
		const anyWindowRooms = (cfg.sessionWindows ?? []).some((w) => (w.rooms?.length ?? 0) > 0);
		if (!cfg.rooms?.length && !anyWindowRooms) {
			return {
				interviews: [],
				unmatched: applicants.map((a) => a.email),
				warnings: ['No rooms configured.']
			};
		}
		if (!cfg.rounds?.length) {
			return {
				interviews: [],
				unmatched: applicants.map((a) => a.email),
				warnings: ['No rounds configured.']
			};
		}
		if (!cfg.sessionWindows?.length) {
			return {
				interviews: [],
				unmatched: applicants.map((a) => a.email),
				warnings: ['No session windows configured.']
			};
		}

		const slotStep = cfg.slotStepMinutes ?? 15;
		const blockBreak = cfg.blockBreakMinutes ?? 5;
		const requireAll = cfg.requireAllRounds ?? false;
		const relaxedFallback = cfg.relaxedFallback ?? false;
		const relaxedPenalty = cfg.relaxedAvailabilityPenalty ?? 10;
		/** Days to concentrate relaxed (availability-overriding) placements on. */
		const relaxedDates: string[] = Array.isArray(cfg.relaxedDates) ? cfg.relaxedDates : [];
		const attributeRules = cfg.attributeMatching?.enabled
			? (cfg.attributeMatching.rules ?? [])
			: [];

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

		// ── Occupancy, shared across every round ───────────────────────────────
		//
		// Rounds used to be laid out independently, so the group and individual
		// passes each believed they had the whole room list to themselves and
		// happily booked MCB 207 for both at 17:00. Interviewers were worse:
		// every generated slot was pre-assigned staff up front, and when nobody
		// was free a round-robin fallback assigned them anyway — putting one
		// person in two rooms at once. Both are now tracked here and consulted
		// before any placement.
		interface Booking {
			date: string;
			startMins: number;
			endMins: number;
		}
		const roomBookings = new Map<string, Booking[]>();
		const ivBookings = new Map<string, Booking[]>();
		/** Slots that have become real sessions — room and staff already held. */
		const openedSlots = new Set<string>();

		const clashes = (list: Booking[] | undefined, date: string, s0: number, e0: number) =>
			(list ?? []).some((b) => b.date === date && s0 < b.endMins && e0 > b.startMins);
		const roomFree = (room: string, date: string, s0: number, e0: number) =>
			!clashes(roomBookings.get(room), date, s0, e0);
		const ivFree = (email: string, date: string, s0: number, e0: number) =>
			!clashes(ivBookings.get(email), date, s0, e0);
		const book = (map: Map<string, Booking[]>, key: string, b: Booking) => {
			const l = map.get(key) ?? [];
			l.push(b);
			map.set(key, l);
		};

		/** Staff who are both free and willing (available) at this time. */
		/**
		 * Sessions each interviewer is already running, so staffing can spread.
		 * Picking in array order meant whoever sorted first absorbed every early
		 * slot — one person ended up on 58 interviews while another had 3.
		 */
		const ivLoad = new Map<string, number>();
		for (const iv of interviewers) ivLoad.set(iv.email, 0);

		function staffFor(slot: RoomSlot, needed: number): string[] {
			const eligible = interviewers.filter((iv) => {
				const willing =
					!iv.availability.length ||
					applicantAvailableAt(iv.availability, slot.date, slot.startMins, slot.endMins);
				return willing && ivFree(iv.email, slot.date, slot.startMins, slot.endMins);
			});
			// Least-loaded first; email as a tiebreak so a run is reproducible.
			eligible.sort((a, b) => {
				const d = (ivLoad.get(a.email) ?? 0) - (ivLoad.get(b.email) ?? 0);
				return d !== 0 ? d : a.email.localeCompare(b.email);
			});
			return eligible.slice(0, needed).map((iv) => iv.email);
		}

		/**
		 * Can this slot take one more applicant? A slot already running is only
		 * capacity-limited; a fresh one must also find a free room and enough
		 * free staff, and opening it holds both.
		 */
		function slotUsable(slot: RoomSlot): boolean {
			if (slot.assignedApplicants.length >= slot.round.groupSize) return false;
			if (openedSlots.has(slot.id)) return true;
			if (!roomFree(slot.room, slot.date, slot.startMins, slot.endMins)) return false;
			return (
				staffFor(slot, slot.round.interviewersPerRoom).length >= slot.round.interviewersPerRoom
			);
		}

		function openSlot(slot: RoomSlot) {
			if (openedSlots.has(slot.id)) return;
			const staff = staffFor(slot, slot.round.interviewersPerRoom);
			slot.assignedInterviewers = staff;
			const b = { date: slot.date, startMins: slot.startMins, endMins: slot.endMins };
			book(roomBookings, slot.room, b);
			for (const e of staff) book(ivBookings, e, b);
			openedSlots.add(slot.id);
			for (const e of staff) ivLoad.set(e, (ivLoad.get(e) ?? 0) + 1);
			if (staff.length < slot.round.interviewersPerRoom) {
				warnings.push(
					`${slot.room} ${slot.date} ${slot.startTime}: wanted ${slot.round.interviewersPerRoom} interviewer(s), found ${staff.length}.`
				);
			}
		}

		function emit(
			applicant: SchedulerInput['applicants'][number],
			slot: RoomSlot,
			violations: ScheduleViolation[]
		) {
			openSlot(slot);
			slot.assignedApplicants.push(applicant.email);
			for (const ivEmail of slot.assignedInterviewers) {
				proposed.push({
					startTime: toISO(slot.date, slot.startTime),
					endTime: toISO(slot.date, slot.endTime),
					applicant: applicant.email,
					interviewer: ivEmail || 'tbd',
					location: slot.room,
					type: slot.round.type,
					jobId: applicant.jobId,
					violations: violations.length > 0 ? violations : undefined
				});
			}
		}

		const slotsByRound = new Map<string, RoomSlot[]>();
		for (const round of cfg.rounds) {
			slotsByRound.set(
				round.id,
				allSlots.filter((s0) => s0.round.id === round.id)
			);
		}

		/** Where an applicant's earlier round finished, so the next can follow it. */
		const lastEnd = new Map<string, { date: string; endMins: number }>();

		function place(
			applicant: SchedulerInput['applicants'][number],
			round: BatchRound,
			roundSlots: RoomSlot[],
			relaxed: boolean,
			nextRound?: BatchRound
		): boolean {
			const prior = lastEnd.get(applicant.email);

			// Chained: this round must follow the previous one on the SAME day,
			// after its break. Sorted by start time so the FIRST usable slot is the
			// tightest gap — that is what puts the group and individual back to
			// back, and it spreads load as a side effect, because a block occupies
			// a contiguous run instead of grabbing the earliest free slot anywhere.
			if (prior) {
				const chained = roundSlots
					.filter(
						(s0) =>
							s0.date === prior.date && s0.startMins >= prior.endMins + round.breakBeforeMinutes
					)
					.sort((a, b) => a.startMins - b.startMins);

				for (const slot of chained) {
					if (!slotUsable(slot)) continue;
					const free = applicantAvailableAt(
						applicant.availability,
						slot.date,
						slot.startMins,
						slot.endMins
					);
					if (!free && !relaxed) continue;
					if (
						applicantHasConflict(
							applicant.email,
							slot.date,
							slot.startMins,
							slot.endMins,
							proposed,
							existingInterviews
						)
					)
						continue;
					emit(
						applicant,
						slot,
						free
							? []
							: [
									{
										type: 'availability',
										detail: 'Applicant unavailable at this time — relaxed placement, please confirm'
									}
								]
					);
					assignedPerRound.get(round.id)!.add(applicant.email);
					if (!free) relaxedPerRound.get(round.id)!.add(applicant.email);
					lastEnd.set(applicant.email, { date: slot.date, endMins: slot.endMins });
					return true;
				}
			}

			// Unchained: first round, or nothing adjacent was left.
			let usable = roundSlots.filter(slotUsable);
			if (usable.length === 0) return false;

			// A relaxed placement overrides what the candidate said they could do,
			// so put those on the day with the most slack rather than scattering
			// them. `relaxedDates` names that day (or days); if none of them can
			// take this person, fall through to the normal search.
			if (relaxed && relaxedDates.length > 0) {
				const preferred = usable.filter((s0) => relaxedDates.includes(s0.date));
				if (preferred.length > 0) usable = preferred;
			}

			// Lookahead: don't commit to a slot the next round cannot follow. Without
			// this the group round grabs whatever is free, and the individual that
			// should sit right after it gets pushed to another day because the rooms
			// and staff behind that moment are already spoken for.
			if (nextRound) {
				const nextSlots = slotsByRound.get(nextRound.id) ?? [];
				const withFollowOn = usable.filter((s0) =>
					nextSlots.some(
						(n) =>
							n.date === s0.date &&
							n.startMins >= s0.endMins + nextRound.breakBeforeMinutes &&
							slotUsable(n) &&
							applicantAvailableAt(applicant.availability, n.date, n.startMins, n.endMins)
					)
				);
				if (withFollowOn.length > 0) usable = withFollowOn;
			}
			const best = pickBestSlot(
				applicant,
				usable,
				round.groupSize,
				interviewers,
				attributeRules,
				proposed,
				existingInterviews,
				relaxed,
				relaxedPenalty
			);
			if (!best) return false;
			emit(applicant, best.slot, best.violations);
			assignedPerRound.get(round.id)!.add(applicant.email);
			if (best.violations.length > 0) relaxedPerRound.get(round.id)!.add(applicant.email);
			lastEnd.set(applicant.email, { date: best.slot.date, endMins: best.slot.endMins });
			return true;
		}

		// ── Fill applicant by applicant, so each person's block stays together ──
		//
		// Round-major ordering placed every group session first and only then went
		// looking for individuals, by which point the adjacent slots were gone and
		// most candidates ended up with their two interviews on different days.
		// Allocating one applicant's whole block before moving on keeps them
		// together.
		const orderedApplicants = [...applicants].sort((a, b) => {
			const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
			if (priorityDiff !== 0) return priorityDiff;
			// Most constrained first: fewest slots they could possibly attend.
			const count = (x: typeof a) =>
				allSlots.filter((s0) =>
					applicantAvailableAt(x.availability, s0.date, s0.startMins, s0.endMins)
				).length;
			return count(a) - count(b);
		});

		for (const applicant of orderedApplicants) {
			for (let r = 0; r < cfg.rounds.length; r++) {
				const round = cfg.rounds[r];
				if (assignedPerRound.get(round.id)?.has(applicant.email)) continue;
				// Stop at the first round that won't fit. Placing later rounds anyway
				// strands them: the relaxed pass would then move the earlier round to
				// a different day and the block would already be split. Leaving the
				// whole block for the relaxed pass keeps it together.
				if (!place(applicant, round, slotsByRound.get(round.id)!, false, cfg.rounds[r + 1])) break;
			}
		}

		// ── Relaxed second pass ────────────────────────────────────────────────
		let relaxedCount = 0;
		if (relaxedFallback) {
			for (const applicant of orderedApplicants) {
				for (let r = 0; r < cfg.rounds.length; r++) {
					const round = cfg.rounds[r];
					if (assignedPerRound.get(round.id)?.has(applicant.email)) continue;
					if (place(applicant, round, slotsByRound.get(round.id)!, true, cfg.rounds[r + 1]))
						relaxedCount++;
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
				slot.assignedApplicants = slot.assignedApplicants.filter((e) => !unmatchedEmails.has(e));
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
						if (
							!applicantAvailableAt(applicant.availability, slot.date, slot.startMins, slot.endMins)
						)
							continue;
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
