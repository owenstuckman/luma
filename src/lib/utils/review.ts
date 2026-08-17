// Review-stage logic: vote tallying, thresholds, weighted scoring, and blinded
// redaction. Pure functions over data the caller has already fetched, so the
// same code can run in the reviewer UI and (later) in a server endpoint that
// auto-advances applicants.

import type { Applicant, CommentEntry, FormQuestion, QuestionSchema } from '$lib/types';
import type { ReviewThresholds } from '$lib/types/orgSettings';

/* ------------------------------------------------------------------ *
 * Votes
 * ------------------------------------------------------------------ */

export type Vote = 'approve' | 'reject' | 'neutral';

// `CommentEntry.decision` is a free-form string that different parts of the app
// have historically written differently ('positive'/'negative' from the review
// page's bulk-note action, 'accepted'/'denied' from the candidate page status
// picker). Normalize rather than migrate, so old comments still count.
const APPROVE_WORDS = new Set(['approve', 'approved', 'positive', 'accepted', 'accept', 'yes']);
const REJECT_WORDS = new Set(['reject', 'rejected', 'negative', 'denied', 'deny', 'no']);

export function normalizeVote(decision: string | null | undefined): Vote {
	const d = (decision ?? '').trim().toLowerCase();
	if (APPROVE_WORDS.has(d)) return 'approve';
	if (REJECT_WORDS.has(d)) return 'reject';
	return 'neutral';
}

export interface VoteTally {
	approve: number;
	reject: number;
	neutral: number;
	/** Sum of reviewer weights, used when weighted_scoring is on. */
	weightedApprove: number;
	weightedReject: number;
	/** One entry per reviewer, last vote wins. */
	voters: { email: string; vote: Vote; weight: number }[];
}

/**
 * Tally the votes on an applicant.
 *
 * A reviewer who comments more than once counts once — their *last* vote wins.
 * Without that, someone revising their opinion would be double-counted and
 * could single-handedly cross a threshold.
 */
export function tallyVotes(
	comments: CommentEntry[] | null | undefined,
	weights: Record<string, number> = {}
): VoteTally {
	const lastByVoter = new Map<string, Vote>();
	for (const c of comments ?? []) {
		const email = (c.email ?? '').trim().toLowerCase();
		if (!email) continue;
		lastByVoter.set(email, normalizeVote(c.decision));
	}

	const tally: VoteTally = {
		approve: 0,
		reject: 0,
		neutral: 0,
		weightedApprove: 0,
		weightedReject: 0,
		voters: []
	};

	for (const [email, vote] of lastByVoter) {
		const weight = weights[email] ?? 1;
		tally[vote] += 1;
		if (vote === 'approve') tally.weightedApprove += weight;
		if (vote === 'reject') tally.weightedReject += weight;
		tally.voters.push({ email, vote, weight });
	}

	return tally;
}

export type ReviewOutcome = 'advance' | 'deny' | 'pending';

/**
 * Has this applicant crossed a threshold?
 *
 * Rejection is checked first: when an applicant somehow satisfies both
 * thresholds, the safer read is that opinion is split, and a split decision
 * should not silently advance someone into interviews.
 */
export function thresholdOutcome(tally: VoteTally, thresholds: ReviewThresholds): ReviewOutcome {
	const approve = thresholds.weighted_scoring ? tally.weightedApprove : tally.approve;
	const reject = thresholds.weighted_scoring ? tally.weightedReject : tally.reject;

	if (thresholds.reject_to_deny > 0 && reject >= thresholds.reject_to_deny) return 'deny';
	if (thresholds.approve_to_advance > 0 && approve >= thresholds.approve_to_advance)
		return 'advance';
	return 'pending';
}

/** The applicant status a crossed threshold implies, or null to leave it alone. */
export function outcomeToStatus(outcome: ReviewOutcome): Applicant['status'] | null {
	if (outcome === 'advance') return 'interview';
	if (outcome === 'deny') return 'denied';
	return null;
}

/** How many more votes are needed either way — drives the progress UI. */
export function votesRemaining(
	tally: VoteTally,
	thresholds: ReviewThresholds
): { toAdvance: number; toDeny: number } {
	const approve = thresholds.weighted_scoring ? tally.weightedApprove : tally.approve;
	const reject = thresholds.weighted_scoring ? tally.weightedReject : tally.reject;
	return {
		toAdvance: Math.max(0, thresholds.approve_to_advance - approve),
		toDeny: Math.max(0, thresholds.reject_to_deny - reject)
	};
}

/**
 * Reviewer weights keyed by lowercased email, read from
 * `org_members.metadata.review_weight`. Anything missing or malformed falls
 * back to 1 so a bad value can't silently erase someone's vote.
 */
export function buildWeightMap(
	members: { email?: string | null; metadata?: Record<string, unknown> | null }[]
): Record<string, number> {
	const map: Record<string, number> = {};
	for (const m of members) {
		const email = (m.email ?? '').trim().toLowerCase();
		if (!email) continue;
		const raw = m.metadata?.review_weight;
		const n = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
		map[email] = n;
	}
	return map;
}

/* ------------------------------------------------------------------ *
 * Blinded review
 * ------------------------------------------------------------------ */

export interface RedactedApplicant {
	id: number;
	created_at: string;
	name: string;
	email: string;
	status: Applicant['status'];
	recruitInfo: Record<string, string> | null;
	/** True when anything was withheld, so the UI can say so. */
	redacted: boolean;
	/** Question ids withheld because they are marked `blinded`. */
	redactedQuestionIds: string[];
}

const REDACTED = '[hidden]';

/**
 * Strip identifying information for a blinded reviewer.
 *
 * Withholds the applicant's name and email, plus any answer whose question is
 * flagged `blinded` in the schema. Advisors and admins are expected to call
 * this with `blinded: false` — the decision of *who* gets redacted belongs to
 * the caller, which knows the viewer's roles.
 */
export function redactApplicant(
	applicant: Applicant,
	schema: QuestionSchema | null | undefined,
	blinded: boolean
): RedactedApplicant {
	const base: RedactedApplicant = {
		id: applicant.id,
		created_at: applicant.created_at,
		name: applicant.name,
		email: applicant.email,
		status: applicant.status,
		recruitInfo: applicant.recruitInfo,
		redacted: false,
		redactedQuestionIds: []
	};

	if (!blinded) return base;

	const blindedIds = (schema?.steps ?? [])
		.flatMap((s) => s.questions ?? [])
		.filter((q: FormQuestion) => q.blinded)
		.map((q) => q.id);

	const info: Record<string, string> = { ...(applicant.recruitInfo ?? {}) };
	const withheld: string[] = [];
	for (const id of blindedIds) {
		if (id in info) {
			info[id] = REDACTED;
			withheld.push(id);
		}
	}

	return {
		...base,
		name: `Applicant #${applicant.id}`,
		email: REDACTED,
		recruitInfo: info,
		redacted: true,
		redactedQuestionIds: withheld
	};
}

/**
 * Should this viewer see the blinded version?
 *
 * Blinded review only applies to someone whose *only* review-relevant role is
 * `reviewer`. Advisors, admins, and owners own the decision and need identity,
 * so they always see the real record.
 */
export function shouldBlind(roles: string[], thresholds: ReviewThresholds): boolean {
	if (!thresholds.blinded_review) return false;
	const privileged = ['owner', 'admin', 'advisor', 'eboard'];
	if (roles.some((r) => privileged.includes(r))) return false;
	return roles.includes('reviewer');
}
