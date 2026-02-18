import type { SchedulingAlgorithm, SchedulerInput, SchedulerOutput, ProposedInterview } from '../types';
import { findOverlappingSlots, findFirstAvailableSlot, toISO } from '../utils';

export const balancedLoad: SchedulingAlgorithm = {
	id: 'balanced-load',
	name: 'Balanced Load',
	description: 'Distributes interviews evenly across interviewers by always picking the one with the fewest assignments.',
	configSchema: [],
	run(input: SchedulerInput): SchedulerOutput {
		const { applicants, interviewers, existingInterviews, config } = input;
		const proposed: ProposedInterview[] = [];
		const unmatched: string[] = [];
		const warnings: string[] = [];

		if (interviewers.length === 0) {
			warnings.push('No interviewers with availability found.');
			return { interviews: proposed, unmatched: applicants.map(a => a.email), warnings };
		}

		// Count existing assignments per interviewer
		const assignmentCount = new Map<string, number>();
		for (const iv of existingInterviews) {
			assignmentCount.set(iv.interviewer, (assignmentCount.get(iv.interviewer) || 0) + 1);
		}

		function getCount(email: string): number {
			return (assignmentCount.get(email) || 0) +
				proposed.filter(p => p.interviewer === email).length;
		}

		for (const applicant of applicants) {
			// Sort interviewers by current assignment count (fewest first)
			const sorted = [...interviewers].sort((a, b) => getCount(a.email) - getCount(b.email));
			let matched = false;

			for (const interviewer of sorted) {
				if (config.maxInterviewsPerInterviewer > 0 && getCount(interviewer.email) >= config.maxInterviewsPerInterviewer) {
					continue;
				}

				const overlaps = findOverlappingSlots(
					applicant.availability,
					interviewer.availability,
					config.slotDurationMinutes
				);

				const slot = findFirstAvailableSlot(
					applicant.email,
					interviewer.email,
					overlaps,
					config.slotDurationMinutes,
					config.breakBetweenMinutes,
					existingInterviews,
					proposed
				);

				if (slot) {
					proposed.push({
						startTime: toISO(slot.date, slot.start),
						endTime: toISO(slot.date, slot.end),
						applicant: applicant.email,
						interviewer: interviewer.email,
						location: config.location,
						type: config.interviewType,
						jobId: applicant.jobId
					});
					matched = true;
					break;
				}
			}

			if (!matched) {
				unmatched.push(applicant.email);
			}
		}

		if (unmatched.length > 0) {
			warnings.push(`${unmatched.length} applicant(s) could not be scheduled due to no overlapping availability.`);
		}

		return { interviews: proposed, unmatched, warnings };
	}
};
