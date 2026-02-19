import { greedyFirstAvailable } from './algorithms/greedy-first-available';
import { balancedLoad } from './algorithms/balanced-load';
import { roundRobin } from './algorithms/round-robin';
import { batchScheduler } from './algorithms/batch-scheduler';
import type { SchedulingAlgorithm } from './types';

export const algorithms: SchedulingAlgorithm[] = [
	greedyFirstAvailable,
	balancedLoad,
	roundRobin,
	batchScheduler
];

export function getAlgorithm(id: string): SchedulingAlgorithm | undefined {
	return algorithms.find((a) => a.id === id);
}
