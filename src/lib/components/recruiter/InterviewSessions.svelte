<script lang="ts">
	// One candidate's interview sittings, each interviewer's evaluation inside.
	//
	// Shared by the candidate profile and the readiness review. The readiness
	// "without scores" pass renders the same notes with every number hidden, and
	// blind mode passes a `scrub` that swaps candidate names in free text for
	// their numbers. Interviewer names always show: who wrote a note matters.
	import { sessionLabel, type InterviewSession } from '$lib/utils/candidates';
	import {
		averageByPrompt,
		questionText,
		UNIVERSAL_Q1,
		UNIVERSAL_Q2
	} from '$lib/utils/interviewForms';
	import type { ScoreModel } from '$lib/utils/scoreModel';

	export let sessions: InterviewSession[] = [];
	export let showScores = true;
	/** Interviewer-lean model for this posting; adds the adjusted score per evaluation. */
	export let model: ScoreModel | null = null;
	export let scrub: (text: string) => string = (text) => text;

	const fmtScore = (n: number | null) => (n === null ? '—' : n.toFixed(1));
	/** Tone for a 1-10 value: the form's scale is 1/3/5/7/10. */
	const scoreTone = (n: number | null) =>
		n === null ? 'pill-neutral' : n >= 7 ? 'pill-success' : n >= 5 ? 'pill-warning' : 'pill-danger';

	function sessionWhen(session: InterviewSession): string {
		const start = new Date(session.start_time);
		const day = start.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		const time = (d: Date) =>
			d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return session.end_time
			? `${day}, ${time(start)} – ${time(new Date(session.end_time))}`
			: `${day}, ${time(start)}`;
	}

	function leanNote(rater: string, form: string): string {
		const lean = model?.leanOf(rater, form) ?? 0;
		if (Math.abs(lean) < 0.05) return 'this interviewer scores in line with others';
		return `this interviewer scores ${Math.abs(lean).toFixed(1)} ${lean > 0 ? 'above' : 'below'} others on ${form} interviews`;
	}

	const REC_LABELS: Record<string, string> = {
		strong_yes: 'Strong Yes',
		yes: 'Yes',
		neutral: 'Neutral',
		no: 'No',
		strong_no: 'Strong No'
	};
	const REC_COLORS: Record<string, string> = {
		strong_yes: '#16a34a',
		yes: '#22c55e',
		neutral: '#878fa1',
		no: '#f59e0b',
		strong_no: '#ef4444'
	};
</script>

{#each sessions as session (session.key)}
	{@const form = session.type === 'group' ? 'group' : 'individual'}
	{@const panel = averageByPrompt(
		session.entries.map((e) => e.evaluation),
		form
	)}
	<div class="session">
		<div class="session-head">
			<span class="session-title">{sessionLabel(session.type)}</span>
			<span class="session-when"
				>{sessionWhen(session)}{session.location ? ` · ${session.location}` : ''}</span
			>
		</div>

		{#if showScores && session.entries.length > 1 && panel.some((q) => q.count > 0)}
			<div class="rating-list panel-avg">
				<span class="eval-label">Panel average</span>
				{#each panel as q (q.key)}
					<div class="rating-row">
						<span class="rating-label">{q.label}</span>
						<span class="pill {scoreTone(q.average)}">{fmtScore(q.average)}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#each session.entries as entry (entry.interview.id)}
			{@const ev = entry.evaluation}
			{@const rater = ev?.evaluator || entry.interview.interviewer || ''}
			<div class="eval-item">
				<div class="eval-item-header">
					<span class="eval-interviewer">{rater || 'Unknown'}</span>
					{#if !ev}
						<span class="pill pill-neutral">Not evaluated yet</span>
					{:else if showScores}
						<span class="score-pair">
							{#if model && entry.score !== null}
								<span
									class="pill {scoreTone(model.adjust(entry.score, rater, ev.form))}"
									title="Adjusted: {leanNote(rater, ev.form)}"
									>{model.adjust(entry.score, rater, ev.form).toFixed(1)} adj.</span
								>
								<span class="raw-score">raw {entry.score.toFixed(1)}</span>
							{:else}
								<span class="pill {scoreTone(entry.score)}"
									>{entry.score === null ? 'Not scored' : `${entry.score.toFixed(1)}/10`}</span
								>
							{/if}
						</span>
					{/if}
				</div>

				{#if ev && ev.form !== 'legacy'}
					{#if showScores}
						<div class="rating-list">
							{#each averageByPrompt([ev], ev.form) as q (q.key)}
								<div class="rating-row">
									<span class="rating-label">{q.label}</span>
									<span class="pill {scoreTone(q.average)}"
										>{q.average === null ? '—' : q.average}</span
									>
								</div>
							{/each}
						</div>
					{/if}

					{#if ev.form === 'individual'}
						<div class="asked">
							<span class="eval-label">Questions asked</span>
							<ul class="asked-list">
								<li>{UNIVERSAL_Q1}</li>
								<li>{UNIVERSAL_Q2}</li>
								{#each [...ev.successQuestions, ...ev.failureQuestions] as id (id)}
									<li>{questionText(id)}</li>
								{/each}
							</ul>
							{#if ev.otherQuestions.trim()}
								<span class="eval-label">Other questions</span>
								<p class="eval-text pre">{scrub(ev.otherQuestions)}</p>
							{/if}
						</div>
					{/if}

					{#if ev.notes.trim()}
						<span class="eval-label">Notes</span>
						<p class="eval-text pre">{scrub(ev.notes)}</p>
					{/if}
				{:else if ev && ev.form === 'legacy'}
					{#if showScores}
						<div class="star-row">
							{#each [1, 2, 3, 4, 5] as star (star)}
								<span class="star" class:filled={ev.rating >= star}>&#9733;</span>
							{/each}
							{#if ev.recommendation}
								<span
									class="rec-pill"
									style="background-color: {REC_COLORS[ev.recommendation] ?? '#878fa1'};"
								>
									{REC_LABELS[ev.recommendation] ?? ev.recommendation}
								</span>
							{/if}
						</div>
					{/if}
					{#if ev.strengths}
						<p class="eval-text pre"><strong>+</strong> {scrub(ev.strengths)}</p>
					{/if}
					{#if ev.weaknesses}
						<p class="eval-text pre"><strong>−</strong> {scrub(ev.weaknesses)}</p>
					{/if}
					{#if ev.notes}
						<p class="eval-text pre eval-text-muted">{scrub(ev.notes)}</p>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/each}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.eval-label {
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.star-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.star {
		font-size: 16px;
		color: $border-strong;
	}
	.star.filled {
		color: $yellow-primary;
	}
	.rec-pill {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
	}
	.eval-item {
		padding: 10px;
		background-color: $surface-sunken;
		border-radius: $radius-sm;
	}
	.eval-item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}
	.eval-interviewer {
		font-size: 12px;
		font-weight: 700;
		color: $text;
	}
	.score-pair {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.raw-score {
		font-size: 11px;
		color: $text-muted;
	}
	.eval-text {
		font-size: 12px;
		color: $text;
		margin: 3px 0 0;
	}
	.eval-text-muted {
		color: $text-muted;
	}
	.pre {
		white-space: pre-wrap;
	}
	.session {
		border-top: 1px solid $border-faint;
		padding-top: 12px;
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.session-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 8px;
	}
	.session-title {
		font-size: 14px;
		font-weight: 700;
		color: $text;
	}
	.session-when {
		font-size: 12px;
		color: $text-muted;
	}
	.rating-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 6px 0;
	}
	.panel-avg {
		padding: 8px 10px;
		border: 1px dashed $border;
		border-radius: $radius-sm;
		margin: 0;
	}
	.rating-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: $text;
	}
	.asked {
		margin: 6px 0;
	}
	.asked-list {
		margin: 4px 0 6px;
		padding-left: 18px;
		font-size: 12px;
		color: $text;
	}
</style>
