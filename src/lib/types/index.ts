// Legacy single-role enum, kept for backward compatibility with existing
// RLS helpers (`has_org_role`). The single `role` column stays on
// org_members; multi-role membership lives in `roles` (see AppRole below).
export type OrgRole = 'owner' | 'admin' | 'recruiter' | 'viewer';

// V1: app-level fine-grained roles. A user can hold any subset of these
// in `org_members.roles`. 'recruiter' is kept as a legacy alias for
// 'interviewer'.
export type AppRole =
	| 'owner'
	| 'admin'
	| 'eboard'
	| 'advisor'
	| 'interviewer'
	| 'reviewer'
	| 'viewer'
	| 'recruiter';

export interface Organization {
	id: number;
	created_at: string;
	name: string;
	slug: string;
	logo_url: string | null;
	primary_color: string;
	secondary_color: string;
	settings: Record<string, unknown>;
	owner_id: string;
}

export interface OrgMember {
	id: number;
	created_at: string;
	org_id: number;
	user_id: string;
	role: OrgRole;
	roles: AppRole[];
	metadata: Record<string, unknown>;
}

// V1: Per-org subteam (e.g., Infinitum/Astra/Terra/Juvo for Archimedes).
export interface Team {
	id: number;
	created_at: string;
	org_id: number;
	name: string;
	slug: string;
	description: string | null;
	display_order: number;
	active: boolean;
}

export interface JobPosting {
	id: number;
	created_at: string;
	name: string;
	owner: string;
	questions: QuestionSchema;
	scheduled: boolean;
	metadata: Record<string, unknown> | null;
	schedule: Record<string, unknown>;
	active_flg: boolean;
	description: string | null;
	org_id: number | null;
}

export interface Applicant {
	id: number;
	created_at: string;
	name: string;
	email: string;
	metadata: Record<string, unknown> | null;
	recruitInfo: Record<string, string> | null;
	comments: { comments: CommentEntry[] };
	pass_screen: boolean | null;
	accepted_role: boolean | null;
	job: number | null;
	status: 'pending' | 'interview' | 'accepted' | 'denied';
	org_id: number | null;
	// V1: returning-member manual override (soft preference for scheduler)
	prior_team_id: number | null;
	// V1: teams the applicant chose at the start of the form
	selected_team_slugs: string[];
}

// V1: Save-and-resume draft. Created when applicant first enters the form;
// promoted to an Applicant row on submit.
export interface ApplicationDraft {
	id: number;
	created_at: string;
	updated_at: string;
	org_id: number;
	job_id: number;
	email: string;
	data: Record<string, unknown>;
	selected_team_slugs: string[];
	magic_token: string;
	expires_at: string;
	submitted_at: string | null;
}

// V1: Per-team hire/reject/waitlist decision.
export type DecisionOutcome = 'hire' | 'reject' | 'waitlist';

export interface Decision {
	id: number;
	created_at: string;
	org_id: number;
	applicant_id: number;
	team_id: number;
	outcome: DecisionOutcome;
	decided_by: string;
	decided_at: string;
	email_sent_at: string | null;
	notes: string | null;
}

// V1: Reviewer pool assignment per job posting.
export interface JobReviewer {
	id: number;
	created_at: string;
	org_id: number;
	job_id: number;
	user_id: string;
	weight: number;
}

export interface CommentEntry {
	id: number;
	email: string;
	comment: string;
	decision: string;
}

export interface Interviewer {
	id: number;
	created_at: string;
	name: string | null;
	email: string;
	metadata: Record<string, unknown> | null;
	uuid: string | null;
	org_id: number | null;
}

export interface Interview {
	id: number;
	created_at: string;
	start_time: string;
	end_time: string | null;
	location: string;
	type: 'individual' | 'group';
	comments: Record<string, unknown> | null;
	job: number | null;
	applicant: string | null;
	interviewer: string | null;
	org_id: number | null;
	source?: string;
	violations?: { type: string; detail: string }[] | null;
}

// Question engine types
export interface QuestionSchema {
	steps: FormStep[];
}

export interface FormStep {
	title: string;
	icon: string;
	questions: FormQuestion[];
}

// V1: scope a question to all teams ('shared') or a subset by slug.
export type TeamScope = 'shared' | { teams: string[] };

// V1: auto-reject rule. Evaluated server-side on submit.
export type RejectRule =
	| { op: 'truthy' }
	| { op: 'falsy' }
	| { op: 'eq'; value: unknown }
	| { op: 'neq'; value: unknown }
	| { op: 'in'; value: unknown[] }
	| { op: 'not_in'; value: unknown[] }
	| { op: 'lt'; value: number }
	| { op: 'gt'; value: number };

export interface FormQuestion {
	id: string;
	type:
		| 'input'
		| 'input_dual'
		| 'textarea'
		| 'radio'
		| 'checkbox'
		| 'checkbox_image'
		| 'dropdown'
		| 'availability';
	title: string;
	subtitle?: string;
	options?: string[];
	required?: boolean;
	maxLength?: number;
	placeholder?: string;
	// For input_dual
	label1?: string;
	label2?: string;
	// For checkbox_image
	description?: string;
	imageSrc?: string;
	imageAlt?: string;
	linkName?: string;
	linkURL?: string;
	// For availability
	startDate?: string;
	endDate?: string;
	dayStart?: string;
	dayEnd?: string;
	stepMinutes?: number;
	// V1: per-team visibility, auto-reject, blinded-review
	team_scope?: TeamScope;
	reject_if?: RejectRule;
	blinded?: boolean;
}

// Admin panel types
export interface AdminUser {
	id: string;
	email: string;
	created_at: string;
	last_sign_in_at: string | null;
}

export interface PlatformAdmin {
	id: number;
	user_id: string;
	email: string;
	created_at: string;
}

export interface AdminJobPosting {
	id: number;
	created_at: string;
	name: string;
	description: string | null;
	active_flg: boolean;
	org_id: number | null;
	org_name: string | null;
	org_slug: string | null;
	applicant_count: number;
}

export interface UserMembership {
	org_id: number;
	org_name: string;
	org_slug: string;
	role: OrgRole;
}

export interface AdminApplicant {
	id: number;
	created_at: string;
	name: string;
	email: string;
	status: string;
	job: number | null;
	org_id: number | null;
	org_name: string | null;
	org_slug: string | null;
	job_name: string | null;
	recruitInfo: Record<string, string> | null;
}

export interface SchedulingConfigRow {
	id: number;
	created_at: string;
	org_id: number;
	job_id: number | null;
	algorithm_id: string;
	config: Record<string, unknown>;
	last_run_at: string | null;
	last_run_result: Record<string, unknown> | null;
}

export interface InterviewerAvailability {
	id: number;
	created_at: string;
	org_id: number;
	user_id: string;
	email: string;
	date: string;
	start_time: string;
	end_time: string;
	timezone: string;
}

export interface PlatformSettings {
	platform_name?: string;
	default_primary_color?: string;
	default_secondary_color?: string;
	maintenance_mode?: boolean;
	maintenance_message?: string;
}

export interface AdminAnalytics {
	total_orgs: number;
	total_users: number;
	total_applicants: number;
	total_interviews: number;
	total_jobs: number;
	active_jobs: number;
	applicants_by_status: Record<string, number> | null;
	recent_applicants:
		| {
				id: number;
				name: string;
				email: string;
				created_at: string;
				status: string;
				org_name: string | null;
				job_name: string | null;
		  }[]
		| null;
	recent_users: { id: string; email: string; created_at: string }[] | null;
	orgs_by_size:
		| { id: number; name: string; slug: string; primary_color: string; member_count: number }[]
		| null;
	applicants_last_30_days: { day: string; count: number }[] | null;
}
