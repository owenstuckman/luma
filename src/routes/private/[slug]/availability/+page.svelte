<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		supabase,
		getActiveRoles,
		getMyInterviewerAvailability,
		saveInterviewerAvailability
	} from '$lib/utils/supabase';
	import { findAvailabilityWindows, clampRangesToWindows } from '$lib/utils/formSchema';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import AvailabilityGrid from '$lib/components/applicant/AvailabilityGrid.svelte';

	import type { AvailabilityWindows } from '$lib/utils/formSchema';
	import type { JobPosting } from '$lib/types';

	/**
	 * One open posting, paired with the interview window it asks applicants
	 * about. `windows` is null when the job has no availability question — that
	 * job has no interview times to agree on, and guessing a week for it is what
	 * this page used to do wrong.
	 */
	type JobWindow = {
		job: JobPosting;
		windows: AvailabilityWindows | null;
		initialRanges: { date: string; start: string; end: string }[];
	};

	let orgId: number | null = null;
	let loading = true;
	let loadError = '';
	let jobWindows: JobWindow[] = [];
	let activeJobId: number | null = null;
	let saving = false;
	let saveSuccess = '';
	let saveError = '';
	let gridRefs: Record<number, AvailabilityGrid> = {};

	$: slug = $page.params.slug;
	$: active = jobWindows.find((jw) => jw.job.id === activeJobId) ?? null;
	// Narrowed with a predicate rather than a bare filter so the template can
	// read `jw.windows` without a non-null assertion on every use.
	$: schedulable = jobWindows.filter(
		(jw): jw is JobWindow & { windows: AvailabilityWindows } => jw.windows !== null
	);

	/** "Wed Sep 9 · 5-9 PM" style summary of what a job is asking for. */
	function describeWindows(w: AvailabilityWindows): string {
		if (w.days.length === 0) return 'Dates set by the posting';
		const first = w.days[0].date;
		const last = w.days[w.days.length - 1].date;
		const fmt = (iso: string) => {
			const [y, m, d] = iso.split('-').map(Number);
			return new Date(y, m - 1, d).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
		};
		const span = first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
		return `${span} · ${w.days.length} day${w.days.length === 1 ? '' : 's'}`;
	}

	async function loadJob(jw: JobWindow) {
		if (!orgId) return;
		const rows = await getMyInterviewerAvailability(orgId, jw.job.id);
		jw.initialRanges = clampRangesToWindows(
			rows.map((r) => ({
				date: r.date,
				start: r.start_time.substring(0, 5), // HH:mm:ss -> HH:mm
				end: r.end_time.substring(0, 5)
			})),
			jw.windows
		);
	}

	onMount(async () => {
		const { data: orgData } = await supabase
			.from('organizations')
			.select('id')
			.eq('slug', slug)
			.single();

		if (!orgData) {
			loadError = "Couldn't load this organization.";
			loading = false;
			return;
		}
		orgId = orgData.id;

		try {
			const jobs = await getActiveRoles(orgId!);
			jobWindows = jobs.map((job) => ({
				job,
				windows: findAvailabilityWindows(job.questions),
				initialRanges: []
			}));
			await Promise.all(jobWindows.map(loadJob));
			jobWindows = jobWindows;
			activeJobId = schedulable[0]?.job.id ?? null;
		} catch (e) {
			console.error('Error loading open roles:', e);
			loadError = "Couldn't load the open roles for this organization.";
		}

		loading = false;
	});

	async function handleSave() {
		if (!orgId || !active) return;
		const grid = gridRefs[active.job.id];
		if (!grid) return;

		saving = true;
		saveSuccess = '';
		saveError = '';

		try {
			await saveInterviewerAvailability(orgId, grid.toSupabaseRows(), active.job.id);
			saveSuccess = `Saved your availability for ${active.job.name}.`;
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to save availability.';
		}
		saving = false;
	}
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<h4 class="page-title">My Availability</h4>
				<p class="page-subtitle">
					Pick the interview slots you can cover. These are the exact times applicants were asked
					about, so anything you select here can actually be scheduled.
				</p>
			</div>
		</div>

		{#if loading}
			<p class="muted placeholder">Loading open roles...</p>
		{:else if loadError}
			<p class="alert-soft alert-error">{loadError}</p>
		{:else if jobWindows.length === 0}
			<div class="empty-state">
				<h5>No open roles</h5>
				<p class="muted">
					There is nothing to interview for yet. Once a posting is opened in Settings → Jobs, its
					interview times will show up here.
				</p>
			</div>
		{:else if schedulable.length === 0}
			<div class="empty-state">
				<h5>No interview times set</h5>
				<p class="muted">
					{jobWindows.length === 1 ? 'The open posting' : 'None of the open postings'} asks applicants
					for their interview availability, so there are no times to offer. An admin can add an Availability
					Grid question in Settings → Jobs, and the dates chosen there will appear here.
				</p>
			</div>
		{:else}
			{#if schedulable.length > 1}
				<div class="job-tabs">
					{#each schedulable as jw (jw.job.id)}
						<button
							class="job-tab"
							class:selected={jw.job.id === activeJobId}
							on:click={() => {
								activeJobId = jw.job.id;
								saveSuccess = '';
								saveError = '';
							}}
						>
							<span class="job-tab-name">{jw.job.name}</span>
							<span class="job-tab-sub">{describeWindows(jw.windows)}</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if active && active.windows}
				<p class="window-note">
					<i class="fi fi-br-calendar"></i>
					<span>
						<strong>{active.job.name}</strong> — {describeWindows(active.windows)}. Blocked cells
						are outside the hours this posting offers.
					</span>
				</p>

				{#key active.job.id}
					<AvailabilityGrid
						bind:this={gridRefs[active.job.id]}
						days={active.windows.days}
						startDate={active.windows.startDate}
						endDate={active.windows.endDate}
						dayStart={active.windows.dayStart}
						dayEnd={active.windows.dayEnd}
						stepMinutes={active.windows.stepMinutes}
						showDayNames={true}
						initialRanges={active.initialRanges}
					/>
				{/key}

				<div class="save-bar">
					<button class="btn btn-primary" on:click={handleSave} disabled={saving}>
						{saving ? 'Saving...' : 'Save Availability'}
					</button>
					{#if saveSuccess}
						<span class="save-msg success-msg">{saveSuccess}</span>
					{/if}
					{#if saveError}
						<span class="save-msg error-msg">{saveError}</span>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={7} />
</div>

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	.placeholder {
		padding: 20px;
	}
	.job-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.job-tab {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 8px 14px;
		border: 1px solid $border;
		border-left: 3px solid transparent;
		border-radius: $radius-sm;
		background: $surface;
		cursor: pointer;
		text-align: left;
	}
	.job-tab.selected {
		border-left-color: $yellow-primary;
		background: $surface-sunken;
	}
	.job-tab-name {
		font-size: 13px;
		font-weight: 700;
		color: $text;
	}
	.job-tab.selected .job-tab-name {
		color: $yellow-primary;
	}
	.job-tab-sub {
		font-size: 11px;
		color: $text-muted;
	}
	.window-note {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: $text-muted;
		background: $surface-sunken;
		border: 1px solid $border;
		border-radius: $radius-sm;
		padding: 8px 12px;
		margin-bottom: 14px;
	}
	.save-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}
	.save-msg {
		font-size: 13px;
		font-weight: 600;
	}
	.success-msg {
		color: $success-fg;
	}
	.error-msg {
		color: $danger;
	}
</style>
