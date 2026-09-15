<script lang="ts">
	// Per-team ranking for round 2 selection.
	//
	// Lists the applications that put a team FIRST, ranked by interviewer-adjusted
	// score, with a cut line (15 by default) as the starting point for the team's
	// discussion — not a hard limit. Each row can be added to the team's
	// second-interview list, and shows the readiness ratings recruiters have given.
	import { onMount, createEventDispatcher } from 'svelte';
	import type { CandidateRow } from '$lib/utils/candidates';
	import type { JobPosting, Team } from '$lib/types';
	import { supabase } from '$lib/utils/supabase';
	import {
		getSecondRoundPicks,
		setSecondRoundPick,
		getReadinessScores,
		summarizeReadiness,
		type SecondRoundPick,
		type ReadinessScore,
		type ReadinessSummary
	} from '$lib/utils/round2';
	import { readFilters, writeFilters } from '$lib/utils/persistedFilters';
	import { blindMode } from '$lib/stores/blindMode';
	import { blindName } from '$lib/utils/blind';

	export let orgId: number;
	export let slug: string;
	export let candidates: CandidateRow[] = [];
	export let teams: Team[] = [];
	export let jobs: JobPosting[] = [];
	/**
	 * The job being ranked — shared with the All candidates tab's job filter, so
	 * both tabs look at the same posting. Null picks the most recent one.
	 */
	export let jobId: number | null = null;
	// The posting on screen: the shared filter when it names one, else the latest.
	let selectedJob: number | null = null;
	$: selectedJob = jobId ?? latestJob(candidates);
	function chooseJob(job: number) {
		selectedJob = job;
		dispatch('jobChange', job);
	}

	const dispatch = createEventDispatcher<{ open: number; jobChange: number }>();

	type SortKey = 'adjusted' | 'raw' | 'blind' | 'informed';

	interface RankingFilters {
		team: number | null;
		second: boolean;
		denied: boolean;
		cut: number;
		sort: SortKey;
	}

	// The most recent posting with applications is the one being recruited for.
	const latestJob = (list: CandidateRow[]) =>
		[...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.job ?? null;

	let teamId: number | null = null;
	let includeSecond = false;
	let showDenied = false;
	let cut = 15;
	let sortBy: SortKey = 'adjusted';
	let restored = false;

	let picks = new Map<number, SecondRoundPick>();
	let readinessRows: ReadinessScore[] = [];
	let myUserId: string | null = null;
	let round2Loaded = false;
	let saving = new Set<number>();
	let error = '';
	let copied = false;
	let showMethod = false;

	const storageKey = `rankings:${slug}`;

	onMount(async () => {
		const saved = readFilters<RankingFilters>(storageKey);
		teamId = typeof saved?.team === 'number' ? saved.team : (teams[0]?.id ?? null);
		includeSecond = saved?.second === true;
		showDenied = saved?.denied === true;
		if (typeof saved?.cut === 'number' && saved.cut > 0) cut = saved.cut;
		if (saved?.sort && ['adjusted', 'raw', 'blind', 'informed'].includes(saved.sort)) {
			sortBy = saved.sort;
		}
		restored = true;

		const [{ data: session }, pickMap, scores] = await Promise.all([
			supabase.auth.getSession(),
			getSecondRoundPicks(orgId),
			getReadinessScores(orgId)
		]);
		myUserId = session.session?.user.id ?? null;
		picks = pickMap;
		readinessRows = scores;
		round2Loaded = true;
	});

	$: if (restored) {
		writeFilters(storageKey, {
			team: teamId,
			second: includeSecond,
			denied: showDenied,
			cut,
			sort: sortBy
		} satisfies RankingFilters);
	}
	// Teams load after the first render on a cold visit.
	$: if (restored && teamId === null && teams.length > 0) teamId = teams[0].id;

	$: readiness = summarizeReadiness(readinessRows, myUserId);

	// A person's other applications for the same posting, for the "also" column.
	$: byPerson = candidates.reduce((map, c) => {
		map.set(c.person_key, [...(map.get(c.person_key) ?? []), c]);
		return map;
	}, new Map<string, CandidateRow[]>());

	const metric = (c: CandidateRow, key: SortKey, summaries: Map<number, ReadinessSummary>) => {
		if (key === 'adjusted') return c.adjusted_rating;
		if (key === 'raw') return c.avg_rating;
		return summaries.get(c.id)?.[key].average ?? null;
	};

	// Unranked rows (a job that didn't ask for a ranking, or a single-team
	// applicant from before ranking existed) count as a first choice.
	$: rows = candidates
		.filter((c) => c.job === selectedJob && c.team.id === teamId)
		.filter(
			(c) => c.team_rank === null || c.team_rank === 1 || (includeSecond && c.team_rank === 2)
		)
		.filter((c) => showDenied || c.status !== 'denied')
		.sort((a, b) => {
			const diff = (metric(b, sortBy, readiness) ?? -1) - (metric(a, sortBy, readiness) ?? -1);
			return diff !== 0 ? diff : (b.avg_rating ?? -1) - (a.avg_rating ?? -1);
		});

	$: pickedRows = rows.filter((c) => picks.has(c.id));
	$: teamName = teams.find((t) => t.id === teamId)?.name ?? 'this team';
	$: readinessQuery = `job=${selectedJob}&team=${teamId}&second=${includeSecond ? 1 : 0}`;

	const label = (c: CandidateRow, blind: boolean) =>
		blind ? blindName(c.candidate_number) : c.name;
	const fmt = (n: number | null | undefined) =>
		n === null || n === undefined ? '—' : n.toFixed(1);
	const choiceLabel = (rank: number | null) =>
		rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === null ? '—' : `${rank}th`;

	function otherChoices(c: CandidateRow): string {
		return (byPerson.get(c.person_key) ?? [])
			.filter((o) => o.id !== c.id)
			.map((o) => `${o.team.name ?? 'Other'} (${choiceLabel(o.team_rank)})`)
			.join(', ');
	}

	async function togglePick(c: CandidateRow, picked: boolean) {
		error = '';
		saving = new Set(saving).add(c.id);
		try {
			await setSecondRoundPick(orgId, c.id, picked);
			const next = new Map(picks);
			if (picked) {
				const { data } = await supabase.auth.getSession();
				next.set(c.id, {
					applicant_id: c.id,
					picked_by_email: data.session?.user.email ?? 'you',
					created_at: new Date().toISOString()
				});
			} else {
				next.delete(c.id);
			}
			picks = next;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save the pick.';
		} finally {
			const next = new Set(saving);
			next.delete(c.id);
			saving = next;
		}
	}

	async function copyPicked() {
		// Scheduling needs real contact details, so this ignores blind mode.
		const lines = pickedRows.map((c) => `${c.name}\t${c.email}`);
		await navigator.clipboard.writeText(`${teamName} — second interviews\n${lines.join('\n')}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="filter-bar rankings-controls">
	<select
		value={selectedJob}
		on:change={(e) => chooseJob(Number(e.currentTarget.value))}
		class="form-control control-job"
		aria-label="Job"
	>
		{#each jobs as job (job.id)}
			<option value={job.id}>{job.name}</option>
		{/each}
	</select>
	<select bind:value={teamId} class="form-control control-team" aria-label="Team">
		{#each teams as team (team.id)}
			<option value={team.id}>{team.name}</option>
		{/each}
	</select>
	<select bind:value={sortBy} class="form-control control-sort" aria-label="Rank by">
		<option value="adjusted">Rank: Adjusted score</option>
		<option value="raw">Rank: Raw score</option>
		<option value="blind">Rank: Readiness (without scores)</option>
		<option value="informed">Rank: Readiness (with scores)</option>
	</select>
	<label class="check">
		<input type="checkbox" bind:checked={includeSecond} /> Include 2nd choice
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={showDenied} /> Show denied
	</label>
	<label class="check">
		Cut line
		<input type="number" min="1" max="200" bind:value={cut} class="form-control control-cut" />
	</label>
</div>

<div class="panel rankings-summary">
	<div>
		<strong>{round2Loaded ? pickedRows.length : '…'}</strong> picked for a second interview ·
		{rows.length} candidate{rows.length === 1 ? '' : 's'} who put {teamName}
		{includeSecond ? 'first or second' : 'first'}
	</div>
	<div class="summary-actions">
		<a
			class="btn btn-quaternary btn-sm"
			href="/private/{slug}/candidates/readiness?{readinessQuery}&pass=blind"
		>
			<i class="fi fi-br-eye-crossed"></i> Rate readiness (without scores)
		</a>
		<a
			class="btn btn-quaternary btn-sm"
			href="/private/{slug}/candidates/readiness?{readinessQuery}&pass=informed"
		>
			<i class="fi fi-br-star"></i> Rate readiness (with scores)
		</a>
		<button
			class="btn btn-quaternary btn-sm"
			on:click={copyPicked}
			disabled={pickedRows.length === 0}
			title="Copies names and emails for scheduling"
		>
			<i class="fi fi-br-copy"></i>
			{copied ? 'Copied' : 'Copy picked list'}
		</button>
		<button class="btn btn-quaternary btn-sm" on:click={() => (showMethod = !showMethod)}>
			How scores work
		</button>
	</div>
</div>

{#if showMethod}
	<div class="alert-soft method">
		<p>
			<strong>Raw</strong> is the plain average of every interview evaluation the candidate got, each
			scored 1–10 as the average of its rating prompts. Group and individual interviews count equally.
		</p>
		<p>
			<strong>Adjusted</strong> removes each interviewer's usual lean. The model compares what an interviewer
			gave the same candidates as other interviewers did (group sessions make this possible), separately
			for group and individual forms, and estimates how far above or below everyone else they score.
			That lean is shrunk toward zero for interviewers with few evaluations, so a handful of scores can't
			make someone look harsh or generous. The adjusted score is the average after subtracting each interviewer's
			lean.
		</p>
		<p>
			<strong>Readiness</strong> is a separate 1–10 "ready for a second interview?" rating from any recruiter,
			given once without seeing interview scores and once with them.
		</p>
	</div>
{/if}

{#if error}
	<div class="alert-soft alert-error">{error}</div>
{/if}

{#if rows.length === 0}
	<div class="empty-state">
		<i class="fi fi-br-users"></i>
		<p class="empty-hint">No candidates put {teamName} first yet.</p>
	</div>
{:else}
	<div class="panel panel-flush table-scroll">
		<table class="data-table rankings-table">
			<thead>
				<tr>
					<th class="num">#</th>
					<th>Candidate</th>
					<th>Choice</th>
					<th title="Average with each interviewer's usual lean removed">Adjusted</th>
					<th>Raw</th>
					<th>Evals</th>
					<th title="Recruiters' readiness ratings, given without seeing scores">
						Readiness · no scores
					</th>
					<th title="Recruiters' readiness ratings, given after seeing scores">
						Readiness · with scores
					</th>
					<th>Second interview</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as c, i (c.id)}
					{@const r = readiness.get(c.id)}
					{@const pick = picks.get(c.id)}
					{#if i === cut}
						<tr class="cut-row">
							<td colspan="9">Top {cut} above this line</td>
						</tr>
					{/if}
					<tr class:picked={!!pick} class:below-cut={i >= cut}>
						<td class="num">{i + 1}</td>
						<td>
							<button class="link-btn" on:click={() => dispatch('open', c.id)}>
								{label(c, $blindMode)}
							</button>
							{#if otherChoices(c)}
								<span class="cell-sub">Also: {otherChoices(c)}</span>
							{/if}
						</td>
						<td class="cell-sub">
							{choiceLabel(c.team_rank)}
							{#if c.status === 'denied'}<span class="pill pill-danger">denied</span>{/if}
						</td>
						<td class="score">{fmt(c.adjusted_rating)}</td>
						<td class="cell-sub">{fmt(c.avg_rating)}</td>
						<td class="cell-sub">{c.evaluated_count}/{c.interview_count}</td>
						<td class="cell-sub">
							{fmt(r?.blind.average)}
							{#if r?.blind.count}<span class="count">({r.blind.count})</span>{/if}
						</td>
						<td class="cell-sub">
							{fmt(r?.informed.average)}
							{#if r?.informed.count}<span class="count">({r.informed.count})</span>{/if}
						</td>
						<td>
							<label class="pick" title={pick ? `Picked by ${pick.picked_by_email}` : ''}>
								<input
									type="checkbox"
									checked={!!pick}
									disabled={saving.has(c.id)}
									on:change={(e) => togglePick(c, e.currentTarget.checked)}
								/>
								{#if pick}
									<span class="cell-sub">{pick.picked_by_email.split('@')[0]}</span>
								{/if}
							</label>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.rankings-controls {
		flex-wrap: wrap;
	}
	.control-job {
		max-width: 220px;
	}
	.control-team {
		max-width: 160px;
	}
	.control-sort {
		max-width: 250px;
	}
	.control-cut {
		width: 70px;
		display: inline-block;
		margin-left: 4px;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 600;
		color: $text-body;
		white-space: nowrap;
	}

	.rankings-summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
		margin-bottom: 12px;
	}
	.summary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.method p {
		margin: 0 0 8px;
		&:last-child {
			margin-bottom: 0;
		}
	}

	.rankings-table {
		.num {
			width: 40px;
			color: $text-muted;
		}
		.score {
			font-weight: 800;
		}
		.count {
			color: $text-subtle;
			margin-left: 2px;
		}
		.cell-sub {
			display: block;
			font-size: 12px;
			color: $text-body;
		}
		td.cell-sub {
			display: table-cell;
		}
		tr.picked td {
			background-color: $success-bg;
		}
		tr.below-cut td {
			opacity: 0.85;
		}
		tr.cut-row td {
			padding: 4px 14px;
			font-size: 11px;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: $warning-fg;
			background-color: $warning-bg;
			border-top: 2px solid $warning-strong;
		}
	}

	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font-weight: 700;
		color: $text;
		text-align: left;
		cursor: pointer;
		&:hover {
			text-decoration: underline;
		}
	}

	.pick {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		input {
			width: 16px;
			height: 16px;
		}
	}
</style>
