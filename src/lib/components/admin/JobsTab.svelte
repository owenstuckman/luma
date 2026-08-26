<script lang="ts">
	import {
		supabase,
		toggleJobPostingActive,
		deleteJobPosting,
		adminCreateJobPosting
	} from '$lib/utils/supabase';
	import type { AdminJobPosting, Organization } from '$lib/types';

	let {
		jobPostings,
		organizations,
		onreload = () => {}
	}: {
		jobPostings: AdminJobPosting[];
		organizations: Organization[];
		onreload?: () => void;
	} = $props();

	let jobOrgFilter = $state('');
	let jobStatusFilter = $state<'all' | 'active' | 'inactive'>('all');
	let showCreateJob = $state(false);
	let newJobName = $state('');
	let newJobDescription = $state('');
	let newJobOrgId = $state('');
	let jobCreateError = $state('');
	let jobCreateSuccess = $state('');
	let jobCreating = $state(false);

	const filteredJobs = $derived(
		jobPostings.filter((j) => {
			const orgMatch =
				!jobOrgFilter || j.org_name?.toLowerCase().includes(jobOrgFilter.toLowerCase());
			const statusMatch =
				jobStatusFilter === 'all' ||
				(jobStatusFilter === 'active' && j.active_flg) ||
				(jobStatusFilter === 'inactive' && !j.active_flg);
			return orgMatch && statusMatch;
		})
	);

	async function toggleJob(jobId: number, currentActive: boolean) {
		try {
			await toggleJobPostingActive(jobId, !currentActive);
			onreload();
		} catch (e: any) {
			console.error(e);
		}
	}

	async function deleteJob(jobId: number) {
		if (!confirm('Delete this job posting? This cannot be undone.')) return;
		try {
			await deleteJobPosting(jobId);
			onreload();
		} catch (e: any) {
			console.error(e);
		}
	}

	async function createJob() {
		jobCreateError = '';
		jobCreateSuccess = '';
		if (!newJobName.trim() || !newJobOrgId) {
			jobCreateError = 'Name and organization are required.';
			return;
		}
		jobCreating = true;
		try {
			const { data: userData } = await supabase.auth.getUser();
			const ownerEmail = userData?.user?.email || '';
			await adminCreateJobPosting({
				name: newJobName,
				description: newJobDescription,
				owner: ownerEmail,
				org_id: parseInt(newJobOrgId),
				questions: { steps: [] },
				schedule: {}
			});
			jobCreateSuccess = `Created "${newJobName}" successfully.`;
			newJobName = '';
			newJobDescription = '';
			newJobOrgId = '';
			showCreateJob = false;
			onreload();
		} catch (e: any) {
			jobCreateError = e.message;
		}
		jobCreating = false;
	}
</script>

<div
	style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;"
>
	<div class="filter-bar filter-bar-inline">
		<input
			class="form-control"
			bind:value={jobOrgFilter}
			placeholder="Filter by org name..."
			style="max-width: 250px;"
		/>
		<select class="form-select" bind:value={jobStatusFilter} style="max-width: 150px;">
			<option value="all">All Status</option>
			<option value="active">Active</option>
			<option value="inactive">Inactive</option>
		</select>
		<span class="muted" style="font-size: 12px;">{filteredJobs.length} postings</span>
	</div>
	<button class="btn btn-primary" onclick={() => (showCreateJob = !showCreateJob)}>
		{showCreateJob ? 'Cancel' : '+ New Job Posting'}
	</button>
</div>

{#if jobCreateSuccess}
	<div class="alert-soft alert-success">{jobCreateSuccess}</div>
{/if}

{#if showCreateJob}
	<div class="panel">
		<h6>Create Job Posting</h6>
		<div class="field">
			<label class="field-label">Organization</label>
			<select class="form-select" bind:value={newJobOrgId}>
				<option value="">Select organization...</option>
				{#each organizations as org}
					<option value={org.id}>{org.name} (/{org.slug})</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label class="field-label">Position Name</label>
			<input class="form-control" bind:value={newJobName} placeholder="e.g. Software Engineer" />
		</div>
		<div class="field">
			<label class="field-label">Description</label>
			<textarea
				class="form-control"
				bind:value={newJobDescription}
				rows="2"
				placeholder="Brief description of the role"></textarea>
		</div>
		{#if jobCreateError}
			<p class="field-error">{jobCreateError}</p>
		{/if}
		<button class="btn btn-primary" onclick={createJob} disabled={jobCreating}>
			{jobCreating ? 'Creating...' : 'Create Job Posting'}
		</button>
	</div>
{/if}

<div class="panel panel-flush jobs-table">
	<div class="table-header">
		<span class="col-name">Job Name</span>
		<span class="col-org">Organization</span>
		<span class="col-status">Status</span>
		<span class="col-apps">Applicants</span>
		<span class="col-actions">Actions</span>
	</div>
	{#each filteredJobs as job}
		<div class="table-row">
			<span class="col-name">
				<span class="row-name">{job.name}</span>
				{#if job.description}<span class="row-sub">{job.description}</span>{/if}
			</span>
			<span class="col-org">
				{#if job.org_name}
					<span class="row-name">{job.org_name}</span>
					<span class="row-sub">/{job.org_slug}</span>
				{:else}
					<span class="muted">No org</span>
				{/if}
			</span>
			<span class="col-status">
				<span class="pill {job.active_flg ? 'pill-success' : 'pill-danger'}">
					{job.active_flg ? 'Active' : 'Inactive'}
				</span>
			</span>
			<span class="col-apps">{job.applicant_count}</span>
			<span class="col-actions">
				<button class="btn btn-quaternary btn-sm" onclick={() => toggleJob(job.id, job.active_flg)}>
					{job.active_flg ? 'Deactivate' : 'Activate'}
				</button>
				{#if job.org_slug}
					<a href="/private/{job.org_slug}/settings/jobs/{job.id}" class="btn btn-quaternary btn-sm"
						>Edit</a
					>
				{/if}
				<button class="btn btn-danger btn-sm" onclick={() => deleteJob(job.id)}>Delete</button>
			</span>
		</div>
	{/each}
	{#if filteredJobs.length === 0}
		<p class="muted" style="padding: 20px;">No job postings found.</p>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	// Extends the shared .filter-bar: this one sits inline with the New Job button.
	.filter-bar-inline {
		margin-bottom: 0;
	}
	.table-header {
		display: grid;
		grid-template-columns: 2fr 1.5fr 100px 80px 1fr;
		padding: 10px 16px;
		background: $light-secondary;
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
	}
	.table-row {
		display: grid;
		grid-template-columns: 2fr 1.5fr 100px 80px 1fr;
		padding: 12px 16px;
		border-bottom: 1px solid $border-faint;
		align-items: center;
		&:last-child {
			border-bottom: none;
		}
	}
	.col-actions {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.btn-danger {
		background-color: $danger-bg;
		color: $danger-fg;
		border: 1px solid $danger-border;
		&:hover {
			// One step darker than $danger-bg; no token exists for this hover tint.
			background-color: $danger-bg-strong;
		}
	}
</style>
