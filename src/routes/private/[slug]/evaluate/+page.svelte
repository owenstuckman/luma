<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/utils/supabase';
	import { getCurrentUserEmail } from '$lib/utils/supabase';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import { selectedJob } from '$lib/stores/jobFilter';
	import type { Interview, Applicant } from '$lib/types';

	let orgId: number | null = null;
	let interviews: Interview[] = [];
	let applicantMap: Record<string, Applicant> = {};
	let loading = true;
	let userEmail = '';
	let filterStatus: 'all' | 'pending' | 'completed' = 'all';

	// Evaluation form
	let activeInterview: Interview | null = null;
	let rating = 0;
	let strengths = '';
	let weaknesses = '';
	let notes = '';
	let recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no' = 'neutral';
	let saving = false;

	$: slug = $page.params.slug;

	$: filteredInterviews = interviews
		.filter((iv) => !$selectedJob || iv.job === $selectedJob.id)
		.filter((iv) => {
			if (filterStatus === 'all') return true;
			const hasEval = iv.comments && (iv.comments as Record<string, unknown>).evaluation;
			return filterStatus === 'completed' ? hasEval : !hasEval;
		});

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

		// Fetch interviews for this user
		let query = supabase
			.from('interviews')
			.select('*')
			.eq('org_id', orgId)
			.order('start_time', { ascending: false });

		if (userEmail) {
			query = query.eq('interviewer', userEmail);
		}

		const { data: ivData } = await query;
		interviews = ivData || [];

		// Build applicant lookup by email
		const applicantEmails = [...new Set(interviews.map((iv) => iv.applicant).filter(Boolean))];
		if (applicantEmails.length > 0) {
			const { data: appData } = await supabase
				.from('applicants')
				.select('*')
				.eq('org_id', orgId)
				.in('email', applicantEmails);
			if (appData) {
				for (const a of appData) {
					applicantMap[a.email] = a;
				}
			}
		}

		loading = false;
	});

	function openEvaluation(iv: Interview) {
		activeInterview = iv;
		// Load existing evaluation if present
		const existing = iv.comments as Record<string, unknown> | null;
		if (existing?.evaluation) {
			const eval_ = existing.evaluation as Record<string, unknown>;
			rating = (eval_.rating as number) || 0;
			strengths = (eval_.strengths as string) || '';
			weaknesses = (eval_.weaknesses as string) || '';
			notes = (eval_.notes as string) || '';
			recommendation = (eval_.recommendation as typeof recommendation) || 'neutral';
		} else {
			rating = 0;
			strengths = '';
			weaknesses = '';
			notes = '';
			recommendation = 'neutral';
		}
	}

	function closeEvaluation() {
		activeInterview = null;
	}

	async function saveEvaluation() {
		if (!activeInterview) return;
		saving = true;

		const existing = (activeInterview.comments as Record<string, unknown>) || {};
		const updatedComments = {
			...existing,
			evaluation: {
				rating,
				strengths,
				weaknesses,
				notes,
				recommendation,
				evaluator: userEmail,
				evaluatedAt: new Date().toISOString()
			}
		};

		const { error } = await supabase
			.from('interviews')
			.update({ comments: updatedComments })
			.eq('id', activeInterview.id);

		if (error) {
			console.error('Failed to save evaluation:', error);
		} else {
			// Update local state
			const idx = interviews.findIndex((iv) => iv.id === activeInterview!.id);
			if (idx >= 0) {
				interviews[idx] = { ...interviews[idx], comments: updatedComments };
				interviews = [...interviews];
			}
			closeEvaluation();
		}
		saving = false;
	}

	function hasEvaluation(iv: Interview): boolean {
		return !!(iv.comments && (iv.comments as Record<string, unknown>).evaluation);
	}

	function getRecommendationLabel(rec: string): string {
		switch (rec) {
			case 'strong_yes':
				return 'Strong Yes';
			case 'yes':
				return 'Yes';
			case 'neutral':
				return 'Neutral';
			case 'no':
				return 'No';
			case 'strong_no':
				return 'Strong No';
			default:
				return rec;
		}
	}

	function getRecommendationColor(rec: string): string {
		switch (rec) {
			case 'strong_yes':
				return '#16a34a';
			case 'yes':
				return '#22c55e';
			case 'neutral':
				return '#878fa1';
			case 'no':
				return '#f59e0b';
			case 'strong_no':
				return '#ef4444';
			default:
				return '#878fa1';
		}
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
				{#each filteredInterviews as iv}
					{@const applicant = applicantMap[iv.applicant || '']}
					<div
						class="interview-card"
						class:evaluated={hasEvaluation(iv)}
						on:click={() => openEvaluation(iv)}
						on:keydown={() => {}}
						role="button"
						tabindex="0"
					>
						<div class="card-top">
							<span class="applicant-name">{applicant?.name || iv.applicant || 'Unknown'}</span>
							{#if hasEvaluation(iv)}
								{@const eval_ = (iv.comments as Record<string, unknown>).evaluation as Record<
									string,
									unknown
								>}
								<span
									class="eval-badge"
									style="background-color: {getRecommendationColor(
										String(eval_.recommendation || '')
									)};"
								>
									{getRecommendationLabel(String(eval_.recommendation || ''))}
								</span>
							{:else}
								<span class="eval-badge eval-badge-pending">Pending</span>
							{/if}
						</div>
						<p class="card-meta">{iv.applicant || ''}</p>
						<p class="card-meta">
							{new Date(iv.start_time).toLocaleDateString()} at {new Date(
								iv.start_time
							).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
							&middot; {iv.location} &middot; {iv.type}
						</p>
						{#if hasEvaluation(iv)}
							{@const eval_ = (iv.comments as Record<string, unknown>).evaluation as Record<
								string,
								unknown
							>}
							<div class="card-rating">
								{#each [1, 2, 3, 4, 5] as star}
									<span class="star" class:filled={(eval_.rating as number) >= star}>&#9733;</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={5} />
</div>

<!-- Evaluation modal -->
{#if activeInterview}
	<div
		class="modal-backdrop-luma"
		on:click={closeEvaluation}
		on:keydown={() => {}}
		role="button"
		tabindex="-1"
	>
		<div
			class="modal-panel"
			on:click|stopPropagation={() => {}}
			on:keydown={() => {}}
			role="dialog"
			tabindex="-1"
		>
			<div class="modal-head">
				<h5 class="modal-title">
					Evaluate: {applicantMap[activeInterview.applicant || '']?.name ||
						activeInterview.applicant}
				</h5>
				<button class="btn-icon close-btn" on:click={closeEvaluation}>&times;</button>
			</div>

			<div>
				<div class="field">
					<label class="field-label">Overall Rating</label>
					<div class="star-input">
						{#each [1, 2, 3, 4, 5] as star}
							<button
								class="star-btn"
								class:filled={rating >= star}
								on:click={() => (rating = star)}>&#9733;</button
							>
						{/each}
					</div>
				</div>

				<div class="field">
					<label class="field-label">Recommendation</label>
					<select bind:value={recommendation} class="form-control">
						<option value="strong_yes">Strong Yes</option>
						<option value="yes">Yes</option>
						<option value="neutral">Neutral</option>
						<option value="no">No</option>
						<option value="strong_no">Strong No</option>
					</select>
				</div>

				<div class="field">
					<label class="field-label">Strengths</label>
					<textarea
						bind:value={strengths}
						class="form-control"
						rows="3"
						placeholder="What stood out positively?"></textarea>
				</div>

				<div class="field">
					<label class="field-label">Areas for Improvement</label>
					<textarea
						bind:value={weaknesses}
						class="form-control"
						rows="3"
						placeholder="Any concerns or weaknesses?"></textarea>
				</div>

				<div class="field">
					<label class="field-label">Additional Notes</label>
					<textarea
						bind:value={notes}
						class="form-control"
						rows="2"
						placeholder="Any other observations..."></textarea>
				</div>
			</div>

			<div class="modal-actions">
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
	}
	.applicant-name {
		font-weight: 700;
		font-size: 14px;
		color: $text;
	}
	// Background colour comes from getRecommendationColor() at runtime.
	.eval-badge {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.eval-badge-pending {
		background-color: $text-muted;
	}
	.card-meta {
		font-size: 12px;
		color: $text-muted;
		margin: 2px 0;
	}
	.card-rating {
		margin-top: 6px;
	}
	.star {
		font-size: 16px;
		color: $border-strong;
	}
	.star.filled {
		color: $yellow-primary;
	}

	/* Modal */
	.close-btn {
		font-size: 24px;
		line-height: 1;
	}
	.star-input {
		display: flex;
		gap: 4px;
	}
	.star-btn {
		background: none;
		border: none;
		font-size: 28px;
		cursor: pointer;
		color: $border-strong;
		padding: 0;
		transition: color 0.15s;
	}
	.star-btn.filled {
		color: $yellow-primary;
	}
	.star-btn:hover {
		color: $warning;
	}
</style>
