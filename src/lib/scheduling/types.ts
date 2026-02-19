export interface SchedulerInput {
	applicants: {
		email: string;
		name: string;
		jobId: number;
		availability: TimeRange[];
	}[];
	interviewers: {
		email: string;
		availability: TimeRange[];
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
}

export interface ProposedInterview {
	startTime: string;
	endTime: string;
	applicant: string;
	interviewer: string;
	location: string;
	type: 'individual' | 'group';
	jobId: number;
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
	interviewersPerRoom: number; // interviewers assigned per slot
}

export interface BatchSessionWindow {
	date: string; // YYYY-MM-DD
	startTime: string; // HH:mm
	endTime: string; // HH:mm
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
}
