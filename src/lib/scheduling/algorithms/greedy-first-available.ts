import type { SchedulingAlgorithm, SchedulerInput, SchedulerOutput, ProposedInterview } from '../types';
import { findOverlappingSlots, findFirstAvailableSlot, toISO } from '../utils';

export const greedyFirstAvailable: SchedulingAlgorithm = {
	id: 'greedy-first-available',
	name: 'Greedy First Available',
	description: 'Assigns each applicant to the first available interviewer with an overlapping time slot. Simple and fast.',
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

		for (const applicant of applicants) {
			let matched = false;

			for (const interviewer of interviewers) {
				const currentCount = (assignmentCount.get(interviewer.email) || 0) +
					proposed.filter(p => p.interviewer === interviewer.email).length;

				if (config.maxInterviewsPerInterviewer > 0 && currentCount >= config.maxInterviewsPerInterviewer) {
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
