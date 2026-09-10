export interface SchedulerInput {
	applicants: {
		email: string;
		name: string;
		jobId: number;
		availability: TimeRange[];
		attributes?: Record<string, string | string[]>; // from recruitInfo, keyed by question id
		priority?: number; // 0 = normal, 1 = high priority
	}[];
	interviewers: {
		email: string;
		availability: TimeRange[];
		attributes?: Record<string, string | string[]>; // from org_members.metadata
	}[];
	existingInterviews: {
		startTime: string;
		endTime: string;
		interviewer: string;
		applicant: string;
	}[];
	config: SchedulerConfig;
}

export interface SchedulerConfig {
	slotDurationMinutes: number;
	breakBetweenMinutes: number;
	maxInterviewsPerInterviewer: number;
	interviewType: 'individual' | 'group';
	groupSize?: number;
	location: string;
	[key: string]: unknown;
}

export interface SchedulerOutput {
	interviews: ProposedInterview[];
	unmatched: string[]; // email list (backward compat)
	warnings: string[];
	unmatchedDetails?: UnmatchedApplicant[]; // richer output for batch scheduler
	stats?: BatchRoundStat[];
	relaxedCount?: number; // how many were placed via relaxed constraint pass
}

export type ScheduleViolationType = 'availability' | 'attribute_mismatch';

export interface ScheduleViolation {
	type: ScheduleViolationType;
	detail: string;
}

export interface ProposedInterview {
	startTime: string;
	endTime: string;
	applicant: string;
	interviewer: string;
	location: string;
	type: 'individual' | 'group';
	jobId: number;
	violations?: ScheduleViolation[]; // only present on relaxed placements
}

export interface TimeRange {
	date: string; // YYYY-MM-DD
	start: string; // HH:mm
	end: string; // HH:mm
}

export interface SchedulingAlgorithm {
	id: string;
	name: string;
	description: string;
	configSchema: ConfigField[];
	run: (input: SchedulerInput) => SchedulerOutput;
}

export interface ConfigField {
	key: string;
	label: string;
	type: 'number' | 'string' | 'boolean' | 'select';
	default: unknown;
	options?: { label: string; value: unknown }[];
}

// ── Batch Scheduler ──────────────────────────────────────────────────────────

export interface BatchRound {
	id: string;
	label: string;
	type: 'individual' | 'group';
	durationMinutes: number;
	breakBeforeMinutes: number; // gap before this round starts (within a block)
	groupSize: number; // applicants per slot (1 for individual)
	/**
	 * Fewest applicants a session may run with. A group interview assesses how
	 * people behave in a group, so a "group" of one measures nothing — but the
	 * scheduler will happily leave a straggler alone in a room unless told not
	 * to. Omitted or 1 means no floor.
	 */
	minGroupSize?: number;
	interviewersPerRoom: number; // interviewers assigned per slot
}

export interface BatchSessionWindow {
	date: string; // YYYY-MM-DD
	startTime: string; // HH:mm
	endTime: string; // HH:mm
	/**
	 * Rooms booked for THIS window only. Real bookings are per-day — a room is
	 * reserved Friday but not Wednesday, and two rooms on the same evening can
	 * start half an hour apart — so a single list shared across every window
	 * would schedule interviews into rooms nobody reserved.
	 *
	 * Empty or omitted falls back to the config-level `rooms`, which keeps every
	 * schedule built before per-window rooms existed working unchanged.
	 */
	rooms?: string[];
}

export interface AttributeMatchRule {
	applicantQuestionId: string; // question id in job_posting.questions (key in recruitInfo)
	interviewerAttributeKey: string; // key in org_members.metadata
	weight: number; // score bonus for a match
	hard: boolean; // if true, prefer only matching interviewers (falls back if none)
}

/**
 * Config for the batch scheduler. Stored in scheduling_config.config JSON.
 * Compatible with SchedulerConfig via the index signature.
 */
export interface BatchSchedulerConfig {
	rooms: string[];
	rounds: BatchRound[];
	sessionWindows: BatchSessionWindow[];
	slotStepMinutes: number; // how often slots start (e.g. every 15 min)
	blockBreakMinutes: number; // gap between sequential slots in the same room
	requireAllRounds: boolean; // if true, unmatched in any round = remove all assignments
	relaxedFallback?: boolean; // if true, run a second pass for unmatched applicants with soft constraints
	relaxedAvailabilityPenalty?: number; // score penalty per availability violation (default 10)
	/**
	 * Days to concentrate relaxed placements on. A relaxed placement overrides
	 * what the candidate said they were free for, so it is better to gather them
	 * on one day with spare capacity — easier to sanity-check, and easier to ask
	 * that group "can you make this?" — than to scatter them across the week.
	 */
	relaxedDates?: string[];
	attributeMatching?: {
		enabled: boolean;
		rules: AttributeMatchRule[];
	};
	// SchedulerConfig compat fields (unused by batch but satisfies the type):
	slotDurationMinutes: number;
	breakBetweenMinutes: number;
	maxInterviewsPerInterviewer: number;
	interviewType: 'individual' | 'group';
	location: string;
	[key: string]: unknown;
}

export interface UnmatchedApplicant {
	email: string;
	name: string;
	missedRounds: string[]; // round IDs the applicant couldn't be placed in
	suggestedSlots: SuggestedSlot[];
}

export interface SuggestedSlot {
	roundId: string;
	date: string;
	startTime: string;
	endTime: string;
	room: string;
	isFull: boolean; // true = slot exists but was at capacity; recruiter must manually override
}

export interface BatchRoundStat {
	roundId: string;
	roundLabel: string;
	scheduled: number;
	missed: number;
	totalSlots: number;
	filledSlots: number;
	relaxedCount: number; // how many in this round were placed via relaxed pass
}
