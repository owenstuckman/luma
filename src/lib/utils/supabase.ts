import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Organization, OrgMember, JobPosting, Applicant } from '$lib/types';

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

export const sendApplicationFall2025 = async (name: string, email: string, recruitInfo: { [key: string]: string }, job: 1) => {
	const applicationData = { name, email, recruitInfo, job };

	const { data, error } = await supabase
		.from('applicants')
		.insert(applicationData);

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

// ============================================
// Interview functions
// ============================================

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

export { supabase };
