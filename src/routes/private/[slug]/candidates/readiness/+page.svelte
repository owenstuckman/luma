<script lang="ts">
	// Readiness review: rate every candidate on a team's list, one at a time.
	//
	// Two passes over the same list. "Without scores" shows each candidate's
	// interview notes with every number hidden, so the rating reflects what the
	// interviewers wrote rather than what they scored; "With scores" shows the
	// raw and interviewer-adjusted scores too. The list is shuffled per recruiter
	// so nobody reads it in score order. Blind names applies here like everywhere.
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getOrgBySlug, getTeams } from '$lib/utils/supabase';
	import {
		getCandidates,
		peekCandidates,
		getPersonInterviews,
		groupInterviewSessions,
		type CandidateRow,
		type InterviewLite
	} from '$lib/utils/candidates';
	import {
		getJobScoringContext,
		getReadinessScores,
		saveReadinessScore,
		READINESS_PASS_LABELS,
		type JobScoringContext,
		type ReadinessPass
	} from '$lib/utils/round2';
	import { supabase } from '$lib/utils/supabase';
	import { blindMode } from '$lib/stores/blindMode';
	import { blindName, buildNameScrubber } from '$lib/utils/blind';
	import type { Team } from '$lib/types';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import InterviewSessions from '$lib/components/recruiter/InterviewSessions.svelte';
	import BlindToggle from '$lib/components/recruiter/BlindToggle.svelte';

	const slug = $page.params.slug ?? '';
	const params = $page.url.searchParams;
	const jobId = Number(params.get('job')) || null;
	const teamId = Number(params.get('team')) || null;
	const includeSecond = params.get('second') === '1';
	let pass: ReadinessPass = params.get('pass') === 'informed' ? 'informed' : 'blind';

	let orgId: number | null = null;
	let myUserId: string | null = null;
	let teams: Team[] = [];
	let list: CandidateRow[] = [];
	let scoring: JobScoringContext | null = null;
	/** applicant id → pass → my score */
	let mine = new Map<number, Partial<Record<ReadinessPass, number>>>();
	let index = 0;
	let loading = true;
	let saving = false;
	let error = '';

	const interviewCache = new Map<number, Promise<InterviewLite[]>>();
	let interviews: InterviewLite[] = [];
	let interviewsLoading = false;

	$: current = list[index] ?? null;
	$: teamName = teams.find((t) => t.id === teamId)?.name ?? 'Team';
	$: ratedCount = list.filter((c) => mine.get(c.id)?.[pass] !== undefined).length;
	$: myScore = current ? mine.get(current.id)?.[pass] : undefined;
	$: sessions = groupInterviewSessions(interviews);
	$: scrub =
		$blindMode && current
			? buildNameScrubber(
					scoring?.people ?? [{ name: current.name, number: current.candidate_number }],
					scoring?.sessionMates.get(current.person_key) ?? []
				)
			: (text: string) => text;

	/** Deterministic shuffle keyed on the recruiter, so the order is stable for them. */
	function shuffled<T extends { id: number }>(items: T[], seedText: string): T[] {
		let seed = 0;
		for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
		const rand = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 4294967296;
		};
		const out = [...items].sort((a, b) => a.id - b.id);
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	function loadInterviews(c: CandidateRow | undefined) {
		if (!c || orgId === null) return Promise.resolve([] as InterviewLite[]);
		let pending = interviewCache.get(c.id);
		if (!pending) {
			pending = getPersonInterviews(orgId, c);
			interviewCache.set(c.id, pending);
		}
		return pending;
	}

	async function show(i: number) {
		index = Math.max(0, Math.min(list.length - 1, i));
		const c = list[index];
		interviewsLoading = true;
		const rows = await loadInterviews(c);
		if (list[index]?.id === c?.id) {
			interviews = rows;
			interviewsLoading = false;
		}
		// Warm the next one so moving on is instant.
		void loadInterviews(list[index + 1]);
		window.scrollTo({ top: 0 });
	}

	onMount(async () => {
		try {
			const org = await getOrgBySlug(slug);
			if (!org || !jobId || !teamId) {
				error = !org ? 'Organization not found.' : 'Pick a job and team from Team rankings first.';
				return;
			}
			orgId = org.id;
			const [sessionRes, roster, teamList, scores] = await Promise.all([
				supabase.auth.getSession(),
				peekCandidates(org.id) ?? getCandidates(org.id),
				getTeams(org.id),
				getReadinessScores(org.id)
			]);
			myUserId = sessionRes.data.session?.user.id ?? null;
			teams = teamList;

			const onTeam = roster
				.filter((c) => c.job === jobId && c.team.id === teamId && c.status !== 'denied')
				.filter(
					(c) => c.team_rank === null || c.team_rank === 1 || (includeSecond && c.team_rank === 2)
				);
			list = shuffled(onTeam, `${myUserId}|${teamId}`);

			const next = new Map<number, Partial<Record<ReadinessPass, number>>>();
			for (const s of scores) {
				if (s.rater_id !== myUserId) continue;
				next.set(s.applicant_id, { ...next.get(s.applicant_id), [s.pass]: s.score });
			}
			mine = next;

			getJobScoringContext(org.id, jobId)
				.then((context) => (scoring = context))
				.catch((e) => console.warn('Adjusted scores unavailable:', e));

			const firstUnrated = list.findIndex((c) => next.get(c.id)?.[pass] === undefined);
			await show(firstUnrated === -1 ? 0 : firstUnrated);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load.';
		} finally {
			loading = false;
		}
	});

	function switchPass(nextPass: ReadinessPass) {
		pass = nextPass;
		const url = new URL(window.location.href);
		url.searchParams.set('pass', nextPass);
		history.replaceState(history.state, '', url);
	}

	async function rate(score: number) {
		if (!current || orgId === null || saving) return;
		const c = current;
		saving = true;
		error = '';
		try {
			await saveReadinessScore(orgId, c.id, pass, score);
			mine = new Map(mine).set(c.id, { ...mine.get(c.id), [pass]: score });
			// Move on to the next candidate still unrated in this pass.
			const order = [...list.slice(index + 1), ...list.slice(0, index)];
			const nextUnrated = order.find((x) => mine.get(x.id)?.[pass] === undefined);
			if (nextUnrated) await show(list.indexOf(nextUnrated));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save your rating.';
		} finally {
			saving = false;
		}
	}

	const label = (c: CandidateRow, blind: boolean) =>
		blind ? blindName(c.candidate_number) : c.name;
	const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<a class="back-link" href="/private/{slug}/candidates">
					<i class="fi fi-br-arrow-left"></i> Team rankings
				</a>
				<h4 class="page-title">Readiness review · {teamName}</h4>
				<p class="page-subtitle">
					How ready is each candidate for a second interview? Rate 1–10.
					{#if !loading}{ratedCount} of {list.length} rated {READINESS_PASS_LABELS[
							pass
						].toLowerCase()}.{/if}
				</p>
			</div>
			<BlindToggle />
		</div>

		<div class="tab-bar">
			{#each ['blind', 'informed'] as const as p (p)}
				<button class="tab-btn" class:active={pass === p} on:click={() => switchPass(p)}>
					{READINESS_PASS_LABELS[p]}
				</button>
			{/each}
		</div>

		{#if error}
			<div class="alert-soft alert-error">{error}</div>
		{/if}

		{#if loading}
			<p class="muted">Loading candidates…</p>
		{:else if list.length === 0}
			<div class="empty-state">
				<i class="fi fi-br-users"></i>
				<p class="empty-hint">No candidates on this list.</p>
			</div>
		{:else if current}
			<div class="chips">
				{#each list as c, i (c.id)}
					<button
						class="chip"
						class:chip-current={i === index}
						class:chip-done={mine.get(c.id)?.[pass] !== undefined}
						title={label(c, $blindMode)}
						on:click={() => show(i)}
					>
						{i + 1}
					</button>
				{/each}
			</div>

			<div class="panel candidate-panel">
				<div class="candidate-head">
					<div>
						<span class="candidate-name">{label(current, $blindMode)}</span>
						<span class="muted">
							· {current.team_rank === 2 ? 'Second' : 'First'} choice · {index + 1} of {list.length}
						</span>
					</div>
					{#if pass === 'informed'}
						<div class="scores">
							<span class="score-chip"
								><strong>{fmt(current.adjusted_rating)}</strong> adjusted</span
							>
							<span class="score-chip"><strong>{fmt(current.avg_rating)}</strong> raw</span>
						</div>
					{/if}
				</div>

				<div class="rate-bar">
					<span class="rate-label">Readiness</span>
					<div class="scale">
						{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n (n)}
							<button
								class="scale-btn"
								class:active={myScore === n}
								disabled={saving}
								on:click={() => rate(n)}>{n}</button
							>
						{/each}
					</div>
					<div class="nav">
						<button
							class="btn btn-quaternary btn-sm"
							disabled={index === 0}
							on:click={() => show(index - 1)}>‹ Previous</button
						>
						<button
							class="btn btn-quaternary btn-sm"
							disabled={index >= list.length - 1}
							on:click={() => show(index + 1)}>Next ›</button
						>
					</div>
				</div>

				{#if interviewsLoading}
					<p class="muted">Loading interviews…</p>
				{:else if sessions.length === 0}
					<p class="muted">No interviews recorded.</p>
				{:else}
					<InterviewSessions
						{sessions}
						showScores={pass === 'informed'}
						model={pass === 'informed' ? (scoring?.model ?? null) : null}
						{scrub}
					/>
				{/if}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={8} />
</div>

<style lang="scss">
	@use '../../../../../styles/col.scss' as *;

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		text-decoration: none;
		margin-bottom: 4px;
		&:hover {
			color: $text;
		}
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 12px;
	}
	.chip {
		min-width: 28px;
		height: 24px;
		padding: 0 6px;
		border: 1px solid $border;
		border-radius: $radius-sm;
		background-color: $surface;
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		cursor: pointer;
	}
	.chip-done {
		background-color: $success-bg;
		border-color: $success-fill;
		color: $success-fg;
	}
	.chip-current {
		border-color: $yellow-secondary;
		box-shadow: $focus-ring;
		color: $text;
	}

	.candidate-panel {
		padding: 16px 18px;
	}
	.candidate-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.candidate-name {
		font-size: 18px;
		font-weight: 800;
		color: $text;
	}
	.scores {
		display: flex;
		gap: 6px;
	}
	.score-chip {
		font-size: 12px;
		color: $text-body;
		padding: 4px 10px;
		border: 1px solid $border;
		border-radius: $radius-pill;
		strong {
			color: $text;
			font-size: 14px;
		}
	}

	.rate-bar {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin: 12px -18px 0;
		padding: 10px 18px;
		background-color: $surface;
		border-top: 1px solid $border-faint;
		border-bottom: 1px solid $border-faint;
	}
	.rate-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: $text-muted;
	}
	.scale {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.scale-btn {
		width: 34px;
		height: 34px;
		border: 1px solid $border-strong;
		border-radius: $radius-sm;
		background-color: $surface;
		font-size: 13px;
		font-weight: 700;
		color: $text;
		cursor: pointer;
		&:hover:not(:disabled) {
			border-color: $yellow-secondary;
		}
		&.active {
			background-color: $yellow-primary;
			border-color: $yellow-secondary;
		}
	}
	.nav {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
</style>
