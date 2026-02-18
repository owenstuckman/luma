import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Organization, OrgMember, JobPosting, Applicant, Interview, AdminUser, PlatformAdmin, AdminJobPosting, UserMembership, AdminApplicant, PlatformSettings, AdminAnalytics, SchedulingConfigRow, InterviewerAvailability } from '$lib/types';

const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// ============================================
// Organization functions
// ============================================

export const getOrgBySlug = async (slug: string): Promise<Organization | null> => {
	const { data, error } = await supabase
		.from('organizations')
		.select('*')
		.eq('slug', slug)
		.single();

	if (error) {
		console.error('Error fetching org:', error);
		return null;
	}
	return data;
};

export const getOrgById = async (id: number): Promise<Organization | null> => {
	const { data, error } = await supabase
		.from('organizations')
		.select('*')
		.eq('id', id)
		.single();

	if (error) {
		console.error('Error fetching org:', error);
		return null;
	}
	return data;
};

export const createOrganization = async (name: string, slug: string): Promise<Organization> => {
	const { data: userData } = await supabase.auth.getUser();
	if (!userData?.user) throw new Error('Not authenticated');

	const { data, error } = await supabase
		.from('organizations')
		.insert({ name, slug, owner_id: userData.user.id })
		.select()
		.single();

	if (error) {
		console.error('Error creating org:', error);
		throw new Error(error.message);
	}

	// Add creator as owner in org_members
	await supabase
		.from('org_members')
		.insert({ org_id: data.id, user_id: userData.user.id, role: 'owner' });

	return data;
};

export const getUserOrgs = async (): Promise<(OrgMember & { organizations: Organization })[]> => {
	const { data, error } = await supabase
		.from('org_members')
		.select('*, organizations(*)');

	if (error) {
		console.error('Error fetching user orgs:', error);
		return [];
	}
	return data as (OrgMember & { organizations: Organization })[];
};

export const getUserRoleInOrg = async (orgId: number): Promise<OrgMember | null> => {
	const { data: userData } = await supabase.auth.getUser();
	if (!userData?.user) return null;

	const { data, error } = await supabase
		.from('org_members')
		.select('*')
		.eq('org_id', orgId)
		.eq('user_id', userData.user.id)
		.single();

	if (error) return null;
	return data;
};

// ============================================
// Job Posting functions
// ============================================

export const getActiveRoles = async (orgId?: number) => {
	let query = supabase.from('job_posting').select('*');
	if (orgId) query = query.eq('org_id', orgId);
	query = query.eq('active_flg', true);

	const { data, error } = await query;
	if (error) {
		console.error('Error fetching data:', error);
		throw new Error('Failed to fetch data from Supabase');
	}
	return data as JobPosting[];
};

export const getAllJobPostings = async (orgId: number) => {
	const { data, error } = await supabase
		.from('job_posting')
		.select('*')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching jobs:', error);
		throw new Error('Failed to fetch job postings');
	}
	return data as JobPosting[];
};

export const getRoleByID = async (id: number) => {
	const { data, error } = await supabase
		.from('job_posting')
		.select('*')
		.eq('id', id);

	if (error) {
		console.error('Error fetching data:', error);
		throw new Error('Failed to fetch data from Supabase');
	}
	return data as JobPosting[];
};

export const createJobPosting = async (posting: {
	name: string;
	description: string;
	owner: string;
	org_id: number;
	questions: object;
	schedule: object;
}) => {
	const { data, error } = await supabase
		.from('job_posting')
		.insert(posting)
		.select()
		.single();

	if (error) {
		console.error('Error creating job posting:', error);
		throw new Error(error.message);
	}
	return data as JobPosting;
};

export const updateJobPosting = async (id: number, updates: Partial<JobPosting>) => {
	const { data, error } = await supabase
		.from('job_posting')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Error updating job posting:', error);
		throw new Error(error.message);
	}
	return data as JobPosting;
};

export const deleteJobPosting = async (id: number) => {
	const { error } = await supabase
		.from('job_posting')
		.delete()
		.eq('id', id);

	if (error) {
		console.error('Error deleting job posting:', error);
		throw new Error(error.message);
	}
};

export const toggleJobPostingActive = async (id: number, active: boolean) => {
	const { data, error } = await supabase
		.from('job_posting')
		.update({ active_flg: active })
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Error toggling job posting:', error);
		throw new Error(error.message);
	}
	return data as JobPosting;
};

// ============================================
// Applicant functions
// ============================================

export const sendApplication = async (row: object) => {
	const { data, error } = await supabase
		.from('applicants')
		.insert(row);

	if (error) {
		console.error('Error sending application:', error);
		throw new Error('Failed to send application to Supabase');
	}
	return data;
};


export const getAllApplicants = async (orgId?: number) => {
	let query = supabase.from('applicants').select('*');
	if (orgId) query = query.eq('org_id', orgId);

	const { data, error } = await query;
	if (error) {
		console.error('Error fetching applicants:', error);
		throw new Error('Failed to fetch applicants');
	}
	return data as Applicant[];
};

export const getApplicantData = async (id: number) => {
	const { data, error } = await supabase
		.from('applicants')
		.select('*')
		.eq('id', id);

	if (error) {
		console.error('Error fetching applicant:', error);
		throw new Error('Failed to fetch applicant data');
	}
	return data as Applicant[];
};

export const updateApplicantStatus = async (id: number, status: string) => {
	const { data, error } = await supabase
		.from('applicants')
		.update({ status })
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Error updating status:', error);
		throw new Error('Failed to update applicant status');
	}
	return data;
};

export const addComment = async (
	id: number,
	newID: number,
	comment: string,
	email: string,
	decision: string,
) => {
	const { data: applicantData, error: fetchError } = await supabase
		.from('applicants')
		.select('*')
		.eq('id', id)
		.limit(1);

	if (fetchError) {
		console.error('Error fetching applicant:', fetchError);
		throw new Error('Failed to fetch applicant');
	}

	if (!applicantData || applicantData.length === 0) {
		throw new Error(`No applicant found with ID: ${id}`);
	}

	const existingComments = Array.isArray(applicantData[0].comments?.comments)
		? applicantData[0].comments.comments
		: [];

	const updatedComments = {
		comments: [...existingComments, { id: newID, email, comment, decision }]
	};

	const { data, error: updateError } = await supabase
		.from('applicants')
		.update({ comments: updatedComments })
		.eq('id', id)
		.select();

	if (updateError) {
		console.error('Error updating comments:', updateError);
		throw new Error('Failed to update comments');
	}

	return data?.[0] ?? null;
};

// ============================================
// Auth helpers
// ============================================

export const getCurrentUserEmail = async () => {
	const { data, error } = await supabase.auth.getUser();
	if (error) {
		console.error('Failed to fetch current user:', error);
		return null;
	}
	return data?.user?.email || null;
};

export const getCurrentUser = async () => {
	const { data, error } = await supabase.auth.getUser();
	if (error) return null;
	return data?.user || null;
};

export const isPlatformAdmin = async (): Promise<boolean> => {
	const { data, error } = await supabase.rpc('is_platform_admin');
	if (error) return false;
	return data === true;
};

// ============================================
// Interview functions
// ============================================

export const getInterviewsByOrg = async (orgId: number) => {
	const { data, error } = await supabase
		.from('interviews')
		.select('*')
		.eq('org_id', orgId)
		.order('startTime', { ascending: true });

	if (error) {
		console.error('Error fetching interviews:', error);
		return [];
	}
	return data as Interview[];
};

export const getInterviewsByInterviewer = async (orgId: number, email: string) => {
	const { data, error } = await supabase
		.from('interviews')
		.select('*')
		.eq('org_id', orgId)
		.eq('interviewer', email)
		.order('startTime', { ascending: true });

	if (error) {
		console.error('Error fetching interviews:', error);
		return [];
	}
	return data as Interview[];
};

export const updateInterview = async (id: number, updates: Partial<Interview>) => {
	const { data, error } = await supabase
		.from('interviews')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Error updating interview:', error);
		throw new Error('Failed to update interview');
	}
	return data as Interview;
};

export const deleteInterview = async (id: number) => {
	const { error } = await supabase
		.from('interviews')
		.delete()
		.eq('id', id);

	if (error) {
		console.error('Error deleting interview:', error);
		throw new Error('Failed to delete interview');
	}
};

export const createInterview = async (interviewData: {
	startTime: string;
	endTime?: string;
	location: string;
	type: string;
	comments?: string;
	job: number;
	applicant: string;
	interviewer: string;
	org_id: number;
}) => {
	const { data, error } = await supabase
		.from('interviews')
		.insert(interviewData);

	if (error) {
		console.error('Error creating interview:', error);
		throw new Error('Failed to create interview');
	}
	return data;
};

// ============================================
// Org Member management
// ============================================

export const getOrgMembers = async (orgId: number) => {
	const { data, error } = await supabase
		.from('org_members')
		.select('*')
		.eq('org_id', orgId);

	if (error) {
		console.error('Error fetching org members:', error);
		return [];
	}
	return data as OrgMember[];
};

export const getOrgMembersWithEmail = async (orgId: number) => {
	const { data, error } = await supabase.rpc('get_org_members_with_email', {
		target_org_id: orgId,
	});

	if (error) {
		console.error('Error fetching members with email:', error);
		return [];
	}
	return data as (OrgMember & { email: string })[];
};

export const inviteMemberByEmail = async (orgId: number, email: string, role: string = 'recruiter') => {
	const { data, error } = await supabase.rpc('invite_member_by_email', {
		target_org_id: orgId,
		target_email: email,
		target_role: role,
	});

	if (error) {
		throw new Error(error.message);
	}
	if (data?.error) {
		throw new Error(data.error);
	}
	return data;
};

export const removeMember = async (orgId: number, userId: string) => {
	const { data, error } = await supabase.rpc('remove_org_member', {
		target_org_id: orgId,
		target_user_id: userId,
	});

	if (error) {
		throw new Error(error.message);
	}
	if (data?.error) {
		throw new Error(data.error);
	}
	return data;
};

export const updateMemberRole = async (orgId: number, userId: string, role: string) => {
	const { data, error } = await supabase.rpc('update_member_role', {
		target_org_id: orgId,
		target_user_id: userId,
		new_role: role,
	});

	if (error) {
		throw new Error(error.message);
	}
	if (data?.error) {
		throw new Error(data.error);
	}
	return data;
};

// ============================================
// Platform Admin functions
// ============================================

export const getAllUsersAdmin = async (): Promise<AdminUser[]> => {
	const { data, error } = await supabase.rpc('get_all_users_admin');
	if (error) {
		console.error('Error fetching users:', error);
		return [];
	}
	return data as AdminUser[];
};

export const getPlatformAdmins = async (): Promise<PlatformAdmin[]> => {
	const { data, error } = await supabase.rpc('get_platform_admins');
	if (error) {
		console.error('Error fetching platform admins:', error);
		return [];
	}
	return data as PlatformAdmin[];
};

export const addPlatformAdminByEmail = async (email: string) => {
	const { data, error } = await supabase.rpc('add_platform_admin_by_email', {
		target_email: email,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const removePlatformAdminById = async (userId: string) => {
	const { data, error } = await supabase.rpc('remove_platform_admin', {
		target_user_id: userId,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminCreateOrganization = async (
	name: string, slug: string, ownerEmail: string,
	primaryColor: string = '#ffc800', secondaryColor: string = '#0F1112'
) => {
	const { data, error } = await supabase.rpc('admin_create_organization', {
		org_name: name,
		org_slug: slug,
		owner_email: ownerEmail,
		p_color: primaryColor,
		s_color: secondaryColor,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminDeleteOrganization = async (orgId: number) => {
	const { data, error } = await supabase.rpc('admin_delete_organization', {
		target_org_id: orgId,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminUpdateOrganization = async (
	orgId: number,
	updates: { name?: string; slug?: string; primary_color?: string; secondary_color?: string }
) => {
	const { data, error } = await supabase.rpc('admin_update_organization', {
		target_org_id: orgId,
		new_name: updates.name || null,
		new_slug: updates.slug || null,
		new_primary_color: updates.primary_color || null,
		new_secondary_color: updates.secondary_color || null,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminTransferOwnership = async (orgId: number, newOwnerEmail: string) => {
	const { data, error } = await supabase.rpc('admin_transfer_ownership', {
		target_org_id: orgId,
		new_owner_email: newOwnerEmail,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const getAllJobPostingsAdmin = async (): Promise<AdminJobPosting[]> => {
	const { data, error } = await supabase.rpc('get_all_job_postings_admin');
	if (error) {
		console.error('Error fetching admin job postings:', error);
		return [];
	}
	return data as AdminJobPosting[];
};

export const getUserMembershipsAdmin = async (userId: string): Promise<UserMembership[]> => {
	const { data, error } = await supabase.rpc('get_user_memberships_admin', {
		target_user_id: userId,
	});
	if (error) {
		console.error('Error fetching user memberships:', error);
		return [];
	}
	return data as UserMembership[];
};

export const adminAddUserToOrg = async (orgId: number, email: string, role: string = 'recruiter') => {
	const { data, error } = await supabase.rpc('admin_add_user_to_org', {
		target_org_id: orgId,
		target_email: email,
		target_role: role,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminRemoveUserFromOrg = async (orgId: number, userId: string) => {
	const { data, error } = await supabase.rpc('admin_remove_user_from_org', {
		target_org_id: orgId,
		target_user_id: userId,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminChangeUserRole = async (orgId: number, userId: string, role: string) => {
	const { data, error } = await supabase.rpc('admin_change_user_role', {
		target_org_id: orgId,
		target_user_id: userId,
		new_role: role,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

// ============================================
// Admin: Job Posting functions
// ============================================

export const adminCreateJobPosting = async (posting: {
	name: string;
	description: string;
	owner: string;
	org_id: number;
	questions: object;
	schedule: object;
}) => {
	const { data, error } = await supabase.rpc('admin_create_job_posting', {
		job_name: posting.name,
		job_description: posting.description,
		job_owner: posting.owner,
		job_org_id: posting.org_id,
		job_questions: posting.questions,
		job_schedule: posting.schedule,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

// ============================================
// Admin: Applicant functions
// ============================================

export const getAllApplicantsAdmin = async (): Promise<AdminApplicant[]> => {
	const { data, error } = await supabase.rpc('get_all_applicants_admin');
	if (error) {
		console.error('Error fetching admin applicants:', error);
		return [];
	}
	return data as AdminApplicant[];
};

export const adminBulkUpdateStatus = async (ids: number[], status: string) => {
	const { data, error } = await supabase.rpc('admin_bulk_update_applicant_status', {
		applicant_ids: ids,
		new_status: status,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

export const adminBulkDeleteApplicants = async (ids: number[]) => {
	const { data, error } = await supabase.rpc('admin_bulk_delete_applicants', {
		applicant_ids: ids,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

// ============================================
// Admin: Platform settings
// ============================================

export const getPlatformSettings = async (): Promise<PlatformSettings> => {
	const { data, error } = await supabase.rpc('get_platform_settings');
	if (error) {
		console.error('Error fetching platform settings:', error);
		return {};
	}
	return (data || {}) as PlatformSettings;
};

export const updatePlatformSettings = async (settings: PlatformSettings) => {
	const { data, error } = await supabase.rpc('update_platform_settings', {
		new_settings: settings,
	});
	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return data;
};

// ============================================
// Admin: Analytics
// ============================================

export const getAdminAnalytics = async (): Promise<AdminAnalytics | null> => {
	const { data, error } = await supabase.rpc('get_admin_analytics');
	if (error) {
		console.error('Error fetching analytics:', error);
		return null;
	}
	return data as AdminAnalytics;
};

export const isMaintenanceMode = async (): Promise<boolean> => {
	const { data, error } = await supabase.rpc('is_maintenance_mode');
	if (error) return false;
	return data === true;
};

// ============================================
// Scheduling functions
// ============================================

export const getSchedulingConfig = async (orgId: number, jobId?: number): Promise<SchedulingConfigRow | null> => {
	let query = supabase
		.from('scheduling_config')
		.select('*')
		.eq('org_id', orgId);

	if (jobId) {
		query = query.eq('job_id', jobId);
	} else {
		query = query.is('job_id', null);
	}

	const { data, error } = await query.single();
	if (error) return null;
	return data as SchedulingConfigRow;
};

export const upsertSchedulingConfig = async (
	orgId: number,
	algorithmId: string,
	config: Record<string, unknown>,
	jobId?: number
) => {
	const row: Record<string, unknown> = {
		org_id: orgId,
		algorithm_id: algorithmId,
		config,
		job_id: jobId || null
	};

	const { data, error } = await supabase
		.from('scheduling_config')
		.upsert(row, { onConflict: 'org_id,job_id' })
		.select()
		.single();

	if (error) throw new Error(error.message);
	return data as SchedulingConfigRow;
};

export const bulkCreateInterviews = async (
	interviews: {
		startTime: string;
		endTime: string;
		location: string;
		type: string;
		job: number;
		applicant: string;
		interviewer: string;
		org_id: number;
		source: string;
	}[]
) => {
	const { data, error } = await supabase
		.from('interviews')
		.insert(interviews)
		.select();

	if (error) throw new Error(error.message);
	return data;
};

export const clearAutoScheduledInterviews = async (orgId: number, jobId?: number) => {
	let query = supabase
		.from('interviews')
		.delete()
		.eq('org_id', orgId)
		.eq('source', 'auto');

	if (jobId) {
		query = query.eq('job', jobId);
	}

	const { error } = await query;
	if (error) throw new Error(error.message);
};

export const getInterviewerAvailability = async (orgId: number): Promise<InterviewerAvailability[]> => {
	const { data, error } = await supabase
		.from('interviewer_availability')
		.select('*')
		.eq('org_id', orgId)
		.order('date', { ascending: true });

	if (error) {
		console.error('Error fetching interviewer availability:', error);
		return [];
	}
	return data as InterviewerAvailability[];
};

export const getMyInterviewerAvailability = async (orgId: number): Promise<InterviewerAvailability[]> => {
	const { data: userData } = await supabase.auth.getUser();
	if (!userData?.user) return [];

	const { data, error } = await supabase
		.from('interviewer_availability')
		.select('*')
		.eq('org_id', orgId)
		.eq('user_id', userData.user.id)
		.order('date', { ascending: true });

	if (error) {
		console.error('Error fetching my availability:', error);
		return [];
	}
	return data as InterviewerAvailability[];
};

export const saveInterviewerAvailability = async (
	orgId: number,
	ranges: { date: string; start_time: string; end_time: string; timezone: string }[]
) => {
	const { data: userData } = await supabase.auth.getUser();
	if (!userData?.user) throw new Error('Not authenticated');

	// Delete existing availability for this user in this org
	await supabase
		.from('interviewer_availability')
		.delete()
		.eq('org_id', orgId)
		.eq('user_id', userData.user.id);

	if (ranges.length === 0) return [];

	const rows = ranges.map(r => ({
		org_id: orgId,
		user_id: userData.user.id,
		email: userData.user.email || '',
		date: r.date,
		start_time: r.start_time,
		end_time: r.end_time,
		timezone: r.timezone
	}));

	const { data, error } = await supabase
		.from('interviewer_availability')
		.insert(rows)
		.select();

	if (error) throw new Error(error.message);
	return data;
};

export { supabase };
