import type { Interview, Applicant, JobPosting, OrgMember } from '$lib/types';
import { applicantEmail, interviewerEmail } from './templates';

export interface RecipientEmail {
	to: string;
	subject: string;
	text: string;
}

function getApplicantName(email: string, applicants: Applicant[]): string {
	return applicants.find((a) => a.email === email)?.name ?? email;
}

function getJobTitle(jobId: number | null, jobs: JobPosting[]): string {
	if (!jobId) return 'Open Role';
	return jobs.find((j) => j.id === jobId)?.name ?? 'Open Role';
}

export function generateApplicantEmails(
	interviews: Interview[],
	applicants: Applicant[],
	jobs: JobPosting[],
	orgName: string
): RecipientEmail[] {
	// Group interviews by applicant email
	const byApplicant = new Map<string, Interview[]>();
	for (const iv of interviews) {
		if (!iv.applicant) continue;
		const existing = byApplicant.get(iv.applicant) ?? [];
		// Avoid duplicating the same slot if the applicant appears across multiple interviewer rows
		const alreadyHasSlot = existing.some(
			(e) => e.start_time === iv.start_time && e.location === iv.location
		);
		if (!alreadyHasSlot) existing.push(iv);
		byApplicant.set(iv.applicant, existing);
	}

	const results: RecipientEmail[] = [];

	for (const [email, ivs] of byApplicant) {
		// Use the most common job across this applicant's interviews
		const jobCounts = new Map<number | null, number>();
		for (const iv of ivs) jobCounts.set(iv.job, (jobCounts.get(iv.job) ?? 0) + 1);
		const primaryJobId = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

		const draft = applicantEmail({
			applicantName: getApplicantName(email, applicants),
			orgName,
			jobTitle: getJobTitle(primaryJobId, jobs),
			slots: ivs.map((iv) => ({
				startTime: new Date(iv.start_time),
				endTime: iv.end_time ? new Date(iv.end_time) : null,
				location: iv.location,
				type: iv.type
			}))
		});

		results.push({ to: email, ...draft });
	}

	// Sort by applicant email for predictable ordering
	return results.sort((a, b) => a.to.localeCompare(b.to));
}

export function generateInterviewerEmails(
	interviews: Interview[],
	orgMembers: (OrgMember & { email: string })[],
	applicants: Applicant[],
	jobs: JobPosting[],
	orgName: string
): RecipientEmail[] {
	// Group interviews by interviewer email
	const byInterviewer = new Map<string, Interview[]>();
	for (const iv of interviews) {
		if (!iv.interviewer) continue;
		const existing = byInterviewer.get(iv.interviewer) ?? [];
		existing.push(iv);
		byInterviewer.set(iv.interviewer, existing);
	}

	const results: RecipientEmail[] = [];

	for (const [email, ivs] of byInterviewer) {
		// Use member display name from orgMembers if available, otherwise fall back to email prefix
		const member = orgMembers.find((m) => m.email === email);
		const interviewerName = member?.email
			? member.email.split('@')[0].replace(/[._-]/g, ' ')
			: email;

		// Use the most common job for the subject line
		const jobCounts = new Map<number | null, number>();
		for (const iv of ivs) jobCounts.set(iv.job, (jobCounts.get(iv.job) ?? 0) + 1);
		const primaryJobId = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

		const draft = interviewerEmail({
			interviewerName,
			orgName,
			jobTitle: getJobTitle(primaryJobId, jobs),
			slots: ivs.map((iv) => ({
				startTime: new Date(iv.start_time),
				endTime: iv.end_time ? new Date(iv.end_time) : null,
				location: iv.location,
				type: iv.type,
				applicantName: getApplicantName(iv.applicant ?? '', applicants)
			}))
		});

		results.push({ to: email, ...draft });
	}

	return results.sort((a, b) => a.to.localeCompare(b.to));
}
