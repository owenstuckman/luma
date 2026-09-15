// Round 2 selection data: second-interview picks, readiness scores, and the
// per-posting scoring context a single candidate's page needs.
//
// Tables from migration 00039. Like the rest of the pipeline reads, loading is
// failure-tolerant — a missing table shows as "nothing yet" rather than
// breaking the page — but writes throw, so the UI can say a save failed.

import { supabase } from '$lib/utils/supabase';
import {
	fetchAllRows,
	personKey,
	scoredInterviews,
	type InterviewLite
} from '$lib/utils/candidates';
import { fitScoreModel, type ScoreModel, type ScoreObservation } from '$lib/utils/scoreModel';
import { candidateNumber, type NamedCandidate } from '$lib/utils/blind';

/* ------------------------------------------------------------------ *
 * Second-interview picks
 * ------------------------------------------------------------------ */

export interface SecondRoundPick {
	applicant_id: number;
	picked_by_email: string;
	created_at: string;
}

export async function getSecondRoundPicks(
	orgId: number,
	applicantId?: number
): Promise<Map<number, SecondRoundPick>> {
	let query = supabase
		.from('second_round_picks')
		.select('applicant_id, picked_by_email, created_at')
		.eq('org_id', orgId);
	if (applicantId !== undefined) query = query.eq('applicant_id', applicantId);
	const { data, error } = await query;
	if (error) {
		console.warn('second-round picks unavailable:', error.message);
		return new Map();
	}
	return new Map((data as SecondRoundPick[]).map((p) => [p.applicant_id, p]));
}

/** Add or remove one application from its team's second-interview list. */
export async function setSecondRoundPick(
	orgId: number,
	applicantId: number,
	picked: boolean
): Promise<void> {
	if (picked) {
		const { data: auth } = await supabase.auth.getSession();
		const user = auth.session?.user;
		if (!user) throw new Error('Not signed in.');
		const { error } = await supabase
			.from('second_round_picks')
			.upsert(
				{ org_id: orgId, applicant_id: applicantId, picked_by: user.id },
				{ onConflict: 'applicant_id', ignoreDuplicates: true }
			);
		if (error) throw error;
	} else {
		const { error } = await supabase
			.from('second_round_picks')
			.delete()
			.eq('org_id', orgId)
			.eq('applicant_id', applicantId);
		if (error) throw error;
	}
}

/* ------------------------------------------------------------------ *
 * Readiness scores
 * ------------------------------------------------------------------ */

/** 'blind' = rated without seeing interview scores; 'informed' = with them. */
export type ReadinessPass = 'blind' | 'informed';

export const READINESS_PASS_LABELS: Record<ReadinessPass, string> = {
	blind: 'Without scores',
	informed: 'With scores'
};

export interface ReadinessScore {
	applicant_id: number;
	rater_id: string;
	rater_email: string;
	pass: ReadinessPass;
	score: number;
	updated_at: string;
}

export async function getReadinessScores(
	orgId: number,
	applicantId?: number
): Promise<ReadinessScore[]> {
	const rows: ReadinessScore[] = [];
	for (let from = 0; ; from += 1000) {
		let query = supabase
			.from('readiness_scores')
			.select('applicant_id, rater_id, rater_email, pass, score, updated_at')
			.eq('org_id', orgId);
		if (applicantId !== undefined) query = query.eq('applicant_id', applicantId);
		const { data, error } = await query.order('id', { ascending: true }).range(from, from + 999);
		if (error) {
			console.warn('readiness scores unavailable:', error.message);
			return rows;
		}
		rows.push(...(data as ReadinessScore[]));
		if (data.length < 1000) return rows;
	}
}

/** Save (or with `score` null, clear) the signed-in recruiter's rating. */
export async function saveReadinessScore(
	orgId: number,
	applicantId: number,
	pass: ReadinessPass,
	score: number | null
): Promise<void> {
	const { data: auth } = await supabase.auth.getSession();
	const user = auth.session?.user;
	if (!user?.email) throw new Error('Not signed in.');

	if (score === null) {
		const { error } = await supabase
			.from('readiness_scores')
			.delete()
			.eq('applicant_id', applicantId)
			.eq('rater_id', user.id)
			.eq('pass', pass);
		if (error) throw error;
		return;
	}

	const { error } = await supabase.from('readiness_scores').upsert(
		{
			org_id: orgId,
			applicant_id: applicantId,
			rater_id: user.id,
			rater_email: user.email.toLowerCase(),
			pass,
			score,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'applicant_id,rater_id,pass' }
	);
	if (error) throw error;
}

export interface ReadinessSummary {
	blind: { average: number | null; count: number };
	informed: { average: number | null; count: number };
	mine: Partial<Record<ReadinessPass, number>>;
}

export function summarizeReadiness(
	scores: ReadinessScore[],
	myUserId: string | null
): Map<number, ReadinessSummary> {
	const out = new Map<number, ReadinessSummary>();
	const sums = new Map<string, { sum: number; n: number }>();
	for (const s of scores) {
		let summary = out.get(s.applicant_id);
		if (!summary) {
			summary = {
				blind: { average: null, count: 0 },
				informed: { average: null, count: 0 },
				mine: {}
			};
			out.set(s.applicant_id, summary);
		}
		const key = `${s.applicant_id}|${s.pass}`;
		const acc = sums.get(key) ?? { sum: 0, n: 0 };
		acc.sum += s.score;
		acc.n += 1;
		sums.set(key, acc);
		summary[s.pass] = { average: acc.sum / acc.n, count: acc.n };
		if (myUserId && s.rater_id === myUserId) summary.mine[s.pass] = s.score;
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * Scoring context for one posting
 * ------------------------------------------------------------------ */

export interface JobScoringContext {
	model: ScoreModel;
	/** Blind-mode number for each person (see personKey). */
	numberOf: Map<string, number>;
	/** Everyone on the posting, for scrubbing names out of notes. */
	people: NamedCandidate[];
	/** person key → the people who shared a session with them, themselves included. */
	sessionMates: Map<string, NamedCandidate[]>;
}

const contextCache = new Map<string, Promise<JobScoringContext>>();

/**
 * Interviewer leans, candidate numbers and name lists for one posting.
 *
 * The single-candidate page needs the whole posting's evaluations to know how
 * each of ITS interviewers tends to score. Only the columns the model uses are
 * read, and the result is memoised for the tab, so moving between candidates
 * fetches it once.
 */
export function getJobScoringContext(orgId: number, jobId: number): Promise<JobScoringContext> {
	const key = `${orgId}|${jobId}`;
	let pending = contextCache.get(key);
	if (!pending) {
		pending = loadJobScoringContext(orgId, jobId);
		contextCache.set(key, pending);
		pending.catch(() => contextCache.delete(key));
	}
	return pending;
}

async function loadJobScoringContext(orgId: number, jobId: number): Promise<JobScoringContext> {
	type Row = { id: number; name: string; email: string; job: number | null };
	type IvRow = Pick<InterviewLite, 'id' | 'type' | 'interviewer' | 'start_time' | 'location'> & {
		applicant_id: number | null;
		evaluation: unknown;
	};

	const [applicantsRes, interviewsRes] = await Promise.all([
		fetchAllRows<Row>(() =>
			supabase
				.from('applicants')
				.select('id, name, email, job')
				.eq('org_id', orgId)
				.eq('job', jobId)
				.order('id', { ascending: true })
		),
		fetchAllRows<IvRow>(() =>
			supabase
				.from('interviews')
				.select(
					'id, type, interviewer, start_time, location, applicant_id, evaluation:comments->evaluation'
				)
				.eq('org_id', orgId)
				.eq('job', jobId)
				.order('id', { ascending: true })
		)
	]);
	if (applicantsRes.error) throw applicantsRes.error;
	if (interviewsRes.error) throw interviewsRes.error;
	const applicants = applicantsRes.rows;
	const interviews = interviewsRes.rows;

	const personOfApp = new Map<number, string>();
	const idsByPerson = new Map<string, number[]>();
	const nameOfPerson = new Map<string, string>();
	for (const a of applicants) {
		const pk = personKey(a.job, a.email);
		personOfApp.set(a.id, pk);
		idsByPerson.set(pk, [...(idsByPerson.get(pk) ?? []), a.id]);
		if (!nameOfPerson.has(pk)) nameOfPerson.set(pk, a.name);
	}
	const numberOf = new Map([...idsByPerson].map(([pk, ids]) => [pk, candidateNumber(ids)]));
	const named = (pk: string): NamedCandidate => ({
		name: nameOfPerson.get(pk) ?? '',
		number: numberOf.get(pk) ?? 0
	});

	const observations: ScoreObservation[] = [];
	const sessions = new Map<string, Set<string>>();
	for (const iv of interviews) {
		const pk = iv.applicant_id !== null ? personOfApp.get(iv.applicant_id) : undefined;
		if (!pk) continue;
		const lite = {
			...iv,
			end_time: null,
			created_at: iv.start_time,
			comments: iv.evaluation ? { evaluation: iv.evaluation } : null
		} as InterviewLite;
		for (const s of scoredInterviews([lite])) {
			if (s.score !== null && s.rater) observations.push({ candidate: pk, ...s, score: s.score });
		}
		if (iv.type === 'group') {
			const sk = `${iv.location}|${new Date(iv.start_time).getTime()}`;
			const set = sessions.get(sk) ?? new Set<string>();
			set.add(pk);
			sessions.set(sk, set);
		}
	}

	const sessionMates = new Map<string, NamedCandidate[]>();
	for (const members of sessions.values()) {
		for (const pk of members) {
			const list = sessionMates.get(pk) ?? [named(pk)];
			for (const other of members) {
				if (!list.some((n) => n.number === numberOf.get(other))) list.push(named(other));
			}
			sessionMates.set(pk, list);
		}
	}

	return {
		model: fitScoreModel(observations),
		numberOf,
		people: [...idsByPerson.keys()].map(named),
		sessionMates
	};
}
