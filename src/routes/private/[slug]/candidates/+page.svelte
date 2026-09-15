<script context="module" lang="ts">
	import type { JobPosting, Team } from '$lib/types';

	/**
	 * The org, jobs and teams behind the roster, by slug. Module scope, so it
	 * outlives the component: coming back to /candidates paints straight away
	 * instead of re-resolving the org before anything else can load.
	 */
	const orgContext = new Map<string, { orgId: number; jobs: JobPosting[]; teams: Team[] }>();
</script>

<script lang="ts">
	// Org-wide candidate roster. Unlike /review (which is scoped to one job and
	// will narrow to the current user's assigned applications in Phase 3), this
	// lists every candidate across every posting with their pipeline stage.
	//
	// Loads stale-while-revalidate: the last roster this tab saw renders at once
	// (so returning from a candidate is instant and keeps its scroll position),
	// and a fresh copy replaces it as soon as it arrives.
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		getOrgBySlug,
		getActiveRoles,
		getTeams,
		bulkUpdateApplicantStatus
	} from '$lib/utils/supabase';
	import {
		getCandidates,
		peekCandidates,
		STAGE_COLORS,
		STAGE_LABELS,
		STAGE_ORDER
	} from '$lib/utils/candidates';
	import type { CandidateRow, CandidateStage } from '$lib/utils/candidates';
	import { readFilters, writeFilters } from '$lib/utils/persistedFilters';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import CandidateList from '$lib/components/recruiter/CandidateList.svelte';
	import TeamRankings from '$lib/components/recruiter/TeamRankings.svelte';
	import BlindToggle from '$lib/components/recruiter/BlindToggle.svelte';

	const slug = $page.params.slug ?? '';
	const cached = orgContext.get(slug);
	const cachedRows = cached ? peekCandidates(cached.orgId) : null;

	let candidates: CandidateRow[] = cachedRows ?? [];
	let jobs: JobPosting[] = cached?.jobs ?? [];
	let teams: Team[] = cached?.teams ?? [];
	let orgId: number | null = cached?.orgId ?? null;
	let loading = cachedRows === null;
	let refreshing = false;
	let loadError = '';

	const filterKey = `candidates:${slug}:job`;
	let jobFilter: number | 'all' = readFilters<{ job: number | 'all' }>(filterKey)?.job ?? 'all';
	$: writeFilters(filterKey, { job: jobFilter });
	// A remembered job that no longer exists would filter the roster to nothing.
	$: if (jobs.length > 0 && jobFilter !== 'all' && !jobs.some((j) => j.id === jobFilter)) {
		jobFilter = 'all';
	}

	let selectMode = false;
	let selectedIds: Set<number> = new Set();
	let bulkStatus = 'pending';
	let bulkUpdating = false;
	let list: CandidateList;

	// Both tabs share one job filter. Rankings need a single posting, so "All
	// jobs" ranks the most recent one; picking a job there sets the filter here.
	$: rankingJob = jobFilter === 'all' ? null : jobFilter;
	const setRankingJob = (job: number) => (jobFilter = job);

	// Which view: the full roster, or one team's round 2 ranking. Remembered for
	// the tab like the filters, and restored after mount so it never disagrees
	// with the server-rendered markup.
	const tabKey = `candidates:${slug}:tab`;
	let tab: 'all' | 'rankings' = 'all';
	onMount(() => {
		if (readFilters<{ tab: string }>(tabKey)?.tab === 'rankings') tab = 'rankings';
	});
	function setTab(next: typeof tab) {
		tab = next;
		writeFilters(tabKey, { tab: next });
	}
	const openCandidate = (id: number) =>
		goto(`/private/${slug}/review/candidate?id=${id}&from=candidates`);

	$: visible = jobFilter === 'all' ? candidates : candidates.filter((c) => c.job === jobFilter);

	$: stageCounts = STAGE_ORDER.reduce<Record<CandidateStage, number>>(
		(acc, stage) => {
			acc[stage] = visible.filter((c) => c.stage === stage).length;
			return acc;
		},
		{} as Record<CandidateStage, number>
	);

	$: conflictCount = visible.filter((c) => c.hire_conflict).length;

	onMount(async () => {
		refreshing = !loading;
		try {
			let id = orgId;
			if (id === null) {
				const org = slug ? await getOrgBySlug(slug) : null;
				if (!org) {
					loadError = 'Organization not found.';
					return;
				}
				id = org.id;
				orgId = id;
			}

			[candidates, jobs, teams] = await Promise.all([
				getCandidates(id),
				getActiveRoles(id),
				getTeams(id)
			]);
			orgContext.set(slug, { orgId: id, jobs, teams });
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load candidates.';
		} finally {
			loading = false;
			refreshing = false;
		}
	});

	async function reload() {
		if (!orgId) return;
		candidates = await getCandidates(orgId);
	}

	function exitSelectMode() {
		selectMode = false;
		selectedIds = new Set();
	}

	async function bulkUpdateStatus() {
		if (selectedIds.size === 0) return;
		bulkUpdating = true;
		try {
			await bulkUpdateApplicantStatus(Array.from(selectedIds), bulkStatus);
			await reload();
			selectedIds = new Set();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Bulk update failed.';
		}
		bulkUpdating = false;
	}

	function exportCSV() {
		const rows = list?.getFiltered() ?? visible;
		const targets =
			selectMode && selectedIds.size > 0 ? rows.filter((c) => selectedIds.has(c.id)) : rows;

		const headers = [
			'Name',
			'Email',
			'Job',
			'Team',
			'Stage',
			'Status',
			'Interviews',
			'Evaluated',
			'Avg Rating',
			'Decisions',
			'Applied'
		];
		const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const body = targets.map((c) =>
			[
				cell(c.name),
				cell(c.email),
				cell(c.job_name),
				cell(c.team.legacy_multi ? `Legacy: ${c.team.all_names.join(' + ')}` : (c.team.name ?? '')),
				cell(STAGE_LABELS[c.stage]),
				cell(c.status),
				c.interview_count,
				c.evaluated_count,
				c.avg_rating !== null ? c.avg_rating.toFixed(2) : '',
				cell(c.decisions.map((d) => `${d.team_name ?? d.team_id}:${d.outcome}`).join('; ')),
				cell(new Date(c.created_at).toLocaleDateString())
			].join(',')
		);

		const csv = [headers.join(','), ...body].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `candidates-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<h4 class="page-title">Candidates</h4>
				<p class="page-subtitle">
					Everyone who has applied to this organization, and where they stand.
					{#if refreshing}<span class="refreshing">Refreshing…</span>{/if}
				</p>
			</div>
			<BlindToggle />
		</div>

		<div class="tab-bar">
			<button class="tab-btn" class:active={tab === 'all'} on:click={() => setTab('all')}>
				All candidates
			</button>
			<button class="tab-btn" class:active={tab === 'rankings'} on:click={() => setTab('rankings')}>
				Team rankings
			</button>
		</div>

		{#if loadError}
			<div class="alert-soft alert-error">{loadError}</div>
		{/if}

		{#if tab === 'rankings'}
			{#if loading}
				<p class="muted">Loading candidates…</p>
			{:else if orgId !== null}
				<TeamRankings
					jobId={rankingJob}
					on:jobChange={(e) => setRankingJob(e.detail)}
					{orgId}
					{slug}
					{candidates}
					{teams}
					{jobs}
					on:open={(e) => openCandidate(e.detail)}
				/>
			{/if}
		{:else if !loading && candidates.length > 0}
			<div class="stage-strip">
				{#each STAGE_ORDER as stage (stage)}
					<div class="stage-stat">
						<span class="stage-dot" style="background-color: {STAGE_COLORS[stage]};"></span>
						<span class="stage-count">{stageCounts[stage]}</span>
						<span class="stage-label">{STAGE_LABELS[stage]}</span>
					</div>
				{/each}
			</div>

			{#if conflictCount > 0}
				<div class="alert-soft alert-warning conflict-banner">
					⚑ {conflictCount} candidate{conflictCount !== 1 ? 's have' : ' has'} a hire decision from more
					than one team.
				</div>
			{/if}

			<div class="filter-bar">
				<label class="filter-label" for="job-filter-select">Job</label>
				<select id="job-filter-select" bind:value={jobFilter} class="form-control job-select">
					<option value="all">All jobs</option>
					{#each jobs as job (job.id)}
						<option value={job.id}>{job.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if tab === 'all'}
			<CandidateList
				bind:this={list}
				candidates={visible}
				{teams}
				{loading}
				bind:selectMode
				bind:selectedIds
				view="table"
				persistKey="candidates:{slug}"
				showJob={true}
				emptyMessage="No candidates yet."
				on:open={(e) => openCandidate(e.detail)}
			>
				<svelte:fragment slot="actions">
					{#if !selectMode}
						<button class="btn btn-quaternary btn-sm" on:click={() => (selectMode = true)}>
							Select
						</button>
					{:else}
						<button class="btn btn-quaternary btn-sm" on:click={exitSelectMode}>Cancel</button>
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
				</svelte:fragment>
			</CandidateList>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={8} />
</div>

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	.conflict-banner {
		font-weight: 600;
	}

	.stage-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 15px;
	}
	.stage-stat {
		display: flex;
		align-items: center;
		gap: 6px;
		background-color: $surface;
		border-radius: $radius;
		padding: 10px 14px;
		box-shadow: $shadow;
		flex: 1 1 120px;
	}
	.stage-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.stage-count {
		font-size: 18px;
		font-weight: 800;
		color: $text;
	}
	.stage-label {
		font-size: 12px;
		color: $text-muted;
		font-weight: 600;
	}

	.refreshing {
		margin-left: 8px;
		font-size: 12px;
		color: $text-muted;
	}

	.job-select {
		max-width: 260px;
	}
</style>
