// Candidate roster + timeline aggregation.
//
// The pipeline state for a candidate is spread across several tables
// (`applicants`, `interviews`, `decisions`, `email_log`, `application_drafts`).
// Nothing else in the app joins them, so this module is the single place that
// does — the roster list and the candidate profile both read from here.
//
// Tables added by the V1 migrations (00015-00020) may not be applied to every
// deployment yet, so every query against them is failure-tolerant: a missing
// table degrades that slice of the timeline instead of breaking the page.

import { supabase } from '$lib/utils/supabase';
import type { Applicant, Decision, DecisionOutcome, Team } from '$lib/types';

/** Where a candidate sits in the pipeline, derived from their data. */
export type CandidateStage =
	| 'applied'
	| 'reviewed'
	| 'interviewing'
	| 'evaluated'
	| 'decided'
	| 'rejected';

export interface CandidateRow extends Applicant {
	job_name: string | null;
	team_names: string[];
	interview_count: number;
	/** Interviews that have an evaluation recorded in `comments.evaluation`. */
	evaluated_count: number;
	/** Highest round number this candidate has reached (1-indexed). 0 = none. */
	latest_round: number;
	/** Mean of all submitted evaluation ratings, or null if none. */
	avg_rating: number | null;
	decisions: (Decision & { team_name: string | null })[];
	stage: CandidateStage;
	/** True when 2+ teams have independently voted to hire this candidate. */
	hire_conflict: boolean;
}

export type TimelineKind =
	| 'draft'
	| 'applied'
	| 'comment'
	| 'status'
	| 'interview_scheduled'
	| 'interview'
	| 'evaluation'
	| 'decision'
	| 'email';

export interface TimelineEvent {
	kind: TimelineKind;
	/** ISO timestamp, or null when the source record carries no time. */
	at: string | null;
	title: string;
	detail?: string;
	/** Who caused the event (email or name), when known. */
	actor?: string;
	/** Free-form tag rendered as a pill (status, outcome, recommendation). */
	tag?: string;
}

interface InterviewLite {
	id: number;
	start_time: string;
	created_at: string;
	interviewer: string | null;
	location: string | null;
	type: string | null;
	comments: Record<string, unknown> | null;
}

interface EvaluationPayload {
	rating?: number;
	recommendation?: string;
	strengths?: string;
	weaknesses?: string;
	notes?: string;
	evaluator?: string;
	evaluatedAt?: string;
}

function readEvaluation(iv: InterviewLite): EvaluationPayload | null {
	const raw = iv.comments?.evaluation;
	return raw && typeof raw === 'object' ? (raw as EvaluationPayload) : null;
}

/**
 * Fetch every applicant for an org, enriched with pipeline state.
 * Pass `jobId` to scope to a single posting.
 */
export const getCandidates = async (
	orgId: number,
	jobId?: number | null
): Promise<CandidateRow[]> => {
	let query = supabase
		.from('applicants')
		.select('*')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });

	if (jobId) query = query.eq('job', jobId);

	const { data: applicants, error } = await query;
	if (error) throw error;
	if (!applicants || applicants.length === 0) return [];

	const rows = applicants as Applicant[];
	const emails = rows.map((a) => a.email).filter(Boolean);
	const ids = rows.map((a) => a.id);

	// Look up names for the foreign keys the roster displays. Teams and
	// decisions are V1 tables; treat their absence as "no data".
	const [jobsRes, teamsRes, interviewsRes, decisionsRes] = await Promise.all([
		supabase.from('job_posting').select('id, name').eq('org_id', orgId),
		supabase.from('teams').select('*').eq('org_id', orgId),
		supabase
			.from('interviews')
			.select('id, start_time, created_at, interviewer, location, type, comments, applicant')
			.eq('org_id', orgId)
			.in('applicant', emails.length > 0 ? emails : ['']),
		supabase.from('decisions').select('*').eq('org_id', orgId).in('applicant_id', ids)
	]);

	const jobNames = new Map<number, string>(
		((jobsRes.data as { id: number; name: string }[] | null) ?? []).map((j) => [j.id, j.name])
	);
	const teams = (teamsRes.data as Team[] | null) ?? [];
	const teamsBySlug = new Map(teams.map((t) => [t.slug, t]));
	const teamsById = new Map(teams.map((t) => [t.id, t]));

	const interviewsByEmail = new Map<string, InterviewLite[]>();
	for (const iv of (interviewsRes.data as (InterviewLite & { applicant: string | null })[]) ?? []) {
		if (!iv.applicant) continue;
		const list = interviewsByEmail.get(iv.applicant) ?? [];
		list.push(iv);
		interviewsByEmail.set(iv.applicant, list);
	}

	const decisionsByApplicant = new Map<number, Decision[]>();
	for (const d of (decisionsRes.data as Decision[] | null) ?? []) {
		const list = decisionsByApplicant.get(d.applicant_id) ?? [];
		list.push(d);
		decisionsByApplicant.set(d.applicant_id, list);
	}

	return rows.map((a) => {
		const interviews = (interviewsByEmail.get(a.email) ?? []).sort(
			(x, y) => new Date(x.start_time).getTime() - new Date(y.start_time).getTime()
		);
		const ratings = interviews
			.map((iv) => readEvaluation(iv)?.rating)
			.filter((r): r is number => typeof r === 'number' && r > 0);

		const decisions = (decisionsByApplicant.get(a.id) ?? []).map((d) => ({
			...d,
			team_name: teamsById.get(d.team_id)?.name ?? null
		}));

		const row: CandidateRow = {
			...a,
			job_name: a.job !== null ? (jobNames.get(a.job) ?? null) : null,
			team_names: (a.selected_team_slugs ?? []).map((slug) => teamsBySlug.get(slug)?.name ?? slug),
			interview_count: interviews.length,
			evaluated_count: interviews.filter((iv) => readEvaluation(iv) !== null).length,
			latest_round: interviews.length,
			avg_rating: ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
			decisions,
			stage: 'applied',
			hire_conflict: decisions.filter((d) => d.outcome === 'hire').length > 1
		};
		row.stage = deriveStage(row);
		return row;
	});
};

/** Derive a pipeline stage from the candidate's aggregated state. */
export function deriveStage(row: CandidateRow): CandidateStage {
	if (row.status === 'denied') return 'rejected';
	if (row.decisions.length > 0) return 'decided';
	if (row.status === 'accepted') return 'decided';
	if (row.interview_count > 0) {
		return row.evaluated_count >= row.interview_count ? 'evaluated' : 'interviewing';
	}
	if ((row.comments?.comments ?? []).length > 0) return 'reviewed';
	return 'applied';
}

export const STAGE_ORDER: CandidateStage[] = [
	'applied',
	'reviewed',
	'interviewing',
	'evaluated',
	'decided',
	'rejected'
];

export const STAGE_LABELS: Record<CandidateStage, string> = {
	applied: 'Applied',
	reviewed: 'In Review',
	interviewing: 'Interviewing',
	evaluated: 'Evaluated',
	decided: 'Decided',
	rejected: 'Rejected'
};

export const STAGE_COLORS: Record<CandidateStage, string> = {
	applied: '#878fa1',
	reviewed: '#8b5cf6',
	interviewing: '#3b82f6',
	evaluated: '#0ea5e9',
	decided: '#22c55e',
	rejected: '#ef4444'
};

export const OUTCOME_COLORS: Record<DecisionOutcome, string> = {
	hire: '#22c55e',
	waitlist: '#f59e0b',
	reject: '#ef4444'
};

/**
 * Build a single chronological event list for one candidate, unioning every
 * table that records something about them. Events with no timestamp (inline
 * comments carry none) sort to the end.
 */
export const getCandidateTimeline = async (
	orgId: number,
	applicant: Applicant
): Promise<TimelineEvent[]> => {
	const events: TimelineEvent[] = [];

	const [draftRes, interviewsRes, decisionsRes, teamsRes, emailRes] = await Promise.all([
		supabase
			.from('application_drafts')
			.select('created_at, updated_at, submitted_at')
			.eq('org_id', orgId)
			.eq('email', applicant.email)
			.order('created_at', { ascending: true }),
		supabase
			.from('interviews')
			.select('id, start_time, created_at, interviewer, location, type, comments')
			.eq('org_id', orgId)
			.eq('applicant', applicant.email)
			.order('start_time', { ascending: true }),
		supabase.from('decisions').select('*').eq('applicant_id', applicant.id),
		supabase.from('teams').select('id, name').eq('org_id', orgId),
		supabase
			.from('email_log')
			.select('created_at, type, status, recipient, error')
			.eq('org_id', orgId)
			.eq('recipient', applicant.email)
			.order('created_at', { ascending: true })
	]);

	for (const d of (draftRes.data as { created_at: string }[] | null) ?? []) {
		events.push({
			kind: 'draft',
			at: d.created_at,
			title: 'Started application',
			detail: 'Draft created'
		});
	}

	events.push({
		kind: 'applied',
		at: applicant.created_at,
		title: 'Application submitted',
		detail:
			applicant.selected_team_slugs?.length > 0
				? `Applied to ${applicant.selected_team_slugs.join(', ')}`
				: undefined
	});

	const interviews = (interviewsRes.data as InterviewLite[] | null) ?? [];
	interviews.forEach((iv, i) => {
		const round = i + 1;
		events.push({
			kind: 'interview_scheduled',
			at: iv.created_at,
			title: `Round ${round} interview scheduled`,
			detail: [iv.location, iv.type].filter(Boolean).join(' · ') || undefined,
			actor: iv.interviewer ?? undefined
		});
		events.push({
			kind: 'interview',
			at: iv.start_time,
			title: `Round ${round} interview`,
			detail: [iv.location, iv.type].filter(Boolean).join(' · ') || undefined,
			actor: iv.interviewer ?? undefined
		});

		const evaluation = readEvaluation(iv);
		if (evaluation) {
			events.push({
				kind: 'evaluation',
				at: evaluation.evaluatedAt ?? iv.start_time,
				title: `Round ${round} evaluation submitted`,
				detail: typeof evaluation.rating === 'number' ? `${evaluation.rating}/5` : undefined,
				actor: evaluation.evaluator ?? iv.interviewer ?? undefined,
				tag: evaluation.recommendation
			});
		}
	});

	const teamNames = new Map<number, string>(
		((teamsRes.data as { id: number; name: string }[] | null) ?? []).map((t) => [t.id, t.name])
	);
	for (const d of (decisionsRes.data as Decision[] | null) ?? []) {
		events.push({
			kind: 'decision',
			at: d.decided_at,
			title: `Decision: ${d.outcome} — ${teamNames.get(d.team_id) ?? `team #${d.team_id}`}`,
			detail: d.notes ?? undefined,
			tag: d.outcome
		});
		if (d.email_sent_at) {
			events.push({
				kind: 'email',
				at: d.email_sent_at,
				title: 'Decision email sent',
				detail: teamNames.get(d.team_id) ?? undefined
			});
		}
	}

	type EmailRow = { created_at: string; type: string; status: string; error: string | null };
	for (const e of (emailRes.data as EmailRow[] | null) ?? []) {
		events.push({
			kind: 'email',
			at: e.created_at,
			title: `Email: ${e.type.replace(/_/g, ' ')}`,
			detail: e.status === 'failed' ? (e.error ?? 'Send failed') : undefined,
			tag: e.status
		});
	}

	// Inline comments have no timestamp in the stored shape, so they land at the
	// end rather than being given a fake time.
	for (const c of applicant.comments?.comments ?? []) {
		events.push({
			kind: 'comment',
			at: null,
			title: 'Reviewer comment',
			detail: c.comment,
			actor: c.email,
			tag: c.decision
		});
	}

	return events.sort((a, b) => {
		if (a.at === null && b.at === null) return 0;
		if (a.at === null) return 1;
		if (b.at === null) return -1;
		return new Date(a.at).getTime() - new Date(b.at).getTime();
	});
};
