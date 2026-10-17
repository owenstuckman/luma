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
//
// The question bank and the scored prompts are per-org configuration, stored on
// `organizations.settings.interview_forms` and edited from the org settings
// panel. `DEFAULT_INTERVIEW_FORMS` is what an org gets until it changes them.
// A page that has an org loaded reads its forms with
// `resolveInterviewForms(org.settings, org.name)` rather than the defaults.

/**
 * The only scores an interviewer may give. Deliberately not 1-10: the gaps
 * force a decision rather than letting everyone cluster on 6/7. Not per-org on
 * purpose — every score model, tone and average downstream assumes this scale.
 */
export const RATING_SCALE = [1, 3, 5, 7, 10] as const;
export type RatingValue = (typeof RATING_SCALE)[number];

export interface BehavioralQuestion {
	id: string;
	text: string;
}

/** A question read aloud verbatim, with a suggested time box. */
export interface UniversalQuestion {
	text: string;
	time: string;
}

export interface RatingPrompt {
	key: string;
	label: string;
}

/**
 * One org's interview forms. Prompt keys and question ids are what stored
 * evaluations reference, so they must stay stable once interviews are scored:
 * relabel freely, but a changed key orphans every score given under the old one.
 */
export interface InterviewForms {
	/** Read before the success questions. */
	universal_1: UniversalQuestion;
	/** Read before the failure questions. */
	universal_2: UniversalQuestion;
	/** Asked when probing for success stories. The interviewer picks any subset. */
	success_questions: BehavioralQuestion[];
	/** Asked when probing for failure/reflection stories. Any subset. */
	failure_questions: BehavioralQuestion[];
	individual_ratings: RatingPrompt[];
	group_ratings: RatingPrompt[];
}

/**
 * What every org starts with. `{org}` in any text is replaced with the org's
 * name when resolved, so the defaults read naturally for every tenant.
 */
export const DEFAULT_INTERVIEW_FORMS: InterviewForms = {
	universal_1: { text: 'Tell us a little bit about yourself.', time: '1 min' },
	universal_2: {
		text: 'Tell me about a time when you had trouble seeing eye to eye with a colleague.',
		time: '3 min'
	},
	success_questions: [
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
	],
	failure_questions: [
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
	],
	individual_ratings: [
		{
			key: 'passion',
			label: 'How excited/passionate were they about what they were talking about?'
		},
		{ key: 'self_awareness', label: 'How well do they demonstrate self-awareness + growth?' },
		{ key: 'success', label: 'How well do you think they would succeed in {org}?' }
	],
	group_ratings: [
		{ key: 'conflict', label: 'Their ability to handle conflict within the group' },
		{ key: 'on_track', label: 'Their ability to keep the team on track / making progress' },
		{ key: 'contribution', label: 'Their ability to contribute effectively/fairly in the group' }
	]
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readUniversal(v: unknown, fallback: UniversalQuestion): UniversalQuestion {
	if (!isRecord(v) || typeof v.text !== 'string' || !v.text.trim()) return fallback;
	return { text: v.text, time: typeof v.time === 'string' ? v.time : '' };
}

/** A list of `{[idKey], [textKey]}` entries; unusable or duplicate entries are dropped. */
function readList<T>(
	v: unknown,
	idKey: string,
	textKey: string,
	fallback: T[],
	make: (id: string, text: string) => T
): T[] {
	if (!Array.isArray(v)) return fallback;
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of v) {
		if (!isRecord(item)) continue;
		const id = item[idKey];
		const text = item[textKey];
		if (typeof id !== 'string' || !id || seen.has(id)) continue;
		if (typeof text !== 'string' || !text.trim()) continue;
		seen.add(id);
		out.push(make(id, text));
	}
	return out;
}

/**
 * Normalize `settings.interview_forms`. Missing or malformed parts fall back to
 * the defaults part by part, so an org that only customized its rating prompts
 * keeps the default question bank. Never throws. Placeholders are left as-is.
 */
export function readInterviewForms(raw: unknown): InterviewForms {
	const d = DEFAULT_INTERVIEW_FORMS;
	if (!isRecord(raw)) return d;
	const q = (id: string, text: string): BehavioralQuestion => ({ id, text });
	const p = (key: string, label: string): RatingPrompt => ({ key, label });
	const individual = readList(raw.individual_ratings, 'key', 'label', d.individual_ratings, p);
	const group = readList(raw.group_ratings, 'key', 'label', d.group_ratings, p);
	return {
		universal_1: readUniversal(raw.universal_1, d.universal_1),
		universal_2: readUniversal(raw.universal_2, d.universal_2),
		success_questions: readList(raw.success_questions, 'id', 'text', d.success_questions, q),
		failure_questions: readList(raw.failure_questions, 'id', 'text', d.failure_questions, q),
		// A form with nothing to score could never be marked complete.
		individual_ratings: individual.length ? individual : d.individual_ratings,
		group_ratings: group.length ? group : d.group_ratings
	};
}

/** Replace `{org}` throughout, for display. */
export function withOrgName(forms: InterviewForms, orgName: string): InterviewForms {
	const fill = (s: string) => s.replaceAll('{org}', orgName);
	return {
		universal_1: { ...forms.universal_1, text: fill(forms.universal_1.text) },
		universal_2: { ...forms.universal_2, text: fill(forms.universal_2.text) },
		success_questions: forms.success_questions.map((x) => ({ ...x, text: fill(x.text) })),
		failure_questions: forms.failure_questions.map((x) => ({ ...x, text: fill(x.text) })),
		individual_ratings: forms.individual_ratings.map((x) => ({ ...x, label: fill(x.label) })),
		group_ratings: forms.group_ratings.map((x) => ({ ...x, label: fill(x.label) }))
	};
}

/**
 * An org's forms, ready to render: read from its settings JSON with `{org}`
 * filled in. Pass the raw `organizations.settings` value.
 */
export function resolveInterviewForms(settings: unknown, orgName: string): InterviewForms {
	const raw = isRecord(settings) ? settings.interview_forms : undefined;
	return withOrgName(readInterviewForms(raw), orgName || 'the organization');
}

/** For code paths that render before the org has loaded. */
export const FALLBACK_INTERVIEW_FORMS = withOrgName(DEFAULT_INTERVIEW_FORMS, 'the organization');

/** The scored prompts for one form. */
export const promptsFor = (forms: InterviewForms, form: 'individual' | 'group') =>
	form === 'individual' ? forms.individual_ratings : forms.group_ratings;

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
export function isComplete(
	evaluation: Evaluation | null,
	forms: InterviewForms = FALLBACK_INTERVIEW_FORMS
): boolean {
	if (!evaluation) return false;
	if (evaluation.form === 'legacy') return evaluation.rating > 0;
	const prompts = promptsFor(forms, evaluation.form);
	return prompts.every((p) => (evaluation.ratings[p.key] ?? 0) > 0);
}

/** Question text for a stored id, for rendering a saved evaluation back. */
export function questionText(id: string, forms: InterviewForms = FALLBACK_INTERVIEW_FORMS): string {
	const bank = (f: InterviewForms) => [...f.success_questions, ...f.failure_questions];
	// A question since removed from the org's bank falls back to the default
	// text before the bare id, so older evaluations still read as sentences.
	return (
		bank(forms).find((q) => q.id === id)?.text ??
		bank(FALLBACK_INTERVIEW_FORMS).find((q) => q.id === id)?.text ??
		id
	);
}

/** Mean of numbers, or null for none. */
function mean(values: number[]): number | null {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Average score per prompt across several interviewers' evaluations of one
 * candidate — e.g. the three group interviewers' "contribution" scores. Only
 * evaluations on the matching form count; a prompt nobody scored is null.
 */
export function averageByPrompt(
	evaluations: (Evaluation | null)[],
	form: 'individual' | 'group',
	forms: InterviewForms = FALLBACK_INTERVIEW_FORMS
): { key: string; label: string; average: number | null; count: number }[] {
	const onForm = evaluations.filter(
		(e): e is IndividualEvaluation | GroupEvaluation => e?.form === form
	);
	return promptsFor(forms, form).map((p) => {
		const scores = onForm.map((e) => e.ratings[p.key]).filter((n): n is number => n > 0);
		return { key: p.key, label: p.label, average: mean(scores), count: scores.length };
	});
}

/** Mean 1-10 score over evaluations, optionally only one form. Null when none are scored. */
export function averageScore(
	evaluations: (Evaluation | null)[],
	form?: Evaluation['form']
): { average: number | null; count: number } {
	const scores = evaluations
		.filter((e) => e && (!form || e.form === form))
		.map((e) => evaluationScore(e))
		.filter((n): n is number => n !== null);
	return { average: mean(scores), count: scores.length };
}
