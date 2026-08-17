// Pure logic over the question schema (`job_posting.questions`).
//
// Two V1 concerns live here, both deliberately free of DB and DOM access so they
// can run identically on the client (to hide questions as the applicant picks
// teams) and on the server (to re-evaluate auto-reject rules at submit time,
// where the client cannot be trusted):
//
//   - team_scope — which questions a given applicant actually sees
//   - reject_if  — which auto-reject rules their answers trip
//
// Answers arrive in the shape the apply page builds for `applicants.recruitInfo`:
// Record<questionId, string>, where checkbox answers are comma-joined and
// input_dual answers are "first | second".

import type { FormQuestion, FormStep, QuestionSchema, RejectRule } from '$lib/types';

/* ------------------------------------------------------------------ *
 * team_scope
 * ------------------------------------------------------------------ */

/**
 * A question is visible when it is shared (the default) or scoped to at least
 * one of the teams the applicant selected. A `team_scope` naming no teams is
 * treated as shared rather than as "visible to nobody" — an empty list is far
 * more likely to be a mis-edit than a deliberate hide.
 */
export function isQuestionVisible(q: FormQuestion, selectedTeamSlugs: string[]): boolean {
	const scope = q.team_scope;
	if (!scope || scope === 'shared') return true;
	if (!Array.isArray(scope.teams) || scope.teams.length === 0) return true;
	return scope.teams.some((slug) => selectedTeamSlugs.includes(slug));
}

/** Every question in the schema, flattened, regardless of scope. */
export function allQuestions(schema: QuestionSchema | null | undefined): FormQuestion[] {
	return (schema?.steps ?? []).flatMap((s) => s.questions ?? []);
}

/**
 * The schema as this applicant should see it: questions filtered by team scope,
 * and steps that end up empty dropped entirely so the form doesn't show a blank
 * page between two real ones.
 */
export function visibleSteps(
	schema: QuestionSchema | null | undefined,
	selectedTeamSlugs: string[]
): FormStep[] {
	return (schema?.steps ?? [])
		.map((step) => ({
			...step,
			questions: (step.questions ?? []).filter((q) => isQuestionVisible(q, selectedTeamSlugs))
		}))
		.filter((step) => step.questions.length > 0);
}

/* ------------------------------------------------------------------ *
 * reject_if
 * ------------------------------------------------------------------ */

export interface RejectMatch {
	questionId: string;
	questionTitle: string;
	rule: RejectRule;
	/** The answer as stored, for the audit trail on the applicant row. */
	answer: string;
}

/**
 * Split a stored answer into discrete values. Only the multi-select types are
 * comma-joined; splitting a free-text answer on commas would invent values that
 * the applicant never chose.
 */
function answerValues(q: FormQuestion, raw: string): string[] {
	if (q.type === 'checkbox' || q.type === 'checkbox_image') {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	const trimmed = raw.trim();
	return trimmed ? [trimmed] : [];
}

function toNumber(raw: string): number | null {
	const trimmed = raw.trim();
	// Guard the blank case explicitly: Number('') is 0, which would make a
	// `lt` rule fire on every applicant who skipped the question.
	if (!trimmed) return null;
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}

/**
 * Does this answer trip this rule?
 *
 * Safety rule: apart from `falsy`, a rule never fires on an unanswered question.
 * Auto-reject is destructive and silent, so "they skipped it" must not be
 * treated the same as "they gave the disqualifying answer" — otherwise a
 * `neq: 'Yes'` rule would reject everyone who left the field blank.
 */
export function matchesRule(rule: RejectRule, q: FormQuestion, raw: string): boolean {
	const values = answerValues(q, raw);
	const answered = values.length > 0;

	switch (rule.op) {
		case 'truthy':
			return answered;
		case 'falsy':
			return !answered;
		case 'eq':
			return answered && raw.trim() === String(rule.value);
		case 'neq':
			return answered && raw.trim() !== String(rule.value);
		case 'in':
			return answered && values.some((v) => rule.value.map(String).includes(v));
		case 'not_in':
			return answered && !values.some((v) => rule.value.map(String).includes(v));
		case 'lt': {
			const n = toNumber(raw);
			return n !== null && n < rule.value;
		}
		case 'gt': {
			const n = toNumber(raw);
			return n !== null && n > rule.value;
		}
		default:
			// Unknown op from a future schema version — never auto-reject on it.
			return false;
	}
}

/**
 * Evaluate every auto-reject rule in the schema against a submission.
 * Returns each rule that fired; an empty array means the applicant passes.
 *
 * Only questions the applicant could actually see are evaluated — a rule on a
 * question scoped to a team they didn't apply to must not reject them.
 */
export function evaluateRejectRules(
	answers: Record<string, string>,
	schema: QuestionSchema | null | undefined,
	selectedTeamSlugs: string[] = []
): RejectMatch[] {
	const matches: RejectMatch[] = [];

	for (const step of schema?.steps ?? []) {
		for (const q of step.questions ?? []) {
			if (!q.reject_if) continue;
			if (!isQuestionVisible(q, selectedTeamSlugs)) continue;

			const raw = answers[q.id] ?? '';
			if (matchesRule(q.reject_if, q, raw)) {
				matches.push({
					questionId: q.id,
					questionTitle: q.title,
					rule: q.reject_if,
					answer: raw
				});
			}
		}
	}

	return matches;
}

/** Human-readable summary for the audit trail / admin UI. */
export function describeRejectMatch(m: RejectMatch): string {
	const r = m.rule;
	switch (r.op) {
		case 'truthy':
			return `${m.questionTitle}: answered`;
		case 'falsy':
			return `${m.questionTitle}: left blank`;
		case 'eq':
			return `${m.questionTitle} = "${r.value}"`;
		case 'neq':
			return `${m.questionTitle} ≠ "${r.value}"`;
		case 'in':
			return `${m.questionTitle} is one of ${r.value.map((v) => `"${v}"`).join(', ')}`;
		case 'not_in':
			return `${m.questionTitle} is not one of ${r.value.map((v) => `"${v}"`).join(', ')}`;
		case 'lt':
			return `${m.questionTitle} < ${r.value}`;
		case 'gt':
			return `${m.questionTitle} > ${r.value}`;
		default:
			return m.questionTitle;
	}
}
