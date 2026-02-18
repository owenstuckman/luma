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
	unmatched: string[];
	warnings: string[];
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
