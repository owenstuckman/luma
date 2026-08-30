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

/** The minimum a team row needs to expose for team resolution. */
export type TeamRef = Pick<Team, 'id' | 'name' | 'slug'>;

/**
 * The single team an application belongs to.
 *
 * Since migration 00024 an application IS a team's application, so this is
 * one team, never a list. `legacy_multi` marks the pre-00024 rows that were
 * deliberately not split (their per-team answers were never collected): those
 * still carry several slugs and must be presented as what they are — one
 * combined application — rather than dressed up as a single-team one.
 */
export interface ApplicationTeam {
	id: number | null;
	name: string | null;
	slug: string | null;
	legacy_multi: boolean;
	/** Every slug on the row. One entry except on a legacy combined row. */
	all_names: string[];
	all_slugs: string[];
}

/**
 * Resolve the team an application is for.
 *
 * `team_id` is authoritative; `selected_team_slugs` is the fallback for rows
 * written before 00024 (and for orgs that define no teams at all, where the
 * answer is legitimately "no team").
 */
export function resolveApplicationTeam(
	applicant: Pick<Applicant, 'team_id' | 'selected_team_slugs'>,
	teams: TeamRef[]
): ApplicationTeam {
	const byId = new Map(teams.map((t) => [t.id, t]));
	const bySlug = new Map(teams.map((t) => [t.slug, t]));
	const slugs = applicant.selected_team_slugs ?? [];
	const names = slugs.map((s) => bySlug.get(s)?.name ?? s);

	if (applicant.team_id !== null && applicant.team_id !== undefined) {
		const t = byId.get(applicant.team_id) ?? null;
		return {
			id: applicant.team_id,
			name: t?.name ?? names[0] ?? `Team #${applicant.team_id}`,
			slug: t?.slug ?? slugs[0] ?? null,
			legacy_multi: false,
			all_names: t ? [t.name] : names.slice(0, 1),
			all_slugs: t ? [t.slug] : slugs.slice(0, 1)
		};
	}

	// No team_id. One slug is an unbackfilled but unambiguous row; several is a
	// legacy combined application; none means the org has no teams.
	return {
		id: null,
		name: slugs.length === 1 ? names[0] : null,
		slug: slugs.length === 1 ? slugs[0] : null,
		legacy_multi: slugs.length > 1,
		all_names: names,
		all_slugs: slugs
	};
}

export interface CandidateRow extends Applicant {
	job_name: string | null;
	/** The one team this application is for. */
	team: ApplicationTeam;
	/**
	 * This application's team name. A single entry for every post-00024 row;
	 * only a legacy combined application has more than one.
	 */
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

export interface InterviewLite {
	id: number;
	start_time: string;
	created_at: string;
	interviewer: string | null;
	location: string | null;
	type: string | null;
	comments: Record<string, unknown> | null;
}

const INTERVIEW_COLUMNS = 'id, start_time, created_at, interviewer, location, type, comments';

/**
 * Which interviews belong to ONE application.
 *
 * `interviews.applicant` is the candidate's email, and since migration 00024 a
 * single email can own several applications — one per team. Joining on email
 * alone therefore hands every sibling application the SAME interviews, which
 * would make the Astra application display Terra's interview and count it into
 * Astra's interview/evaluation/rating numbers. That is exactly the cross-team
 * conflation the per-team model exists to prevent.
 *
 * So: `interviews.applicant_id` (migration 00026) is authoritative whenever it
 * is set. The email join is kept ONLY for legacy rows where `applicant_id` is
 * null — interviews the backfill could not map unambiguously. Those rows
 * predate the split and so have no siblings, which is precisely why matching
 * them by email is safe.
 *
 * DO NOT "simplify" this back to an email-only join.
 */
function sortInterviews(list: InterviewLite[]): InterviewLite[] {
	return [...list].sort(
		(x, y) => new Date(x.start_time).getTime() - new Date(y.start_time).getTime()
	);
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
	// Applicant email is normalized to lowercase on write since 00025, but older
	// rows carry mixed case, so every email match here is done case-insensitively.
	const emails = rows.map((a) => a.email).filter(Boolean);
	const ids = rows.map((a) => a.id);

	// Look up names for the foreign keys the roster displays. Teams and
	// decisions are V1 tables; treat their absence as "no data".
	const [jobsRes, teamsRes, interviewsRes, decisionsRes] = await Promise.all([
		supabase.from('job_posting').select('id, name').eq('org_id', orgId),
		supabase.from('teams').select('*').eq('org_id', orgId),
		supabase
			.from('interviews')
			.select(`${INTERVIEW_COLUMNS}, applicant, applicant_id`)
			.eq('org_id', orgId)
			.in('applicant', emails.length > 0 ? emails : ['']),
		supabase.from('decisions').select('*').eq('org_id', orgId).in('applicant_id', ids)
	]);

	const jobNames = new Map<number, string>(
		((jobsRes.data as { id: number; name: string }[] | null) ?? []).map((j) => [j.id, j.name])
	);
	const teams = (teamsRes.data as Team[] | null) ?? [];
	const teamsById = new Map(teams.map((t) => [t.id, t]));

	// Linked interviews are keyed by the application they belong to; only the
	// unlinked (legacy) ones fall back to the email join. See sortInterviews'
	// comment for why this distinction must not be collapsed.
	type InterviewJoinRow = InterviewLite & { applicant: string | null; applicant_id: number | null };
	const interviewsByApplicantId = new Map<number, InterviewLite[]>();
	const legacyInterviewsByEmail = new Map<string, InterviewLite[]>();
	for (const iv of (interviewsRes.data as InterviewJoinRow[] | null) ?? []) {
		if (iv.applicant_id !== null && iv.applicant_id !== undefined) {
			const list = interviewsByApplicantId.get(iv.applicant_id) ?? [];
			list.push(iv);
			interviewsByApplicantId.set(iv.applicant_id, list);
			continue;
		}
		if (!iv.applicant) continue;
		const key = iv.applicant.toLowerCase();
		const list = legacyInterviewsByEmail.get(key) ?? [];
		list.push(iv);
		legacyInterviewsByEmail.set(key, list);
	}

	const decisionsByApplicant = new Map<number, Decision[]>();
	for (const d of (decisionsRes.data as Decision[] | null) ?? []) {
		const list = decisionsByApplicant.get(d.applicant_id) ?? [];
		list.push(d);
		decisionsByApplicant.set(d.applicant_id, list);
	}

	return rows.map((a) => {
		const interviews = sortInterviews([
			...(interviewsByApplicantId.get(a.id) ?? []),
			...(legacyInterviewsByEmail.get(a.email.toLowerCase()) ?? [])
		]);
		const ratings = interviews
			.map((iv) => readEvaluation(iv)?.rating)
			.filter((r): r is number => typeof r === 'number' && r > 0);

		const team = resolveApplicationTeam(a, teams);

		const decisions = (decisionsByApplicant.get(a.id) ?? []).map((d) => ({
			...d,
			team_name: teamsById.get(d.team_id)?.name ?? null
		}));

		const row: CandidateRow = {
			...a,
			job_name: a.job !== null ? (jobNames.get(a.job) ?? null) : null,
			team,
			team_names: team.all_names,
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

	const [draftRes, interviewsRes, legacyInterviewsRes, decisionsRes, teamsRes, emailRes] =
		await Promise.all([
			supabase
				.from('application_drafts')
				.select('created_at, updated_at, submitted_at')
				.eq('org_id', orgId)
				.eq('email', applicant.email)
				.order('created_at', { ascending: true }),
			// Same rule as the roster: this application's own interviews, plus the
			// legacy unlinked ones for this email. Never a sibling's.
			supabase
				.from('interviews')
				.select(INTERVIEW_COLUMNS)
				.eq('org_id', orgId)
				.eq('applicant_id', applicant.id)
				.order('start_time', { ascending: true }),
			supabase
				.from('interviews')
				.select(INTERVIEW_COLUMNS)
				.eq('org_id', orgId)
				.eq('applicant', applicant.email)
				.is('applicant_id', null)
				.order('start_time', { ascending: true }),
			supabase.from('decisions').select('*').eq('applicant_id', applicant.id),
			supabase.from('teams').select('id, name, slug').eq('org_id', orgId),
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

	// One application, one team. A legacy combined row is labelled as such
	// rather than being flattened into a list that reads like three separate
	// applications.
	const timelineTeams = (teamsRes.data as TeamRef[] | null) ?? [];
	const appliedTeam = resolveApplicationTeam(applicant, timelineTeams);
	events.push({
		kind: 'applied',
		at: applicant.created_at,
		title: 'Application submitted',
		detail: appliedTeam.legacy_multi
			? `Legacy combined application — submitted before applications were split per team (${appliedTeam.all_names.join(', ')})`
			: appliedTeam.name
				? `Applied to ${appliedTeam.name}`
				: undefined
	});

	const interviews = sortInterviews([
		...((interviewsRes.data as InterviewLite[] | null) ?? []),
		...((legacyInterviewsRes.data as InterviewLite[] | null) ?? [])
	]);
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

/* ------------------------------------------------------------------ *
 * Submission siblings
 * ------------------------------------------------------------------ */

/** One of the OTHER applications created by the same submit. */
export interface SubmissionSibling {
	id: number;
	team_id: number | null;
	team_name: string | null;
	status: Applicant['status'];
}

/**
 * The other applications the same person created in the same submit.
 *
 * This exists for one narrow purpose: a quiet "also applied to X" note on the
 * single-candidate view, so a reviewer who needs it can navigate sideways.
 * It is deliberately NOT part of a candidate's identity — never merge siblings
 * into one row, never list their teams on the roster or in the review queue,
 * and never sum their interviews, votes or ratings. Each application is judged
 * on its own.
 *
 * Returns [] when the row predates `submission_group`, when it was the only
 * application in its submit, or when the column is missing.
 */
export const getSubmissionSiblings = async (
	orgId: number,
	applicant: Pick<Applicant, 'id' | 'submission_group'>
): Promise<SubmissionSibling[]> => {
	if (!applicant.submission_group) return [];

	const [siblingRes, teamsRes] = await Promise.all([
		supabase
			.from('applicants')
			.select('id, team_id, status, selected_team_slugs')
			.eq('org_id', orgId)
			.eq('submission_group', applicant.submission_group)
			.neq('id', applicant.id),
		supabase.from('teams').select('*').eq('org_id', orgId)
	]);

	if (siblingRes.error) {
		console.warn('submission siblings unavailable:', siblingRes.error.message);
		return [];
	}

	const teams = (teamsRes.data as Team[] | null) ?? [];
	type SiblingRow = Pick<Applicant, 'id' | 'team_id' | 'status' | 'selected_team_slugs'>;

	return ((siblingRes.data as SiblingRow[] | null) ?? []).map((row) => {
		const team = resolveApplicationTeam(row, teams);
		return {
			id: row.id,
			team_id: row.team_id,
			team_name: team.name,
			status: row.status
		};
	});
};

/**
 * The interviews belonging to ONE application.
 *
 * Same rule as the roster and the timeline: `applicant_id` (migration 00026)
 * is authoritative, and the email join is the fallback only for unlinked
 * legacy rows. Exported so the candidate page's evaluation summary cannot
 * drift back into showing a sibling application's interviews and averaging
 * their ratings into this team's decision.
 */
export const getApplicationInterviews = async (
	orgId: number,
	applicant: Pick<Applicant, 'id' | 'email'>
): Promise<InterviewLite[]> => {
	const [linkedRes, legacyRes] = await Promise.all([
		supabase
			.from('interviews')
			.select(INTERVIEW_COLUMNS)
			.eq('org_id', orgId)
			.eq('applicant_id', applicant.id),
		supabase
			.from('interviews')
			.select(INTERVIEW_COLUMNS)
			.eq('org_id', orgId)
			.eq('applicant', applicant.email)
			.is('applicant_id', null)
	]);

	if (linkedRes.error) console.warn('interviews unavailable:', linkedRes.error.message);

	return sortInterviews([
		...((linkedRes.data as InterviewLite[] | null) ?? []),
		...((legacyRes.data as InterviewLite[] | null) ?? [])
	]);
};
