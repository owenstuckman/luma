export type OrgRole = 'owner' | 'admin' | 'recruiter' | 'viewer';

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
	startTime: string;
	endTime: string | null;
	location: string;
	type: 'individual' | 'group';
	comments: Record<string, unknown> | null;
	job: number | null;
	applicant: string | null;
	interviewer: string | null;
	org_id: number | null;
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

export interface FormQuestion {
	id: string;
	type: 'input' | 'input_dual' | 'textarea' | 'radio' | 'checkbox' | 'checkbox_image' | 'dropdown' | 'availability';
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
	recent_applicants: { id: number; name: string; email: string; created_at: string; status: string; org_name: string | null; job_name: string | null }[] | null;
	recent_users: { id: string; email: string; created_at: string }[] | null;
	orgs_by_size: { id: number; name: string; slug: string; primary_color: string; member_count: number }[] | null;
	applicants_last_30_days: { day: string; count: number }[] | null;
}
