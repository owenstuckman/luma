// Interviewer-adjusted interview scores.
//
// Raw scores are plain averages, so a candidate's number depends heavily on who
// happened to interview them: across Fall 2026 one interviewer's individual
// scores averaged 8.5 and another's 6.3. This module estimates how far each
// interviewer runs above or below everyone else, and takes that lean back out.
//
// The model, fitted per job:
//
//     score = form average + candidate level + interviewer lean (per form) + noise
//
// fitted by alternating ridge regression. Two things make it fair:
//
//   * The candidate term. An interviewer who happened to see strong candidates
//     isn't lenient — the lean is measured against what OTHER interviewers gave
//     the same people, which group sessions (several interviewers per
//     candidate) make possible.
//   * Shrinkage. Each lean is pulled toward zero by `interviewerShrinkage`
//     pseudo-scores, so someone with three scores barely moves while someone with
//     forty is corrected almost fully. A small sample can't masquerade as a
//     harsh or generous scorer.
//
// The adjusted candidate score is the average of their scores with each
// interviewer's lean removed — the same kind of number as the raw average, so
// the two can be read side by side. Pure: no DB or DOM access.

export interface ScoreObservation {
	/** Who the score is about — the person, not one application (see personKey). */
	candidate: string;
	/** Who gave it. Normalised to lowercase by the model. */
	rater: string;
	/** 'group' | 'individual' | 'legacy' — forms use different prompts and scales. */
	form: string;
	/** 1-10. */
	score: number;
}

export interface ScoreModelOptions {
	/** Pseudo-scores pulling each interviewer's lean toward 0. Higher = gentler correction. */
	interviewerShrinkage?: number;
	/** Pseudo-scores pulling each candidate's level toward 0 while fitting. */
	candidateShrinkage?: number;
	iterations?: number;
}

export interface RaterLean {
	rater: string;
	form: string;
	/** Points this interviewer runs above (+) or below (−) others on this form, after shrinkage. */
	lean: number;
	count: number;
}

export interface ScoreModel {
	/** Lean for one interviewer on one form; 0 when unknown. */
	leanOf(rater: string | null | undefined, form: string): number;
	/** One score with its interviewer's lean removed, kept on the 1-10 scale. */
	adjust(score: number, rater: string | null | undefined, form: string): number;
	leans: RaterLean[];
	formMeans: Record<string, number>;
	observations: number;
}

export const DEFAULT_INTERVIEWER_SHRINKAGE = 5;
const DEFAULT_CANDIDATE_SHRINKAGE = 1;

const raterKey = (rater: string | null | undefined, form: string) =>
	`${(rater ?? '').trim().toLowerCase()}|${form}`;

const clamp = (n: number) => Math.min(10, Math.max(1, n));

export function fitScoreModel(
	observations: ScoreObservation[],
	options: ScoreModelOptions = {}
): ScoreModel {
	const lambdaRater = options.interviewerShrinkage ?? DEFAULT_INTERVIEWER_SHRINKAGE;
	const lambdaCandidate = options.candidateShrinkage ?? DEFAULT_CANDIDATE_SHRINKAGE;
	const iterations = options.iterations ?? 25;

	const obs = observations.filter(
		(o) => Number.isFinite(o.score) && o.score > 0 && o.rater && o.candidate
	);

	const formSums = new Map<string, { sum: number; n: number }>();
	for (const o of obs) {
		const f = formSums.get(o.form) ?? { sum: 0, n: 0 };
		f.sum += o.score;
		f.n += 1;
		formSums.set(o.form, f);
	}
	const formMeans: Record<string, number> = {};
	for (const [form, { sum, n }] of formSums) formMeans[form] = sum / n;

	const candidateEffect = new Map<string, number>();
	const raterEffect = new Map<string, number>();
	const residual = (o: ScoreObservation) => o.score - formMeans[o.form];

	for (let i = 0; i < iterations; i++) {
		const cSum = new Map<string, { sum: number; n: number }>();
		for (const o of obs) {
			const acc = cSum.get(o.candidate) ?? { sum: 0, n: 0 };
			acc.sum += residual(o) - (raterEffect.get(raterKey(o.rater, o.form)) ?? 0);
			acc.n += 1;
			cSum.set(o.candidate, acc);
		}
		for (const [c, { sum, n }] of cSum) candidateEffect.set(c, sum / (n + lambdaCandidate));

		const rSum = new Map<string, { sum: number; n: number }>();
		for (const o of obs) {
			const key = raterKey(o.rater, o.form);
			const acc = rSum.get(key) ?? { sum: 0, n: 0 };
			acc.sum += residual(o) - (candidateEffect.get(o.candidate) ?? 0);
			acc.n += 1;
			rSum.set(key, acc);
		}
		for (const [r, { sum, n }] of rSum) raterEffect.set(r, sum / (n + lambdaRater));
	}

	const counts = new Map<string, number>();
	for (const o of obs) {
		const key = raterKey(o.rater, o.form);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const leans: RaterLean[] = [...raterEffect].map(([key, lean]) => {
		const cut = key.lastIndexOf('|');
		return {
			rater: key.slice(0, cut),
			form: key.slice(cut + 1),
			lean,
			count: counts.get(key) ?? 0
		};
	});
	leans.sort((a, b) => b.lean - a.lean);

	const leanOf = (rater: string | null | undefined, form: string) =>
		raterEffect.get(raterKey(rater, form)) ?? 0;

	return {
		leanOf,
		adjust: (score, rater, form) => clamp(score - leanOf(rater, form)),
		leans,
		formMeans,
		observations: obs.length
	};
}

/** Mean of adjusted scores for one candidate's evaluations, or null if none are scored. */
export function adjustedAverage(
	model: ScoreModel,
	scored: { score: number | null; rater: string | null | undefined; form: string }[]
): number | null {
	const values = scored
		.filter((s): s is { score: number; rater: string; form: string } => (s.score ?? 0) > 0)
		.map((s) => model.adjust(s.score, s.rater, s.form));
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
