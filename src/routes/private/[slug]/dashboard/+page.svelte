<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/utils/supabase';
	import { getActiveRoles } from '$lib/utils/supabase';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import { selectedJob } from '$lib/stores/jobFilter';
	import type { Organization, JobPosting } from '$lib/types';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	let org: Organization | null = null;
	let userEmail = '';
	let jobs: (JobPosting & { applicantCount: number })[] = [];
	let loading = true;
	let realtimeChannel: RealtimeChannel | null = null;

	// Filtered stats (shown after a job is selected)
	let applicantCount = 0;
	let pendingCount = 0;
	let interviewCount = 0;
	let acceptedCount = 0;

	$: slug = $page.params.slug;

	// Re-run counts when selected job changes
	$: if (org && $selectedJob) loadCounts(org.id, $selectedJob.id);

	onMount(async () => {
		const { data: orgData } = await supabase
			.from('organizations')
			.select('*')
			.eq('slug', slug)
			.single();
		org = orgData;

		const { data: userData } = await supabase.auth.getUser();
		userEmail = userData?.user?.email || '';

		if (org) {
			const activeJobs = await getActiveRoles(org.id);

			// Fetch applicant count per job
			const jobsWithCounts = await Promise.all(
				activeJobs.map(async (job) => {
					const { count } = await supabase
						.from('applicants')
						.select('*', { count: 'exact', head: true })
						.eq('org_id', org!.id)
						.eq('job', job.id);
					return { ...job, applicantCount: count || 0 };
				})
			);
			jobs = jobsWithCounts;
		}

		loading = false;

		// Subscribe to realtime applicant inserts
		if (org) {
			realtimeChannel = supabase
				.channel(`applicants-org-${org.id}`)
				.on(
					'postgres_changes',
					{ event: 'INSERT', schema: 'public', table: 'applicants', filter: `org_id=eq.${org.id}` },
					async () => {
						// Refresh job counts when a new applicant submits
						if (!org) return;
						const activeJobs = await getActiveRoles(org.id);
						const jobsWithCounts = await Promise.all(
							activeJobs.map(async (job) => {
								const { count } = await supabase
									.from('applicants')
									.select('*', { count: 'exact', head: true })
									.eq('org_id', org!.id)
									.eq('job', job.id);
								return { ...job, applicantCount: count || 0 };
							})
						);
						jobs = jobsWithCounts;
						if ($selectedJob) await loadCounts(org!.id, $selectedJob.id);
					}
				)
				.subscribe();
		}
	});

	onDestroy(() => {
		if (realtimeChannel) {
			supabase.removeChannel(realtimeChannel);
		}
	});

	function selectJob(job: JobPosting & { applicantCount: number }) {
		selectedJob.set(job);
	}

	function clearSelection() {
		selectedJob.set(null);
	}

	async function loadCounts(orgId: number, jobId: number) {
		let totalQ = supabase
			.from('applicants')
			.select('*', { count: 'exact', head: true })
			.eq('org_id', orgId)
			.eq('job', jobId);
		const { count: total } = await totalQ;
		applicantCount = total || 0;

		let pendingQ = supabase
			.from('applicants')
			.select('*', { count: 'exact', head: true })
			.eq('org_id', orgId)
			.eq('status', 'pending')
			.eq('job', jobId);
		const { count: pending } = await pendingQ;
		pendingCount = pending || 0;

		let interviewQ = supabase
			.from('applicants')
			.select('*', { count: 'exact', head: true })
			.eq('org_id', orgId)
			.eq('status', 'interview')
			.eq('job', jobId);
		const { count: interviews } = await interviewQ;
		interviewCount = interviews || 0;

		let acceptedQ = supabase
			.from('applicants')
			.select('*', { count: 'exact', head: true })
			.eq('org_id', orgId)
			.eq('status', 'accepted')
			.eq('job', jobId);
		const { count: accepted } = await acceptedQ;
		acceptedCount = accepted || 0;
	}
</script>

<div class="layout">
	<div class="content-left">
		{#if loading}
			<div class="skeleton" style="height: 28px; width: 200px; margin-bottom: 10px;"></div>
			<div class="skeleton" style="height: 16px; width: 350px; margin-bottom: 25px;"></div>
			<div class="job-grid">
				{#each [1, 2, 3] as _}
					<div class="skeleton-card">
						<div class="skeleton" style="height: 18px; width: 60%; margin-bottom: 10px;"></div>
						<div class="skeleton" style="height: 14px; width: 80%; margin-bottom: 14px;"></div>
						<div class="skeleton" style="height: 14px; width: 40%;"></div>
					</div>
				{/each}
			</div>
		{:else if !$selectedJob}
			<!-- Job Picker -->
			<div class="page-head">
				<div>
					<h4 class="page-title">Hello, {userEmail}</h4>
					<p class="page-subtitle">
						Welcome to the {org?.name || ''} recruiter dashboard. Select a job posting to get started.
					</p>
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
							<div class="job-meta">
								<span class="job-count"
									>{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span
								>
								<span class="job-date">Created {new Date(job.created_at).toLocaleDateString()}</span
								>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- Dashboard for selected job -->
			<div class="page-head">
				<div>
					<h4 class="page-title">{$selectedJob.name}</h4>
					{#if $selectedJob.description}
						<p class="page-subtitle">{$selectedJob.description}</p>
					{/if}
				</div>
				<div class="page-actions">
					<button class="btn btn-quaternary btn-sm" on:click={clearSelection}>
						<i class="fi fi-br-arrow-left"></i> All Jobs
					</button>
				</div>
			</div>

			<div class="stat-grid">
				<div class="stat-card">
					<span class="stat-number">{applicantCount}</span>
					<span class="stat-label">Total Applicants</span>
				</div>
				<div class="stat-card">
					<span class="stat-number">{pendingCount}</span>
					<span class="stat-label">Pending Review</span>
				</div>
				<div class="stat-card">
					<span class="stat-number">{interviewCount}</span>
					<span class="stat-label">In Interview</span>
				</div>
				<div class="stat-card">
					<span class="stat-number">{acceptedCount}</span>
					<span class="stat-label">Accepted</span>
				</div>
			</div>

			<div class="quick-links">
				<div class="section-title">Quick Links</div>
				<div class="quick-link-row">
					<a href="/private/{slug}/review" class="btn btn-tertiary">Review Applicants</a>
					<a href="/private/{slug}/schedule/full" class="btn btn-tertiary">View Schedule</a>
					<a href="/private/{slug}/candidates" class="btn btn-tertiary">Candidates</a>
					<a href="/private/{slug}/settings" class="btn btn-tertiary">Settings</a>
				</div>
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={0} />
</div>

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
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 15px;
		margin-top: 20px;
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
	.job-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.job-count {
		font-size: 13px;
		font-weight: 700;
		color: $text;
	}
	.job-date {
		font-size: 11px;
		color: $text-muted;
	}

	.quick-links {
		margin-top: 30px;
		width: 100%;
	}
	.quick-link-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
