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

// V1: A shareable invite link. `email` null means an open link anyone holding
// the token can redeem (up to `max_uses`); non-null binds it to one address.
export interface OrgInvite {
	id: number;
	created_at: string;
	token: string;
	email: string | null;
	role: OrgRole;
	roles: AppRole[];
	expires_at: string;
	max_uses: number;
	used_count: number;
	revoked_at: string | null;
	created_by_email: string | null;
}

// One row per successful invite redemption (migration 00023). `email` is the
// account's current address when it still exists, otherwise the one recorded at
// redemption time. `is_member` is false if they were removed from the org after.
export interface InviteRedemption {
	id: number;
	invite_id: number;
	user_id: string | null;
	email: string | null;
	redeemed_at: string;
	is_member: boolean;
}

// What the /invite/[token] landing page can learn before the visitor signs in.
export interface InviteDetails {
	valid: boolean;
	reason?: 'not_found' | 'revoked' | 'expired' | 'used_up';
	org_name?: string;
	org_slug?: string;
	logo_url?: string | null;
	role?: OrgRole;
	requires_email?: boolean;
	expires_at?: string;
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
	// V1: teams the applicant chose at the start of the form.
	//
	// Since migration 00024 an application is per-team, so this holds exactly
	// one slug and mirrors `team_id`. It is kept (rather than dropped) because
	// pre-00024 rows legitimately carry several slugs, and because the public
	// form can still write it on orgs that have no `teams` configured.
	selected_team_slugs: string[];
	// V1: the single team this application is for. Null only for orgs that
	// define no teams, or for pre-00024 rows that were never backfilled.
	team_id: number | null;
	// V1: groups the sibling rows created by one submit. Two rows sharing this
	// are the same person applying to two teams in one sitting. Deliberately
	// NOT surfaced as "applied to Astra + Terra" anywhere in the reviewer UI —
	// each application is judged on its own — but it makes the split auditable
	// and lets a resubmit be detected instead of silently duplicating.
	submission_group: string | null;
	// V1: where this team sat in the applicant's ranking — 1 is their first
	// choice. Null when the job doesn't ask them to rank (the default) or for
	// rows created before ranking existed. Advisory only: it never changes how
	// an application is reviewed, it just tells the team whether they were the
	// applicant's first pick.
	team_rank: number | null;
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
	/** The applicant's EMAIL, not an id. Kept for the scheduler, .ics and email log. */
	applicant: string | null;
	/**
	 * V1 (migration 00025): FK to the specific application this interview is for.
	 * One email can now own several applications (one per team), so joining on
	 * `applicant` alone would attribute every sibling's interviews to all of
	 * them. Prefer this; fall back to the email only when it is null (legacy
	 * rows whose mapping was ambiguous).
	 *
	 * Optional, not just nullable: most interview selects list explicit columns
	 * and don't ask for this one, so a fetched row legitimately has the key
	 * ABSENT rather than null — as do the synthetic interviews the scheduling
	 * algorithms build to preview a proposed schedule, which aren't DB rows at
	 * all. Readers must treat undefined and null alike and fall back to the
	 * email join, which `candidates.ts` does.
	 */
	applicant_id?: number | null;
	interviewer: string | null;
	org_id: number | null;
	source?: string;
	violations?: { type: string; detail: string }[] | null;
}

// Question engine types
export interface QuestionSchema {
	steps: FormStep[];
	/** How many teams an applicant may pick, and whether they rank them. */
	team_selection?: TeamSelectionConfig;
}

/**
 * Per-job rules for the team picker.
 *
 * Absent means the historical behaviour: pick any number of teams, unranked.
 * Archimedes' 2026 cycle sets `{ max: 2, ranked: true }` — top two choices, in
 * order of preference.
 */
export interface TeamSelectionConfig {
	/** Fewest teams the applicant must pick. Defaults to 1. */
	min?: number;
	/** Most they may pick. Omitted or 0 means unlimited. */
	max?: number;
	/**
	 * When true the ORDER of selection is meaningful and is stored on each
	 * application as `team_rank` (1 = first choice). The applicant can reorder
	 * before submitting.
	 */
	ranked?: boolean;
}

export interface FormStep {
	title: string;
	icon: string;
	questions: FormQuestion[];
}

// V1: scope a question to all teams ('shared') or a subset by slug.
//
// `{ per_team: true }` is the third mode: the question is asked ONCE PER TEAM
// the applicant selected, rather than once overall. It exists so an org can
// write "Why are you interested in {team}?" a single time and have every
// applicant answer it separately for each team they apply to. The form expands
// it into one question per selected team (see expandStep in formSchema.ts);
// `{team}` in the title/subtitle is replaced with that team's name.
export type TeamScope = 'shared' | { teams: string[] } | { per_team: true };

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
	/**
	 * Word cap for free-text answers. Enforced in the form (the applicant sees a
	 * live counter and cannot advance while over) rather than by truncating, so
	 * nobody's essay is silently cut in half. `maxLength` still guards the raw
	 * character length as a backstop against pasted novels.
	 */
	maxWords?: number;
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

	// Set by expandSteps() on the copies it makes of a `{ per_team: true }`
	// question — never authored by hand, never stored in job_posting.questions.
	// `id` on a copy is unique per team so the form can key its inputs, while
	// `base_id` is what the answer is finally stored under on the per-team
	// application row. Carrying the origin explicitly beats parsing it back out
	// of the id, which breaks the moment an author uses '__' in their own id.
	base_id?: string;
	per_team_slug?: string;
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
