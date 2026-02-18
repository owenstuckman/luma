import { writable } from 'svelte/store';
import type { JobPosting } from '$lib/types';

/** Currently selected job posting filter. null = "All Jobs" (no filter). */
export const selectedJob = writable<JobPosting | null>(null);
