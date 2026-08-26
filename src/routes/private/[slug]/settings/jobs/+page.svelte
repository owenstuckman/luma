<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import {
		getAllJobPostings,
		createJobPosting,
		deleteJobPosting,
		toggleJobPostingActive
	} from '$lib/utils/supabase';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import type { JobPosting } from '$lib/types';

	let jobs: JobPosting[] = [];
	let orgId: number | null = null;
	let loading = true;

	// Create new job
	let showCreate = false;
	let newName = '';
	let newDescription = '';
	let creating = false;
	let createError = '';

	$: slug = $page.params.slug;

	onMount(async () => {
		const { data: orgData } = await supabase
			.from('organizations')
			.select('id')
			.eq('slug', slug)
			.single();

		if (!orgData) return;
		orgId = orgData.id;
		await loadJobs();
		loading = false;
	});

	async function loadJobs() {
		if (!orgId) return;
		jobs = await getAllJobPostings(orgId);
	}

	async function handleCreate() {
		if (!orgId || !newName.trim()) return;
		creating = true;
		createError = '';

		try {
			const { data: userData } = await supabase.auth.getUser();
			const ownerEmail = userData?.user?.email || '';

			await createJobPosting({
				name: newName,
				description: newDescription,
				owner: ownerEmail,
				org_id: orgId,
				questions: { steps: [] },
				schedule: {}
			});

			newName = '';
			newDescription = '';
			showCreate = false;
			await loadJobs();
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create';
		} finally {
			creating = false;
		}
	}

	async function handleToggle(job: JobPosting) {
		try {
			await toggleJobPostingActive(job.id, !job.active_flg);
			await loadJobs();
		} catch (err) {
			console.error('Toggle failed:', err);
		}
	}

	async function handleDelete(job: JobPosting) {
		if (!confirm(`Delete "${job.name}"? This cannot be undone.`)) return;
		try {
			await deleteJobPosting(job.id);
			await loadJobs();
		} catch (err) {
			console.error('Delete failed:', err);
		}
	}
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<a href="/private/{slug}/settings" class="back-link">
					<i class="fi fi-br-arrow-left"></i> Settings
				</a>
				<h4 class="page-title">Job Postings</h4>
				<p class="page-subtitle">
					Every posting for this organization, and the form each one asks.
				</p>
			</div>
			<div class="page-actions">
				<button class="btn btn-tertiary" on:click={() => (showCreate = !showCreate)}>
					<i class="fi fi-br-plus"></i> New Posting
				</button>
			</div>
		</div>

		{#if showCreate}
			<div class="panel create-panel">
				<div class="panel-head">
					<h5 class="panel-title">Create New Job Posting</h5>
				</div>
				<div class="field">
					<label class="field-label">Position Name</label>
					<input
						type="text"
						class="form-control"
						bind:value={newName}
						placeholder="e.g. Software Engineer"
					/>
				</div>
				<div class="field">
					<label class="field-label">Description</label>
					<textarea
						class="form-control"
						bind:value={newDescription}
						rows="2"
						placeholder="Brief description of the role"></textarea>
				</div>
				{#if createError}
					<p class="field-error">{createError}</p>
				{/if}
				<div class="create-actions">
					<button class="btn btn-tertiary" on:click={handleCreate} disabled={creating}>
						{creating ? 'Creating...' : 'Create'}
					</button>
					<button class="btn btn-quaternary" on:click={() => (showCreate = false)}>Cancel</button>
				</div>
			</div>
		{/if}

		{#if loading}
			<p class="muted">Loading...</p>
		{:else if jobs.length === 0}
			<div class="empty-state">
				<i class="fi fi-br-document"></i>
				<div class="empty-title">No job postings yet</div>
				<p class="empty-hint">Create one to get started.</p>
			</div>
		{:else}
			<div class="job-list">
				{#each jobs as job}
					<div class="list-row job-row">
						<div class="job-row-info">
							<div class="job-row-title-line">
								<span class="job-row-name">{job.name}</span>
								<span
									class="pill"
									class:pill-success={job.active_flg}
									class:pill-neutral={!job.active_flg}
								>
									{job.active_flg ? 'Active' : 'Inactive'}
								</span>
							</div>
							{#if job.description}
								<p class="job-row-desc">{job.description}</p>
							{/if}
							<div class="row-stats job-row-meta">
								<span>Created {new Date(job.created_at).toLocaleDateString()}</span>
								<span>{job.questions?.steps?.length || 0} form steps</span>
							</div>
						</div>
						<div class="job-row-actions">
							<a href="/private/{slug}/settings/jobs/{job.id}" class="btn btn-tertiary btn-sm">
								Edit Form
							</a>
							<button class="btn btn-quaternary btn-sm" on:click={() => handleToggle(job)}>
								{job.active_flg ? 'Deactivate' : 'Activate'}
							</button>
							<button class="btn btn-danger-outline btn-sm" on:click={() => handleDelete(job)}>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={6} />
</div>

<style lang="scss">
	@use '../../../../../styles/col.scss' as *;

	// Page furniture (.page-head, .panel, .field, .pill, .list-row, .empty-state,
	// .row-stats, .muted) is global — see src/styles/ui.scss. Only the bits unique
	// to this page live here.

	.create-panel {
		max-width: 500px;
	}
	.create-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	.job-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	// Extends the shared `.list-row`: taller, top-aligned, multi-line content.
	.job-row {
		align-items: flex-start;
		padding: 16px 20px;
		margin-bottom: 0;
		gap: 20px;
	}
	.job-row-info {
		flex: 1;
		min-width: 0;
	}
	.job-row-title-line {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.job-row-name {
		font-weight: 700;
		font-size: 15px;
	}
	.job-row-desc {
		font-size: 13px;
		color: $text-muted;
		margin: 0 0 6px;
	}
	.job-row-meta {
		gap: 16px;
		font-size: 11px;
	}
	.job-row-actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
		align-items: flex-start;
	}
</style>
