<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import { getActiveRoles, getTeams } from '$lib/utils/supabase';
	import { getCandidates, STAGE_LABELS } from '$lib/utils/candidates';
	import type { CandidateRow } from '$lib/utils/candidates';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import Toast from '$lib/components/recruiter/Toast.svelte';
	import CandidateList from '$lib/components/recruiter/CandidateList.svelte';
	import { selectedJob } from '$lib/stores/jobFilter';
	import type { Applicant, JobPosting, Team } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	let applicants: CandidateRow[] = [];
	let orgId: number | null = null;
	let jobs: (JobPosting & { applicantCount: number })[] = [];
	let teams: Team[] = [];
	let loading = true;
	let listLoading = false;
	let list: CandidateList;

	// Bulk selection
	let selectedIds: Set<number> = new Set();
	let selectMode = false;
	let bulkStatus = 'pending';
	let bulkUpdating = false;

	// Bulk comment
	let showBulkComment = false;
	let bulkComment = '';
	let bulkCommentDecision = 'neutral';

	// Bulk email
	let showBulkEmail = false;
	let bulkEmailSubject = '';
	let bulkEmailBody = '';
	let bulkEmailSending = false;
	let bulkEmailResult = '';

	// Realtime
	let realtimeChannel: RealtimeChannel | null = null;
	let toasts: { id: number; message: string; type: 'info' | 'success' | 'error' }[] = [];
	let toastCounter = 0;

	$: slug = $page.params.slug;

	// Re-fetch when selected job changes (only when a job is selected)
	$: if (orgId && $selectedJob) loadApplicants($selectedJob.id);

	// Clear applicants when job is deselected
	$: if (!$selectedJob) applicants = [];

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

		// The team filter narrows the queue to one team's applications.
		teams = await getTeams(orgData.id);

		// Load active jobs for the picker
		const activeJobs = await getActiveRoles(orgId ?? undefined);
		const jobsWithCounts = await Promise.all(
			activeJobs.map(async (job) => {
				const { count } = await supabase
					.from('applicants')
					.select('*', { count: 'exact', head: true })
					.eq('org_id', orgId!)
					.eq('job', job.id);
				return { ...job, applicantCount: count || 0 };
			})
		);
		jobs = jobsWithCounts;
		loading = false;

		// Realtime: subscribe to new applicants for this org
		realtimeChannel = supabase
			.channel(`review-applicants-${orgId}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'applicants', filter: `org_id=eq.${orgId}` },
				(payload) => {
					const newApp = payload.new as Applicant;
					// Re-fetch rather than push the raw row — the list needs the
					// enriched pipeline state that getCandidates() assembles.
					if ($selectedJob && newApp.job === $selectedJob.id) {
						loadApplicants($selectedJob.id);
					}
					addToast(`New applicant: ${newApp.name}`, 'info');
					// Refresh job counts
					refreshJobCounts();
				}
			)
			.subscribe();
	});

	onDestroy(() => {
		if (realtimeChannel) supabase.removeChannel(realtimeChannel);
	});

	function addToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		const id = ++toastCounter;
		toasts = [...toasts, { id, message, type }];
	}

	function removeToast(id: number) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	async function refreshJobCounts() {
		if (!orgId) return;
		const activeJobs = await getActiveRoles(orgId ?? undefined);
		const jobsWithCounts = await Promise.all(
			activeJobs.map(async (job) => {
				const { count } = await supabase
					.from('applicants')
					.select('*', { count: 'exact', head: true })
					.eq('org_id', orgId!)
					.eq('job', job.id);
				return { ...job, applicantCount: count || 0 };
			})
		);
		jobs = jobsWithCounts;
	}

	function selectJob(job: JobPosting & { applicantCount: number }) {
		selectedJob.set(job);
	}

	async function loadApplicants(jobId: number) {
		if (!orgId) return;
		listLoading = true;
		try {
			applicants = await getCandidates(orgId, jobId);
		} catch (e) {
			console.error('Failed to load applicants:', e);
			applicants = [];
		}
		listLoading = false;
	}

	const navigateToReview = (id: number) => {
		goto(`/private/${slug}/review/candidate?id=${id}`);
	};

	/** The rows the user is currently looking at, after the list's own filters. */
	function currentRows(): CandidateRow[] {
		return list?.getFiltered() ?? applicants;
	}

	function exitSelectMode() {
		selectMode = false;
		selectedIds = new Set();
	}

	async function bulkUpdateStatus() {
		if (selectedIds.size === 0) return;
		bulkUpdating = true;

		const ids = Array.from(selectedIds);
		const { error } = await supabase
			.from('applicants')
			.update({ status: bulkStatus })
			.in('id', ids);

		if (error) {
			console.error('Bulk update failed:', error);
		} else {
			if ($selectedJob) await loadApplicants($selectedJob.id);
			selectedIds = new Set();
		}
		bulkUpdating = false;
	}

	async function bulkDelete() {
		if (selectedIds.size === 0) return;
		if (!confirm(`Delete ${selectedIds.size} applicant(s)? This cannot be undone.`)) return;
		bulkUpdating = true;

		const ids = Array.from(selectedIds);
		const { error } = await supabase.from('applicants').delete().in('id', ids);

		if (error) {
			console.error('Bulk delete failed:', error);
			alert('Failed to delete: ' + error.message);
		} else {
			if ($selectedJob) await loadApplicants($selectedJob.id);
			selectedIds = new Set();
		}
		bulkUpdating = false;
	}

	async function bulkAddComment() {
		if (selectedIds.size === 0 || !bulkComment.trim()) return;
		bulkUpdating = true;

		const {
			data: { user }
		} = await supabase.auth.getUser();
		const userEmail = user?.email ?? 'unknown';

		const ids = Array.from(selectedIds);
		// Fetch current comments for selected applicants
		const { data: selected } = await supabase
			.from('applicants')
			.select('id, comments')
			.in('id', ids);

		if (selected) {
			for (const app of selected) {
				const existing = app.comments?.comments ?? [];
				const newComment = {
					id: Date.now() + app.id,
					email: userEmail,
					comment: bulkComment.trim(),
					decision: bulkCommentDecision
				};
				const { error } = await supabase
					.from('applicants')
					.update({ comments: { comments: [...existing, newComment] } })
					.eq('id', app.id);
				if (error) console.error(`Comment failed for ${app.id}:`, error);
			}
		}

		bulkComment = '';
		showBulkComment = false;
		if ($selectedJob) await loadApplicants($selectedJob.id);
		bulkUpdating = false;
		addToast(`Comment added to ${ids.length} applicant(s)`, 'success');
	}

	async function bulkSendEmail() {
		if (selectedIds.size === 0 || !bulkEmailSubject.trim() || !bulkEmailBody.trim()) return;
		if (!orgId) return;
		bulkEmailSending = true;
		bulkEmailResult = '';

		const ids = Array.from(selectedIds);
		const targets = applicants.filter((a) => ids.includes(a.id));

		try {
			const resp = await fetch(`/private/${slug}/schedule/notify`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orgId,
					recipientType: 'custom',
					customEmails: targets.map((a) => ({
						to: a.email,
						subject: bulkEmailSubject,
						text: bulkEmailBody.replace(/\{name\}/g, a.name).replace(/\{email\}/g, a.email)
					}))
				})
			});
			const data = await resp.json();
			if (data.dryRun) {
				bulkEmailResult = `Dry run: RESEND_API_KEY not configured. Would send to ${targets.length} recipients.`;
			} else if (data.error) {
				bulkEmailResult = `Error: ${data.error}`;
			} else {
				bulkEmailResult = `Sent ${data.sent ?? 0} email(s). ${data.failed ? data.failed + ' failed.' : ''}`;
				showBulkEmail = false;
			}
		} catch (e: unknown) {
			bulkEmailResult = e instanceof Error ? e.message : 'Network error';
		}
		bulkEmailSending = false;
	}

	function exportCSV() {
		const rows0 = currentRows();
		const targets =
			selectMode && selectedIds.size > 0 ? rows0.filter((a) => selectedIds.has(a.id)) : rows0;

		const headers = ['Name', 'Email', 'Team', 'Stage', 'Status', 'Applied', 'Job ID'];
		const rows = targets.map((a) => [
			`"${a.name}"`,
			`"${a.email}"`,
			`"${a.team.legacy_multi ? `Legacy: ${a.team.all_names.join(' + ')}` : (a.team.name ?? '')}"`,
			STAGE_LABELS[a.stage],
			a.status,
			new Date(a.created_at).toLocaleDateString(),
			a.job ?? ''
		]);

		const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `applicants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="layout">
	<div class="content-left">
		{#if loading}
			<div class="skeleton" style="height: 28px; width: 240px; margin-bottom: 10px;"></div>
			<div class="skeleton" style="height: 14px; width: 300px; margin-bottom: 20px;"></div>
			<div class="job-grid">
				{#each [1, 2, 3] as _}
					<div class="skeleton-card">
						<div class="skeleton" style="height: 18px; width: 60%; margin-bottom: 10px;"></div>
						<div class="skeleton" style="height: 14px; width: 40%;"></div>
					</div>
				{/each}
			</div>
		{:else if !$selectedJob}
			<!-- Job Picker -->
			<div class="page-head">
				<div>
					<h4 class="page-title">Review Applications</h4>
					<p class="page-subtitle">Select a job posting to review its applicants.</p>
				</div>
			</div>

			{#if jobs.length === 0}
				<div class="empty-state">
					<i class="fi fi-br-briefcase"></i>
					<div class="empty-title">No active job postings.</div>
					<a href="/private/{slug}/settings/jobs" class="btn btn-tertiary">Manage Job Postings</a>
				</div>
			{:else}
				<div class="job-grid">
					{#each jobs as job}
						<div
							class="job-card"
							on:click={() => selectJob(job)}
							on:keydown={() => {}}
							role="button"
							tabindex="0"
						>
							<span class="job-name">{job.name}</span>
							{#if job.description}
								<p class="job-desc">{job.description}</p>
							{/if}
							<span class="job-count"
								>{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span
							>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="page-head">
				<div>
					<h4 class="page-title">Review Applications — {$selectedJob.name}</h4>
				</div>
			</div>

			<CandidateList
				bind:this={list}
				candidates={applicants}
				{teams}
				loading={listLoading}
				bind:selectMode
				bind:selectedIds
				showJob={false}
				emptyMessage="No applicants found."
				on:open={(e) => navigateToReview(e.detail)}
			>
				<svelte:fragment slot="actions">
					{#if !selectMode}
						<button class="btn btn-quaternary btn-sm" on:click={() => (selectMode = true)}>
							Select
						</button>
					{:else}
						<button class="btn btn-quaternary btn-sm" on:click={exitSelectMode}> Cancel </button>
					{/if}
					<button class="btn btn-quaternary btn-sm" on:click={exportCSV} title="Export to CSV">
						<i class="fi fi-br-download"></i> CSV
					</button>
				</svelte:fragment>

				<svelte:fragment slot="bulk">
					<select
						bind:value={bulkStatus}
						class="form-control"
						style="max-width: 140px; font-size: 12px;"
					>
						<option value="pending">Set Pending</option>
						<option value="interview">Set Interview</option>
						<option value="accepted">Set Accepted</option>
						<option value="denied">Set Denied</option>
					</select>
					<button
						class="btn btn-tertiary btn-sm"
						on:click={bulkUpdateStatus}
						disabled={selectedIds.size === 0 || bulkUpdating}
					>
						{bulkUpdating ? 'Updating...' : 'Apply'}
					</button>
					<button
						class="btn btn-sm btn-danger btn-bulk-delete"
						on:click={bulkDelete}
						disabled={selectedIds.size === 0 || bulkUpdating}
					>
						Delete ({selectedIds.size})
					</button>
					<button
						class="btn btn-quaternary btn-sm"
						on:click={() => (showBulkComment = !showBulkComment)}
						disabled={selectedIds.size === 0}
					>
						<i class="fi fi-br-comment-alt"></i> Note
					</button>
					<button
						class="btn btn-quaternary btn-sm"
						on:click={() => {
							showBulkEmail = !showBulkEmail;
							bulkEmailResult = '';
						}}
						disabled={selectedIds.size === 0}
					>
						<i class="fi fi-br-envelope"></i> Email
					</button>
				</svelte:fragment>

				<svelte:fragment slot="bulk-panels">
					{#if showBulkComment && selectMode}
						<div class="panel bulk-panel">
							<h6 style="margin: 0 0 8px; font-size: 13px;">
								Add Note to {selectedIds.size} Applicant(s)
							</h6>
							<div style="display: flex; gap: 8px; margin-bottom: 8px;">
								<select
									bind:value={bulkCommentDecision}
									class="form-control"
									style="max-width: 140px; font-size: 12px;"
								>
									<option value="neutral">Neutral</option>
									<option value="positive">Positive</option>
									<option value="negative">Negative</option>
								</select>
							</div>
							<textarea
								bind:value={bulkComment}
								class="form-control"
								rows="2"
								placeholder="Enter note..."
								style="font-size: 12px; margin-bottom: 8px;"></textarea>
							<div style="display: flex; gap: 8px;">
								<button
									class="btn btn-tertiary btn-sm"
									on:click={bulkAddComment}
									disabled={!bulkComment.trim() || bulkUpdating}
								>
									{bulkUpdating ? 'Saving...' : 'Add Note'}
								</button>
								<button class="btn btn-quaternary btn-sm" on:click={() => (showBulkComment = false)}
									>Cancel</button
								>
							</div>
						</div>
					{/if}

					{#if showBulkEmail && selectMode}
						<div class="panel bulk-panel">
							<h6 style="margin: 0 0 8px; font-size: 13px;">
								Email {selectedIds.size} Applicant(s)
							</h6>
							<p class="bulk-hint" style="margin: 0 0 8px;">
								Use {'{name}'} and {'{email}'} as placeholders.
							</p>
							<input
								type="text"
								bind:value={bulkEmailSubject}
								class="form-control"
								placeholder="Subject"
								style="font-size: 12px; margin-bottom: 8px;"
							/>
							<textarea
								bind:value={bulkEmailBody}
								class="form-control"
								rows="4"
								placeholder="Email body..."
								style="font-size: 12px; margin-bottom: 8px; font-family: monospace;"></textarea>
							<div style="display: flex; gap: 8px; align-items: center;">
								<button
									class="btn btn-tertiary btn-sm"
									on:click={bulkSendEmail}
									disabled={!bulkEmailSubject.trim() || !bulkEmailBody.trim() || bulkEmailSending}
								>
									{bulkEmailSending ? 'Sending...' : 'Send'}
								</button>
								<button
									class="btn btn-quaternary btn-sm"
									on:click={() => {
										showBulkEmail = false;
										bulkEmailResult = '';
									}}>Cancel</button
								>
								{#if bulkEmailResult}
									<span class="bulk-hint">{bulkEmailResult}</span>
								{/if}
							</div>
						</div>
					{/if}
				</svelte:fragment>
			</CandidateList>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={1} />
</div>

{#each toasts as toast (toast.id)}
	<Toast message={toast.message} type={toast.type} onDismiss={() => removeToast(toast.id)} />
{/each}

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	.skeleton-card {
		background: $surface;
		border-radius: $radius;
		padding: 20px;
		box-shadow: $shadow;
		border-left: 4px solid $border;
	}

	/* Job picker */
	.job-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 15px;
		margin-top: 15px;
	}
	.job-card {
		background-color: $surface;
		border-radius: $radius;
		padding: 20px;
		box-shadow: $shadow;
		cursor: pointer;
		transition:
			box-shadow 0.2s ease,
			transform 0.2s ease;
		border-left: 4px solid $yellow-primary;
	}
	.job-card:hover {
		box-shadow: $shadow-lg;
		transform: translateY(-2px);
	}
	.job-name {
		font-weight: 800;
		font-size: 16px;
		color: $text;
	}
	.job-desc {
		font-size: 13px;
		color: $text-muted;
		margin: 6px 0 12px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.job-count {
		font-size: 13px;
		font-weight: 700;
		color: $text;
	}

	/* Filter bar, list, and pagination styles live in CandidateList.svelte.
	   These remain for the bulk panels this page slots into it. */
	.btn-bulk-delete {
		background-color: $danger;
		color: $surface;
		border: none;
		font-size: 11px;
		padding: 4px 10px;
	}
	.bulk-hint {
		font-size: 11px;
		color: $text-muted;
	}
</style>
