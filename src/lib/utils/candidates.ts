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
import {
	readEvaluation as readEvaluationPayload,
	evaluationScore
} from '$lib/utils/interviewForms';
import type { Evaluation } from '$lib/utils/interviewForms';
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

/**
 * The applicant columns the roster reads. Deliberately NOT `*`: `recruitInfo`
 * (every answer on the form) and `comments` (every reviewer note) are ~80% of
 * an applicant row, and the list shows neither — selecting them made the
 * roster download ~3.8 MB for ~700 applications. `first_comment` is the first
 * reviewer note or null, which is all `deriveStage` needs to know.
 */
const ROSTER_APPLICANT_COLUMNS =
	'id, created_at, name, email, status, job, org_id, team_id, selected_team_slugs, ' +
	'team_rank, submission_group, prior_team_id, pass_screen, accepted_role, ' +
	'first_comment:comments->comments->0';

/** The slice of an applicant the roster carries. Open the profile for the rest. */
export type RosterApplicant = Omit<Applicant, 'recruitInfo' | 'comments' | 'metadata'>;

export interface CandidateRow extends RosterApplicant {
	/** At least one reviewer comment has been left on this application. */
	has_review_comments: boolean;
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
	end_time: string | null;
	created_at: string;
	interviewer: string | null;
	location: string | null;
	type: string | null;
	comments: Record<string, unknown> | null;
}

const INTERVIEW_COLUMNS =
	'id, start_time, end_time, created_at, interviewer, location, type, comments';

/**
 * Which interviews belong to a candidate: the PERSON, not one application.
 *
 * Since migration 00024 an application is per team, so someone who picked Juvo
 * and Terra has two applications. But they sit ONE interview round — the
 * schedule interviews each person once — and the rows are linked (via
 * `interviews.applicant_id`, 00026) to whichever application was scheduled.
 * Scoping interviews to that single application left the sibling looking
 * un-interviewed: Terra's reviewers saw no scores for a candidate who had four.
 *
 * So a candidate's interviews are those linked to ANY of their applications
 * for the same posting (same org, same job, same email). The job bound keeps a
 * returning applicant's interviews from an earlier cycle out. Legacy rows with
 * no `applicant_id` still match by email: they predate the split.
 *
 * Votes, comments and decisions stay per application — only the interview
 * record, which genuinely is shared, is shown on each.
 */
const personKey = (job: number | null, email: string) => `${job ?? ''}|${email.toLowerCase()}`;

/** `ilike` treats `_` and `%` as wildcards; an email may contain `_`. */
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Every row a query matches, paged past PostgREST's 1000-row response cap.
 * A plain select stops at 1000 WITHOUT an error, which silently drops rows once
 * an org has more than one cycle on file. `build` must apply a stable order.
 */
async function fetchAllRows<T>(
	build: () => {
		range: (
			from: number,
			to: number
		) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
	}
): Promise<{ rows: T[]; error: { message: string } | null }> {
	const PAGE = 1000;
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build().range(from, from + PAGE - 1);
		if (error) return { rows, error };
		rows.push(...((data ?? []) as T[]));
		if (!data || data.length < PAGE) return { rows, error: null };
	}
}

/** Every interview row in an org. Failure-tolerant: a failed read is "no interviews". */
async function fetchAllInterviews<T>(orgId: number, columns: string): Promise<T[]> {
	const { rows, error } = await fetchAllRows<T>(() =>
		supabase.from('interviews').select(columns).eq('org_id', orgId).order('id', { ascending: true })
	);
	if (error) console.warn('interviews unavailable:', error.message);
	return rows;
}

function sortInterviews(list: InterviewLite[]): InterviewLite[] {
	return [...list].sort(
		(x, y) => new Date(x.start_time).getTime() - new Date(y.start_time).getTime()
	);
}

/**
 * Read an interview's evaluation, whichever form it was filled on.
 *
 * Three shapes coexist: the pre-2026 single 1-5 star rating, and the individual
 * and group forms added for Fall 2026. `readEvaluationPayload` normalizes all
 * three; `evaluationScore` puts them on one 1-10 scale so a roster mixing old
 * and new interviews can still be sorted by score.
 */
function readEvaluation(iv: InterviewLite): Evaluation | null {
	return readEvaluationPayload(iv.comments?.evaluation);
}

/** One interviewer's part in a session, with what they submitted. */
export interface SessionEntry {
	interview: InterviewLite;
	evaluation: Evaluation | null;
	/** 1-10, null until scored. */
	score: number | null;
}

/**
 * One sitting: a candidate in a room at a time.
 *
 * A group interview is stored one row per (candidate × interviewer), so three
 * interviewers on one group are three rows. Listed raw they read as "Round 2,
 * Round 3, Round 4 interview" — all at the same minute in the same room. This
 * folds them back into the single interview the candidate actually sat, with
 * each interviewer's evaluation inside it.
 */
export interface InterviewSession {
	key: string;
	type: string;
	start_time: string;
	end_time: string | null;
	location: string | null;
	created_at: string;
	entries: SessionEntry[];
}

export function groupInterviewSessions(interviews: InterviewLite[]): InterviewSession[] {
	const sessions = new Map<string, InterviewSession>();
	for (const iv of sortInterviews(interviews)) {
		// Only group rows share a session; two individual rows at the same time
		// would be separate interviews (and a scheduling error worth seeing).
		const key =
			iv.type === 'group'
				? `group|${iv.location}|${new Date(iv.start_time).getTime()}`
				: `row|${iv.id}`;
		let session = sessions.get(key);
		if (!session) {
			session = {
				key,
				type: iv.type ?? 'individual',
				start_time: iv.start_time,
				end_time: iv.end_time,
				location: iv.location,
				created_at: iv.created_at,
				entries: []
			};
			sessions.set(key, session);
		}
		const evaluation = readEvaluation(iv);
		session.entries.push({ interview: iv, evaluation, score: evaluationScore(evaluation) });
		if (iv.created_at < session.created_at) session.created_at = iv.created_at;
	}
	for (const session of sessions.values()) {
		session.entries.sort((a, b) =>
			(a.interview.interviewer ?? '').localeCompare(b.interview.interviewer ?? '')
		);
	}
	return [...sessions.values()];
}

export const sessionLabel = (type: string) =>
	type === 'group'
		? 'Group interview'
		: type === 'individual'
			? 'Individual interview'
			: 'Interview';

/**
 * Fetch every applicant for an org, enriched with pipeline state.
 * Pass `jobId` to scope to a single posting.
 *
 * Every query runs in parallel, and each selects only what the roster shows —
 * see ROSTER_APPLICANT_COLUMNS. The result is also kept in memory so a page can
 * paint the last roster instantly and refresh behind it (`peekCandidates`).
 */
export const getCandidates = async (
	orgId: number,
	jobId?: number | null
): Promise<CandidateRow[]> => {
	type RosterRow = RosterApplicant & { first_comment: unknown };
	type RosterInterview = InterviewLite & { applicant: string | null; applicant_id: number | null };

	const [applicantsRes, jobsRes, teamsRes, interviewsRes, decisionsRes] = await Promise.all([
		fetchAllRows<RosterRow>(() => {
			let query = supabase
				.from('applicants')
				.select(ROSTER_APPLICANT_COLUMNS)
				.eq('org_id', orgId)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false });
			if (jobId) query = query.eq('job', jobId);
			return query;
		}),
		// Look up names for the foreign keys the roster displays. Teams and
		// decisions are V1 tables; treat their absence as "no data".
		supabase.from('job_posting').select('id, name').eq('org_id', orgId),
		supabase.from('teams').select('*').eq('org_id', orgId),
		// Only the evaluation is read out of `comments`; the rest of the column
		// (a rescheduled row's no-show history, say) never leaves the database.
		fetchAllInterviews<Omit<RosterInterview, 'comments'> & { evaluation: unknown }>(
			orgId,
			'id, start_time, end_time, created_at, type, applicant, applicant_id, evaluation:comments->evaluation'
		),
		// Filtered by org rather than `.in(applicant ids)`: hundreds of ids in a
		// query string is a URL-length failure waiting to happen.
		supabase.from('decisions').select('*').eq('org_id', orgId)
	]);

	if (applicantsRes.error) throw applicantsRes.error;
	const rows = applicantsRes.rows;
	if (rows.length === 0) {
		rosterCache.set(cacheKey(orgId, jobId), []);
		return [];
	}

	const jobNames = new Map<number, string>(
		((jobsRes.data as { id: number; name: string }[] | null) ?? []).map((j) => [j.id, j.name])
	);
	const teams = (teamsRes.data as Team[] | null) ?? [];
	const teamsById = new Map(teams.map((t) => [t.id, t]));
	if (decisionsRes.error) console.warn('decisions unavailable:', decisionsRes.error.message);

	// Linked interviews belong to the PERSON the application is for, so every one
	// of their applications for the posting shows them; only unlinked (legacy)
	// rows fall back to the email join. See personKey's comment.
	// Applicant email is normalized to lowercase on write since 00025, but older
	// rows carry mixed case, so every email match here is done case-insensitively.
	const personOfApp = new Map(rows.map((a) => [a.id, personKey(a.job, a.email)]));
	const interviewsByPerson = new Map<string, InterviewLite[]>();
	const legacyInterviewsByEmail = new Map<string, InterviewLite[]>();
	for (const raw of interviewsRes) {
		const { evaluation, ...rest } = raw;
		const iv: RosterInterview = {
			...rest,
			interviewer: null,
			location: null,
			comments: evaluation === null || evaluation === undefined ? null : { evaluation }
		};
		if (iv.applicant_id !== null && iv.applicant_id !== undefined) {
			const person = personOfApp.get(iv.applicant_id);
			if (!person) continue; // an application outside this roster's scope
			const list = interviewsByPerson.get(person) ?? [];
			list.push(iv);
			interviewsByPerson.set(person, list);
			continue;
		}
		if (!iv.applicant) continue;
		const key = iv.applicant.toLowerCase();
		const list = legacyInterviewsByEmail.get(key) ?? [];
		list.push(iv);
		legacyInterviewsByEmail.set(key, list);
	}

	const inRoster = new Set(rows.map((a) => a.id));
	const decisionsByApplicant = new Map<number, Decision[]>();
	for (const d of (decisionsRes.data as Decision[] | null) ?? []) {
		if (!inRoster.has(d.applicant_id)) continue;
		const list = decisionsByApplicant.get(d.applicant_id) ?? [];
		list.push(d);
		decisionsByApplicant.set(d.applicant_id, list);
	}

	const result = rows.map(({ first_comment, ...a }) => {
		const interviews = sortInterviews([
			...(interviewsByPerson.get(personKey(a.job, a.email)) ?? []),
			...(legacyInterviewsByEmail.get(a.email.toLowerCase()) ?? [])
		]);
		const evaluations = interviews.map(readEvaluation);
		// Normalised to 1-10 across both form generations — see evaluationScore().
		const ratings = evaluations
			.map((e) => evaluationScore(e))
			.filter((r): r is number => typeof r === 'number' && r > 0);

		const team = resolveApplicationTeam(a, teams);

		const decisions = (decisionsByApplicant.get(a.id) ?? []).map((d) => ({
			...d,
			team_name: teamsById.get(d.team_id)?.name ?? null
		}));

		const row: CandidateRow = {
			...a,
			has_review_comments: first_comment !== null && first_comment !== undefined,
			job_name: a.job !== null ? (jobNames.get(a.job) ?? null) : null,
			team,
			team_names: team.all_names,
			interview_count: interviews.length,
			evaluated_count: evaluations.filter((e) => e !== null).length,
			latest_round: interviews.length,
			avg_rating: ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
			decisions,
			stage: 'applied',
			hire_conflict: decisions.filter((d) => d.outcome === 'hire').length > 1
		};
		row.stage = deriveStage(row);
		return row;
	});

	rosterCache.set(cacheKey(orgId, jobId), result);
	return result;
};

/**
 * The last roster `getCandidates` returned for this scope, or null.
 *
 * In memory only, so it lasts for the tab's session and survives client-side
 * navigation (open a candidate, come back) but not a reload. Applicant names,
 * emails and scores are deliberately kept out of browser storage. Callers
 * render this immediately and then call `getCandidates` to refresh it.
 */
export const peekCandidates = (orgId: number, jobId?: number | null): CandidateRow[] | null =>
	rosterCache.get(cacheKey(orgId, jobId)) ?? null;

const rosterCache = new Map<string, CandidateRow[]>();
const cacheKey = (orgId: number, jobId?: number | null) => `${orgId}|${jobId ?? 'all'}`;

/** Derive a pipeline stage from the candidate's aggregated state. */
export function deriveStage(row: CandidateRow): CandidateStage {
	if (row.status === 'denied') return 'rejected';
	if (row.decisions.length > 0) return 'decided';
	if (row.status === 'accepted') return 'decided';
	if (row.interview_count > 0) {
		return row.evaluated_count >= row.interview_count ? 'evaluated' : 'interviewing';
	}
	if (row.has_review_comments) return 'reviewed';
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

	const [draftRes, personInterviews, decisionsRes, teamsRes, emailRes] = await Promise.all([
		supabase
			.from('application_drafts')
			.select('created_at, updated_at, submitted_at')
			.eq('org_id', orgId)
			.eq('email', applicant.email)
			.order('created_at', { ascending: true }),
		// Same rule as the roster: the person's interviews, shared by every one
		// of their applications for this posting.
		getPersonInterviews(orgId, applicant),
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

	for (const session of groupInterviewSessions(personInterviews)) {
		const label = sessionLabel(session.type);
		const interviewers = session.entries
			.map((e) => e.interview.interviewer)
			.filter(Boolean)
			.join(', ');
		events.push({
			kind: 'interview_scheduled',
			at: session.created_at,
			title: `${label} scheduled`,
			detail: session.location ?? undefined,
			actor: interviewers || undefined
		});
		events.push({
			kind: 'interview',
			at: session.start_time,
			title: label,
			detail: session.location ?? undefined,
			actor: interviewers || undefined
		});
		for (const entry of session.entries) {
			if (!entry.evaluation) continue;
			events.push({
				kind: 'evaluation',
				at: entry.evaluation.evaluatedAt || session.start_time,
				title: `${label} evaluated`,
				detail: entry.score === null ? 'Not scored' : `${entry.score.toFixed(1)}/10`,
				actor: entry.evaluation.evaluator || entry.interview.interviewer || undefined,
				tag:
					entry.evaluation.form === 'legacy'
						? entry.evaluation.recommendation
						: entry.evaluation.form
			});
		}
	}

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
 * and never sum their votes or decisions. Each application is judged on its
 * own. The one exception is the interview record: the person sat it once, so
 * every sibling shows it (see getPersonInterviews).
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
 * The interviews belonging to a candidate — every one of their applications
 * for this posting shares them. See sortInterviews' comment for the rule.
 */
export const getPersonInterviews = async (
	orgId: number,
	applicant: Pick<Applicant, 'id' | 'email' | 'job'>
): Promise<InterviewLite[]> => {
	let siblingsQuery = supabase
		.from('applicants')
		.select('id')
		.eq('org_id', orgId)
		.ilike('email', likeLiteral(applicant.email));
	siblingsQuery =
		applicant.job !== null ? siblingsQuery.eq('job', applicant.job) : siblingsQuery.is('job', null);
	const { data: siblingRows, error: siblingError } = await siblingsQuery;
	if (siblingError) console.warn('sibling applications unavailable:', siblingError.message);
	const ids = [
		...new Set([applicant.id, ...((siblingRows as { id: number }[] | null) ?? []).map((r) => r.id)])
	];

	const [linkedRes, legacyRes] = await Promise.all([
		supabase
			.from('interviews')
			.select(INTERVIEW_COLUMNS)
			.eq('org_id', orgId)
			.in('applicant_id', ids),
		supabase
			.from('interviews')
			.select(INTERVIEW_COLUMNS)
			.eq('org_id', orgId)
			.ilike('applicant', likeLiteral(applicant.email))
			.is('applicant_id', null)
	]);

	if (linkedRes.error) console.warn('interviews unavailable:', linkedRes.error.message);

	return sortInterviews([
		...((linkedRes.data as InterviewLite[] | null) ?? []),
		...((legacyRes.data as InterviewLite[] | null) ?? [])
	]);
};
