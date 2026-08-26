<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/utils/supabase';
	import type { Organization, JobPosting } from '$lib/types';

	let org: Organization | null = null;
	let jobs: JobPosting[] = [];
	let loading = true;
	let error = '';

	onMount(async () => {
		const slug = $page.params.slug;

		const { data: orgData, error: orgError } = await supabase
			.from('organizations')
			.select('*')
			.eq('slug', slug)
			.single();

		if (orgError || !orgData) {
			error = 'Organization not found.';
			loading = false;
			return;
		}

		org = orgData;

		const { data: jobData } = await supabase
			.from('job_posting')
			.select('*')
			.eq('org_id', orgData.id)
			.eq('active_flg', true)
			.order('created_at', { ascending: false });

		jobs = jobData || [];
		loading = false;
	});
</script>

{#if loading}
	<div class="loading-screen">
		<p>Loading...</p>
	</div>
{:else if error}
	<div class="loading-screen">
		<div class="error-card">
			<h2>Organization not found</h2>
			<p class="muted">The organization you're looking for doesn't exist.</p>
			<a href="/">
				<button class="btn btn-primary">Back to Home</button>
			</a>
		</div>
	</div>
{:else if org}
	<div class="apply-screen">
		<div class="apply-header">
			{#if org.logo_url}
				<img src={org.logo_url} alt="{org.name} logo" class="org-logo" />
			{/if}
			<h1 style="color: {org.primary_color};">{org.name}</h1>
			<p class="apply-subtitle">Open Positions</p>
		</div>

		<div class="apply-content">
			{#if jobs.length === 0}
				<div class="empty-state">
					<i class="fi fi-br-file-circle-xmark"></i>
					<p class="empty-hint">No open positions right now. Check back later!</p>
				</div>
			{:else}
				<div class="job-list">
					{#each jobs as job}
						<a href="/apply/{org.slug}/{job.id}" class="list-row list-row-clickable job-card">
							<div class="job-card-left">
								<h5 class="job-title">{job.name}</h5>
								{#if job.description}
									<p class="job-desc">{job.description}</p>
								{/if}
							</div>
							<div class="job-card-right">
								<span class="pill apply-badge" style="background-color: {org.primary_color};"
									>Apply</span
								>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<div class="apply-footer">
			<a href="/" class="back-link">
				<i class="fi fi-br-arrow-left"></i> Back to LUMA
			</a>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.loading-screen,
	.apply-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		background-color: $light-secondary;
	}

	.loading-screen {
		justify-content: center;
	}

	.error-card {
		background-color: $dark-primary;
		border-radius: 10px;
		padding: 40px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 15px;
	}

	.apply-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 20px 20px;
		gap: 5px;
	}
	.org-logo {
		max-height: 60px;
		margin-bottom: 10px;
	}
	.apply-subtitle {
		color: $text-muted;
		font-weight: 500;
		font-size: 14px;
	}

	.apply-content {
		width: 100%;
		max-width: 600px;
		padding: 0 20px;
	}

	.job-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	// Layout, shadow and hover come from `.list-row` / `.list-row-clickable`;
	// only the roomier padding is particular to a job posting.
	.job-card {
		padding: 20px;
		margin-bottom: 0;
		text-decoration: none;
		color: $default;
	}
	.job-card:hover {
		color: $default;
	}
	.job-card-left {
		flex: 1;
	}
	.job-title {
		margin-bottom: 4px;
	}
	.job-desc {
		color: $text-muted;
		font-size: 13px;
		margin: 0;
		line-height: 1.4;
	}
	.job-card-right {
		margin-left: 20px;
		flex-shrink: 0;
	}
	// Background is the org's own colour, so it has to stay inline.
	.apply-badge {
		padding: 6px 16px;
		font-size: 12px;
		color: $dark-primary;
	}

	.apply-footer {
		padding: 30px;
	}
</style>
