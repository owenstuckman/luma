<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase, getCurrentUserEmail } from '$lib/utils/supabase';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import { selectedJob } from '$lib/stores/jobFilter';
	import {
		RATING_SCALE,
		SUCCESS_QUESTIONS,
		FAILURE_QUESTIONS,
		INDIVIDUAL_RATINGS,
		GROUP_RATINGS,
		UNIVERSAL_Q1,
		UNIVERSAL_Q1_TIME,
		UNIVERSAL_Q2,
		UNIVERSAL_Q2_TIME,
		readEvaluation,
		evaluationScore,
		isComplete
	} from '$lib/utils/interviewForms';
	import type { RatingMap } from '$lib/utils/interviewForms';
	import type { Interview, Applicant } from '$lib/types';

	let orgId: number | null = null;
	let interviews: Interview[] = [];
	let applicantMap: Record<string, Applicant> = {};
	/** Ranked team choices per applicant email, e.g. ['Juvo', 'Terra']. */
	let teamChoices: Record<string, string[]> = {};
	let interviewerNames: Record<string, string> = {};
	let loading = true;
	let userEmail = '';
	let filterStatus: 'all' | 'pending' | 'completed' = 'all';

	// Active form state
	let activeInterview: Interview | null = null;
	let successPicked: string[] = [];
	let failurePicked: string[] = [];
	let otherQuestions = '';
	let notes = '';
	let ratings: RatingMap = {};
	let saving = false;
	let saveError = '';
	/**
	 * The interviewer's own full name. Nothing in the system captures a
	 * recruiter's name — `interviewers.name` is null for every row, org member
	 * metadata is empty, and signup only ever collects an email. So the form asks
	 * once, writes it back to `interviewers.name`, and auto-fills from then on.
	 */
	let myName = '';

	$: slug = $page.params.slug;
	$: isGroup = activeInterview?.type === 'group';
	$: prompts = isGroup ? GROUP_RATINGS : INDIVIDUAL_RATINGS;
	$: unscored = prompts.filter((p) => !(ratings[p.key] > 0)).length;

	$: filteredInterviews = interviews
		.filter((iv) => !$selectedJob || iv.job === $selectedJob.id)
		.filter((iv) => {
			if (filterStatus === 'all') return true;
			const done = isComplete(evalOf(iv));
			return filterStatus === 'completed' ? done : !done;
		});

	function evalOf(iv: Interview) {
		return readEvaluation((iv.comments as Record<string, unknown> | null)?.evaluation);
	}

	function fullName(email: string | null): string {
		if (!email) return 'Unknown';
		return interviewerNames[email.toLowerCase()] || email;
	}

	onMount(async () => {
		const { data: orgData } = await supabase
			.from('organizations')
			.select('id')
			.eq('slug', slug)
			.single();
		if (!orgData) {
			loading = false;
			return;
		}
		orgId = orgData.id;
		userEmail = (await getCurrentUserEmail()) || '';

		let query = supabase
			.from('interviews')
			.select('*')
			.eq('org_id', orgId)
			.order('start_time', { ascending: true });
		if (userEmail) query = query.eq('interviewer', userEmail);

		const { data: ivData } = await query;
		interviews = ivData || [];

		const emails = [...new Set(interviews.map((iv) => iv.applicant).filter(Boolean))] as string[];
		if (emails.length > 0) {
			const [{ data: appData }, { data: teamData }] = await Promise.all([
				supabase.from('applicants').select('*').eq('org_id', orgId).in('email', emails),
				supabase.from('teams').select('id,name').eq('org_id', orgId)
			]);

			const teamName = new Map((teamData ?? []).map((t) => [t.id, t.name as string]));
			// An application is per-team since 00024, so one person has one row per
			// team they picked. `team_rank` carries the preference order they chose.
			const ranked: Record<string, { rank: number; name: string }[]> = {};
			for (const a of appData ?? []) {
				applicantMap[a.email] = applicantMap[a.email] ?? a;
				const name = a.team_id ? teamName.get(a.team_id) : null;
				if (!name) continue;
				(ranked[a.email] = ranked[a.email] ?? []).push({ rank: a.team_rank ?? 99, name });
			}
			for (const [email, list] of Object.entries(ranked)) {
				teamChoices[email] = list.sort((x, y) => x.rank - y.rank).map((x) => x.name);
			}
			applicantMap = { ...applicantMap };
			teamChoices = { ...teamChoices };
		}

		// Interviewer display names, so the form shows a person not an address.
		const { data: people } = await supabase
			.from('interviewers')
			.select('name,email')
			.eq('org_id', orgId);
		for (const p of people ?? []) {
			if (p.email && p.name) interviewerNames[p.email.toLowerCase()] = p.name;
		}
		interviewerNames = { ...interviewerNames };
		myName = interviewerNames[userEmail.toLowerCase()] ?? '';

		loading = false;

		// Deep link from the schedule: /evaluate?interview=123 opens that form.
		const wanted = Number($page.url.searchParams.get('interview'));
		if (wanted) {
			const target = interviews.find((iv) => iv.id === wanted);
			if (target) openEvaluation(target);
		}
	});

	function openEvaluation(iv: Interview) {
		activeInterview = iv;
		saveError = '';
		const existing = evalOf(iv);

		successPicked = existing?.form === 'individual' ? [...existing.successQuestions] : [];
		failurePicked = existing?.form === 'individual' ? [...existing.failureQuestions] : [];
		otherQuestions = existing?.form === 'individual' ? existing.otherQuestions : '';
		notes = existing && existing.form !== 'legacy' ? existing.notes : (existing?.notes ?? '');
		ratings = existing && existing.form !== 'legacy' ? { ...existing.ratings } : {};
	}

	function closeEvaluation() {
		activeInterview = null;
	}

	function toggle(list: string[], id: string): string[] {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	async function saveEvaluation() {
		if (!activeInterview) return;
		saving = true;
		saveError = '';

		const base = {
			notes,
			ratings,
			evaluator: userEmail,
			evaluatorName: myName.trim(),
			evaluatedAt: new Date().toISOString()
		};
		const evaluation = isGroup
			? { form: 'group' as const, ...base }
			: {
					form: 'individual' as const,
					successQuestions: successPicked,
					failureQuestions: failurePicked,
					otherQuestions,
					...base
				};

		const existing = (activeInterview.comments as Record<string, unknown>) || {};
		const updatedComments = { ...existing, evaluation };

		const { error } = await supabase
			.from('interviews')
			.update({ comments: updatedComments })
			.eq('id', activeInterview.id);

		// Remember the name so every later form is pre-filled. Best effort: a
		// failure here must not lose the evaluation the interviewer just wrote.
		const trimmed = myName.trim();
		if (!error && trimmed && trimmed !== interviewerNames[userEmail.toLowerCase()]) {
			// Via RPC, not a table update: `interviewers_update_admin` gates UPDATE
			// behind an admin role, and an RLS-blocked update matches zero rows and
			// reports success — so writing directly failed silently (00033).
			const { data: named, error: nameErr } = await supabase.rpc('set_my_interviewer_name', {
				target_org_id: orgId,
				new_name: trimmed
			});
			if (nameErr || named?.error) {
				console.error('Could not save interviewer name:', nameErr?.message ?? named.error);
			} else {
				interviewerNames = { ...interviewerNames, [userEmail.toLowerCase()]: trimmed };
			}
		}

		if (error) {
			console.error('Failed to save evaluation:', error);
			saveError = error.message;
		} else {
			const idx = interviews.findIndex((iv) => iv.id === activeInterview!.id);
			if (idx >= 0) {
				interviews[idx] = { ...interviews[idx], comments: updatedComments };
				interviews = [...interviews];
			}
			closeEvaluation();
		}
		saving = false;
	}
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<h4 class="page-title">Evaluate Interviewees</h4>
				<p class="page-subtitle">{interviews.length} interviews assigned to you</p>
			</div>
			<div class="page-actions">
				<select bind:value={filterStatus} class="form-control" style="max-width: 180px;">
					<option value="all">All</option>
					<option value="pending">Needs Evaluation</option>
					<option value="completed">Evaluated</option>
				</select>
			</div>
		</div>

		{#if loading}
			<p class="muted placeholder">Loading interviews...</p>
		{:else if filteredInterviews.length === 0}
			<p class="muted placeholder">No interviews found.</p>
		{:else}
			<div class="interview-list">
				{#each filteredInterviews as iv (iv.id)}
					{@const applicant = applicantMap[iv.applicant || '']}
					{@const ev = evalOf(iv)}
					{@const score = evaluationScore(ev)}
					<div
						class="interview-card"
						class:evaluated={isComplete(ev)}
						on:click={() => openEvaluation(iv)}
						on:keydown={(e) => e.key === 'Enter' && openEvaluation(iv)}
						role="button"
						tabindex="0"
					>
						<div class="card-top">
							<span class="applicant-name">{applicant?.name || iv.applicant || 'Unknown'}</span>
							{#if isComplete(ev)}
								<span class="eval-badge done">Done</span>
							{:else if ev}
								<span class="eval-badge partial">In progress</span>
							{:else}
								<span class="eval-badge pending">Pending</span>
							{/if}
						</div>
						<p class="card-meta">
							<span class="type-pill" class:group={iv.type === 'group'}>{iv.type}</span>
							{new Date(iv.start_time).toLocaleDateString([], {
								weekday: 'short',
								month: 'short',
								day: 'numeric'
							})}
							at {new Date(iv.start_time).toLocaleTimeString([], {
								hour: 'numeric',
								minute: '2-digit'
							})}
							&middot; {iv.location}
						</p>
						{#if teamChoices[iv.applicant || '']?.length}
							<p class="card-meta">{teamChoices[iv.applicant || ''].join(' → ')}</p>
						{/if}
						{#if score !== null}
							<p class="card-score">Average {score.toFixed(1)} / 10</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={5} />
</div>

{#if activeInterview}
	{@const applicant = applicantMap[activeInterview.applicant || '']}
	{@const choices = teamChoices[activeInterview.applicant || ''] ?? []}
	<div
		class="modal-backdrop-luma"
		on:click={closeEvaluation}
		on:keydown={() => {}}
		role="button"
		tabindex="-1"
	>
		<div
			class="modal-panel eval-modal"
			on:click|stopPropagation={() => {}}
			on:keydown={() => {}}
			role="dialog"
			tabindex="-1"
		>
			<div class="modal-head">
				<h5 class="modal-title">
					{isGroup ? 'Group' : 'Individual'} Interview — {applicant?.name ||
						activeInterview.applicant}
				</h5>
				<button class="btn-icon close-btn" on:click={closeEvaluation}>&times;</button>
			</div>

			<!-- Auto-filled from the application and the schedule; not editable here. -->
			<div class="facts">
				<div><span class="fact-label">Interviewee</span>{applicant?.name || '—'}</div>
				<div>
					<label class="fact-label" for="interviewer-name">Interviewer</label>
					<input
						id="interviewer-name"
						class="fact-input"
						bind:value={myName}
						placeholder="Your full name"
					/>
				</div>
				<div><span class="fact-label">1st choice team</span>{choices[0] ?? '—'}</div>
				<div><span class="fact-label">2nd choice team</span>{choices[1] ?? '—'}</div>
			</div>

			{#if !isGroup}
				<div class="qblock">
					<p class="q-universal">
						<span class="q-tag">Universal 1</span>{UNIVERSAL_Q1}
						<span class="q-time">({UNIVERSAL_Q1_TIME})</span>
					</p>
				</div>

				<div class="field">
					<span class="field-label">Behavioural — success <em>(tick the ones you asked)</em></span>
					{#each SUCCESS_QUESTIONS as q (q.id)}
						<label class="check-row">
							<input
								type="checkbox"
								checked={successPicked.includes(q.id)}
								on:change={() => (successPicked = toggle(successPicked, q.id))}
							/>
							<span>{q.text}</span>
						</label>
					{/each}
				</div>

				<div class="qblock">
					<p class="q-universal">
						<span class="q-tag">Universal 2</span>{UNIVERSAL_Q2}
						<span class="q-time">({UNIVERSAL_Q2_TIME})</span>
					</p>
				</div>

				<div class="field">
					<span class="field-label">Behavioural — failure <em>(tick the ones you asked)</em></span>
					{#each FAILURE_QUESTIONS as q (q.id)}
						<label class="check-row">
							<input
								type="checkbox"
								checked={failurePicked.includes(q.id)}
								on:change={() => (failurePicked = toggle(failurePicked, q.id))}
							/>
							<span>{q.text}</span>
						</label>
					{/each}
				</div>

				<div class="field">
					<label class="field-label" for="other-q">Other questions you asked</label>
					<textarea
						id="other-q"
						bind:value={otherQuestions}
						class="form-control"
						rows="2"
						placeholder="Anything not listed above..."></textarea>
				</div>
			{/if}

			<div class="field">
				<label class="field-label" for="eval-notes">Notes</label>
				<textarea
					id="eval-notes"
					bind:value={notes}
					class="form-control"
					rows="3"
					placeholder={isGroup ? 'Comments on this applicant...' : 'Observations...'}></textarea>
			</div>

			<div class="ratings">
				<span class="field-label">Scores</span>
				{#each prompts as p (p.key)}
					<div class="rating-row">
						<span class="rating-label">{p.label}</span>
						<div class="scale">
							{#each RATING_SCALE as v}
								<button
									type="button"
									class="scale-btn"
									class:picked={ratings[p.key] === v}
									on:click={() => (ratings = { ...ratings, [p.key]: v })}>{v}</button
								>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			{#if saveError}
				<p class="alert-soft alert-error">{saveError}</p>
			{/if}

			<div class="modal-actions">
				<span class="progress-note">
					{unscored === 0
						? 'All scores set.'
						: `${unscored} score${unscored === 1 ? '' : 's'} left`}
				</span>
				<button class="btn btn-quaternary" on:click={closeEvaluation}>Cancel</button>
				<button class="btn btn-tertiary" on:click={saveEvaluation} disabled={saving}>
					{saving ? 'Saving...' : 'Save Evaluation'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	.placeholder {
		padding: 20px;
	}
	.interview-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}
	.interview-card {
		background: $surface;
		border-radius: $radius;
		padding: 16px;
		box-shadow: $shadow;
		cursor: pointer;
		transition:
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}
	.interview-card:hover {
		box-shadow: $shadow-lg;
		transform: translateY(-1px);
	}
	.interview-card.evaluated {
		border-left: 3px solid $success;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
		gap: 8px;
	}
	.applicant-name {
		font-weight: 700;
		font-size: 14px;
		color: $text;
	}
	.eval-badge {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.eval-badge.done {
		background-color: $success;
	}
	.eval-badge.partial {
		background-color: $warning;
	}
	.eval-badge.pending {
		background-color: $text-muted;
	}
	.type-pill {
		display: inline-block;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		padding: 1px 6px;
		margin-right: 6px;
		border-radius: $radius-pill;
		background: $surface-sunken;
		color: $text-muted;
		border: 1px solid $border;
	}
	.type-pill.group {
		color: $yellow-primary;
		border-color: $yellow-primary;
	}
	.card-meta {
		font-size: 12px;
		color: $text-muted;
		margin: 2px 0;
	}
	.card-score {
		font-size: 12px;
		font-weight: 700;
		color: $text;
		margin: 6px 0 0;
	}

	/* Modal */
	.eval-modal {
		max-height: 88vh;
		overflow-y: auto;
	}
	.close-btn {
		font-size: 24px;
		line-height: 1;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 8px 16px;
		background: $surface-sunken;
		border: 1px solid $border;
		border-radius: $radius-sm;
		padding: 10px 12px;
		margin-bottom: 14px;
		font-size: 13px;
		color: $text;
	}
	.fact-label {
		display: block;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		color: $text-muted;
	}
	.fact-input {
		width: 100%;
		border: 1px solid $border;
		border-radius: $radius-sm;
		background: $surface;
		color: $text;
		font-size: 13px;
		padding: 2px 6px;
	}
	.fact-input:focus {
		outline: none;
		border-color: $yellow-primary;
	}
	.qblock {
		margin: 14px 0 6px;
	}
	.q-universal {
		font-size: 13px;
		color: $text;
		margin: 0;
		font-weight: 600;
	}
	.q-tag {
		display: inline-block;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		color: $yellow-primary;
		margin-right: 6px;
	}
	.q-time {
		color: $text-muted;
		font-weight: 400;
	}
	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		color: $text;
		margin: 5px 0;
		cursor: pointer;
	}
	.check-row input {
		margin-top: 3px;
		flex-shrink: 0;
	}
	.ratings {
		margin-top: 16px;
		border-top: 1px solid $border;
		padding-top: 12px;
	}
	.rating-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin: 10px 0;
		flex-wrap: wrap;
	}
	.rating-label {
		font-size: 13px;
		color: $text;
		flex: 1 1 220px;
	}
	.scale {
		display: flex;
		gap: 6px;
	}
	.scale-btn {
		width: 38px;
		height: 34px;
		border: 1px solid $border-strong;
		background: $surface;
		border-radius: $radius-sm;
		font-weight: 700;
		font-size: 13px;
		color: $text-muted;
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	.scale-btn:hover {
		border-color: $yellow-primary;
		color: $text;
	}
	.scale-btn.picked {
		background: $yellow-primary;
		border-color: $yellow-primary;
		color: $dark-primary;
	}
	.progress-note {
		font-size: 12px;
		color: $text-muted;
		margin-right: auto;
	}
</style>
