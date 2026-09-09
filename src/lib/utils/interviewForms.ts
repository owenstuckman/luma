// Interview evaluation forms — the question bank, the rating scale, and the
// shape of what gets stored on `interviews.comments.evaluation`.
//
// Pure data and pure functions only: no DB, no DOM. The recruiter UI renders
// from these definitions, and a later server-side tally can read the same
// payloads without importing any component.
//
// Two forms, chosen by `interviews.type`:
//
//   individual — the long form. Prompts the interviewer through the behavioural
//                questions, then scores three dimensions.
//   group      — scored once per applicant PER interviewer. The batch scheduler
//                already emits one `interviews` row for every
//                (applicant × interviewer) pair in a room, so "each recruiter
//                fills a form for each applicant" needs no new table: it is one
//                row, one payload.

/**
 * The only scores an interviewer may give. Deliberately not 1-10: the gaps
 * force a decision rather than letting everyone cluster on 6/7, and it is the
 * scale Archimedes already used on paper.
 */
export const RATING_SCALE = [1, 3, 5, 7, 10] as const;
export type RatingValue = (typeof RATING_SCALE)[number];

export interface BehavioralQuestion {
	id: string;
	text: string;
}

/** Asked when probing for success stories. The interviewer picks any subset. */
export const SUCCESS_QUESTIONS: BehavioralQuestion[] = [
	{ id: 's_new', text: 'Tell me about a time when you had to learn something totally new.' },
	{
		id: 's_gap',
		text: 'Tell me about a time when there was a gap between your school learning and the necessary skills to complete a task.'
	},
	{ id: 's_priorities', text: 'Tell me about a time when you had to balance priorities.' },
	{ id: 's_event', text: 'Tell me about an event that you planned and organized.' },
	{
		id: 's_guided',
		text: 'Tell me about a time when you guided individuals toward achieving a goal.'
	}
];

/** Asked when probing for failure//reflection stories. Any subset. */
export const FAILURE_QUESTIONS: BehavioralQuestion[] = [
	{ id: 'f_weaknesses', text: 'Tell me about a time when you faced your weaknesses.' },
	{ id: 'f_recovered', text: 'Tell me about a time when you recovered from a failure.' },
	{
		id: 'f_obstacles',
		text: 'Tell me about a time when you faced a lot of obstacles towards achieving a goal.'
	},
	{
		id: 'f_letdown',
		text: 'Tell me about a time that you failed or let others down. How did you handle the situation, and what did you get from it?'
	},
	{ id: 'f_biggest', text: 'Tell me about your biggest weakness.' }
];

/** Read aloud verbatim, so they live here rather than in the markup. */
export const UNIVERSAL_Q1 = 'Tell us a little bit about yourself.';
export const UNIVERSAL_Q1_TIME = '1 min';
export const UNIVERSAL_Q2 =
	'Tell me about a time when you had trouble seeing eye to eye with a colleague.';
export const UNIVERSAL_Q2_TIME = '3 min';

export interface RatingPrompt {
	key: string;
	label: string;
}

export const INDIVIDUAL_RATINGS: RatingPrompt[] = [
	{ key: 'passion', label: 'How excited/passionate were they about what they were talking about?' },
	{ key: 'self_awareness', label: 'How well do they demonstrate self-awareness + growth?' },
	{ key: 'success', label: 'How well do you think they would succeed in Archimedes?' }
];

export const GROUP_RATINGS: RatingPrompt[] = [
	{ key: 'conflict', label: 'Their ability to handle conflict within the group' },
	{ key: 'on_track', label: 'Their ability to keep the team on track / making progress' },
	{ key: 'contribution', label: 'Their ability to contribute effectively/fairly in the group' }
];

/** Ratings keyed by prompt key. A missing key means "not scored yet". */
export type RatingMap = Record<string, number>;

export interface IndividualEvaluation {
	form: 'individual';
	/** Behavioural questions the interviewer actually asked. */
	successQuestions: string[];
	failureQuestions: string[];
	otherQuestions: string;
	notes: string;
	ratings: RatingMap;
	evaluator: string;
	evaluatedAt: string;
}

export interface GroupEvaluation {
	form: 'group';
	notes: string;
	ratings: RatingMap;
	evaluator: string;
	evaluatedAt: string;
}

/**
 * The pre-2026 shape: a single 1-5 star rating plus free text. Still present on
 * older interview rows, so everything that reads evaluations has to tolerate it
 * rather than assume the new form.
 */
export interface LegacyEvaluation {
	form: 'legacy';
	rating: number;
	strengths: string;
	weaknesses: string;
	notes: string;
	recommendation: string;
	evaluator: string;
	evaluatedAt: string;
}

export type Evaluation = IndividualEvaluation | GroupEvaluation | LegacyEvaluation;

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function ratingMap(v: unknown): RatingMap {
	if (typeof v !== 'object' || v === null) return {};
	const out: RatingMap = {};
	for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
		if (typeof val === 'number' && Number.isFinite(val) && val > 0) out[k] = val;
	}
	return out;
}

/**
 * Normalize whatever is on an interview row into one of the three shapes.
 * Returns null when the interview has not been evaluated.
 *
 * Never throws: this reads recruiter-entered JSON that predates the current
 * schema, and a malformed row must not take the evaluate page down with it.
 */
export function readEvaluation(raw: unknown): Evaluation | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const e = raw as Record<string, unknown>;

	const evaluator = str(e.evaluator);
	const evaluatedAt = str(e.evaluatedAt);

	if (e.form === 'individual') {
		return {
			form: 'individual',
			successQuestions: strArray(e.successQuestions),
			failureQuestions: strArray(e.failureQuestions),
			otherQuestions: str(e.otherQuestions),
			notes: str(e.notes),
			ratings: ratingMap(e.ratings),
			evaluator,
			evaluatedAt
		};
	}

	if (e.form === 'group') {
		return {
			form: 'group',
			notes: str(e.notes),
			ratings: ratingMap(e.ratings),
			evaluator,
			evaluatedAt
		};
	}

	// No `form` key at all — the old star rating.
	if (typeof e.rating === 'number') {
		return {
			form: 'legacy',
			rating: e.rating,
			strengths: str(e.strengths),
			weaknesses: str(e.weaknesses),
			notes: str(e.notes),
			recommendation: str(e.recommendation),
			evaluator,
			evaluatedAt
		};
	}

	return null;
}

/**
 * One number for an evaluation, on the 1-10 scale, or null when unscored.
 *
 * Legacy 1-5 stars are doubled so a mixed cycle can still be sorted in one
 * column. That is a lossy comparison — a 5-star and a 10 are not the same
 * judgement — so label it as approximate wherever both shapes can appear.
 */
export function evaluationScore(evaluation: Evaluation | null): number | null {
	if (!evaluation) return null;
	if (evaluation.form === 'legacy') return evaluation.rating > 0 ? evaluation.rating * 2 : null;

	const values = Object.values(evaluation.ratings).filter((n) => n > 0);
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/** True once every prompt for this form has a score. Drives "complete" state. */
export function isComplete(evaluation: Evaluation | null): boolean {
	if (!evaluation) return false;
	if (evaluation.form === 'legacy') return evaluation.rating > 0;
	const prompts = evaluation.form === 'individual' ? INDIVIDUAL_RATINGS : GROUP_RATINGS;
	return prompts.every((p) => (evaluation.ratings[p.key] ?? 0) > 0);
}

/** Question text for a stored id, for rendering a saved evaluation back. */
export function questionText(id: string): string {
	return [...SUCCESS_QUESTIONS, ...FAILURE_QUESTIONS].find((q) => q.id === id)?.text ?? id;
}
