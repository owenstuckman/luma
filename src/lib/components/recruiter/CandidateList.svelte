<script lang="ts">
	// Shared candidate list. Mounted unfiltered on /candidates (org-wide roster)
	// and job-scoped on /review. Owns search / filter / sort / pagination /
	// selection; the host page supplies bulk actions through the `bulk` slot and
	// extra toolbar buttons through the `actions` slot.
	import { createEventDispatcher } from 'svelte';
	import {
		STAGE_COLORS,
		STAGE_LABELS,
		STAGE_ORDER,
		OUTCOME_COLORS,
		type CandidateRow,
		type CandidateStage
	} from '$lib/utils/candidates';

	export let candidates: CandidateRow[] = [];
	export let loading = false;
	export let selectMode = false;
	export let selectedIds: Set<number> = new Set();
	export let showJob = false;
	export let showTeams = true;
	export let view: 'cards' | 'table' = 'cards';
	export let pageSize = 50;
	export let emptyMessage = 'No candidates found.';

	const dispatch = createEventDispatcher<{ open: number; selectionChange: Set<number> }>();

	let searchQuery = '';
	let statusFilter = 'all';
	let stageFilter: 'all' | CandidateStage = 'all';
	let sortBy: 'date' | 'name' | 'status' | 'stage' | 'rating' = 'date';
	let currentPage = 0;

	$: filtered = candidates
		.filter((a) => statusFilter === 'all' || a.status === statusFilter)
		.filter((a) => stageFilter === 'all' || a.stage === stageFilter)
		.filter((a) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
		})
		.sort((a, b) => {
			if (sortBy === 'name') return a.name.localeCompare(b.name);
			if (sortBy === 'status') return a.status.localeCompare(b.status);
			if (sortBy === 'stage') return STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
			if (sortBy === 'rating') return (b.avg_rating ?? -1) - (a.avg_rating ?? -1);
			return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
		});

	// Reset to the first page whenever the result set changes underneath us.
	$: {
		searchQuery;
		statusFilter;
		stageFilter;
		sortBy;
		currentPage = 0;
	}

	$: totalPages = Math.ceil(filtered.length / pageSize);
	$: paged = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
	$: allSelected = paged.length > 0 && paged.every((a) => selectedIds.has(a.id));

	/** Exposed so host pages can act on exactly what the user is looking at. */
	export function getFiltered(): CandidateRow[] {
		return filtered;
	}

	function commitSelection() {
		selectedIds = new Set(selectedIds);
		dispatch('selectionChange', selectedIds);
	}

	function toggleSelect(id: number) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
		commitSelection();
	}

	function toggleSelectAll() {
		selectedIds = allSelected ? new Set() : new Set(filtered.map((a) => a.id));
		dispatch('selectionChange', selectedIds);
	}

	function open(id: number) {
		if (selectMode) {
			toggleSelect(id);
			return;
		}
		dispatch('open', id);
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'pending':
				return '#878fa1';
			case 'interview':
				return '#3b82f6';
			case 'accepted':
				return '#22c55e';
			case 'denied':
				return '#ef4444';
			default:
				return '#878fa1';
		}
	}
</script>

<div class="filter-bar">
	<input
		type="text"
		placeholder="Search name or email..."
		bind:value={searchQuery}
		class="form-control"
		style="max-width: 240px;"
	/>
	<select bind:value={stageFilter} class="form-control" style="max-width: 150px;">
		<option value="all">All Stages</option>
		{#each STAGE_ORDER as stage (stage)}
			<option value={stage}>{STAGE_LABELS[stage]}</option>
		{/each}
	</select>
	<select bind:value={statusFilter} class="form-control" style="max-width: 150px;">
		<option value="all">All Statuses</option>
		<option value="pending">Pending</option>
		<option value="interview">Interview</option>
		<option value="accepted">Accepted</option>
		<option value="denied">Denied</option>
	</select>
	<select bind:value={sortBy} class="form-control" style="max-width: 140px;">
		<option value="date">Sort: Date</option>
		<option value="name">Sort: Name</option>
		<option value="stage">Sort: Stage</option>
		<option value="status">Sort: Status</option>
		<option value="rating">Sort: Rating</option>
	</select>
	<span class="muted result-count">{filtered.length} candidates</span>
	<div class="filter-actions">
		<button
			class="btn btn-quaternary btn-sm"
			on:click={() => (view = view === 'cards' ? 'table' : 'cards')}
			title={view === 'cards' ? 'Switch to table view' : 'Switch to card view'}
		>
			<i class="fi {view === 'cards' ? 'fi-br-list' : 'fi-br-apps'}"></i>
			{view === 'cards' ? 'Table' : 'Cards'}
		</button>
		<slot name="actions" />
	</div>
</div>

{#if selectMode}
	<div class="panel bulk-bar">
		<label class="bulk-select-all">
			<input type="checkbox" checked={allSelected} on:change={toggleSelectAll} />
			Select all ({filtered.length})
		</label>
		<span class="muted bulk-count">{selectedIds.size} selected</span>
		<div class="bulk-actions">
			<slot name="bulk" />
		</div>
	</div>
{/if}

<slot name="bulk-panels" />

{#if loading}
	<div class="card-grid">
		{#each [1, 2, 3, 4, 5, 6] as n (n)}
			<div class="panel skeleton-card">
				<div class="skeleton" style="height: 16px; width: 55%; margin-bottom: 10px;"></div>
				<div class="skeleton" style="height: 12px; width: 75%;"></div>
			</div>
		{/each}
	</div>
{:else if filtered.length === 0}
	<div class="empty-state">
		<i class="fi fi-br-users"></i>
		<p class="empty-hint">{emptyMessage}</p>
	</div>
{:else if view === 'table'}
	<div class="panel panel-flush table-scroll">
		<table class="data-table candidate-table">
			<thead>
				<tr>
					{#if selectMode}<th class="col-check"></th>{/if}
					<th>Name</th>
					{#if showJob}<th>Job</th>{/if}
					{#if showTeams}<th>Teams</th>{/if}
					<th>Stage</th>
					<th>Status</th>
					<th>Interviews</th>
					<th>Rating</th>
					<th>Decision</th>
					<th>Applied</th>
				</tr>
			</thead>
			<tbody>
				{#each paged as c (c.id)}
					<tr class:row-selected={selectedIds.has(c.id)} on:click={() => open(c.id)}>
						{#if selectMode}
							<td class="col-check">
								<input
									type="checkbox"
									checked={selectedIds.has(c.id)}
									on:click|stopPropagation={() => toggleSelect(c.id)}
								/>
							</td>
						{/if}
						<td>
							<span class="cell-name">{c.name}</span>
							{#if c.hire_conflict}
								<span class="conflict-flag" title="Hired by more than one team">⚑</span>
							{/if}
							<span class="cell-sub">{c.email}</span>
						</td>
						{#if showJob}<td class="cell-sub">{c.job_name ?? '—'}</td>{/if}
						{#if showTeams}
							<td class="cell-sub">{c.team_names.length > 0 ? c.team_names.join(', ') : '—'}</td>
						{/if}
						<td>
							<span class="stage-pill" style="background-color: {STAGE_COLORS[c.stage]};">
								{STAGE_LABELS[c.stage]}
							</span>
						</td>
						<td>
							<span class="stage-pill" style="background-color: {getStatusColor(c.status)};">
								{c.status}
							</span>
						</td>
						<td class="cell-sub">
							{c.interview_count > 0 ? `${c.evaluated_count}/${c.interview_count}` : '—'}
						</td>
						<td class="cell-sub">{c.avg_rating !== null ? c.avg_rating.toFixed(1) : '—'}</td>
						<td>
							{#if c.decisions.length === 0}
								<span class="cell-sub">—</span>
							{:else}
								{#each c.decisions as d (d.id)}
									<span class="stage-pill" style="background-color: {OUTCOME_COLORS[d.outcome]};">
										{d.outcome}{d.team_name ? ` · ${d.team_name}` : ''}
									</span>
								{/each}
							{/if}
						</td>
						<td class="cell-sub">{new Date(c.created_at).toLocaleDateString()}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="card-grid">
		{#each paged as c (c.id)}
			<div
				class="panel candidate-card"
				class:card-selected={selectedIds.has(c.id)}
				on:click={() => open(c.id)}
				on:keydown={() => {}}
				role="button"
				tabindex="0"
			>
				{#if selectMode}
					<div class="card-checkbox">
						<input
							type="checkbox"
							checked={selectedIds.has(c.id)}
							on:click|stopPropagation={() => toggleSelect(c.id)}
						/>
					</div>
				{/if}
				<div class="card-top">
					<span class="cell-name">
						{c.name}
						{#if c.hire_conflict}
							<span class="conflict-flag" title="Hired by more than one team">⚑</span>
						{/if}
					</span>
					<span class="stage-pill" style="background-color: {getStatusColor(c.status)};">
						{c.status}
					</span>
				</div>
				<p class="cell-sub">{c.email}</p>
				{#if showJob && c.job_name}
					<p class="cell-sub">{c.job_name}</p>
				{/if}
				{#if showTeams && c.team_names.length > 0}
					<p class="cell-sub">{c.team_names.join(', ')}</p>
				{/if}
				<div class="card-foot">
					<span class="stage-pill" style="background-color: {STAGE_COLORS[c.stage]};">
						{STAGE_LABELS[c.stage]}
					</span>
					{#if c.interview_count > 0}
						<span class="cell-sub">{c.evaluated_count}/{c.interview_count} evaluated</span>
					{/if}
					{#if c.avg_rating !== null}
						<span class="cell-sub">★ {c.avg_rating.toFixed(1)}</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if totalPages > 1}
	<div class="pagination">
		<button
			class="btn btn-quaternary btn-sm"
			on:click={() => (currentPage = Math.max(0, currentPage - 1))}
			disabled={currentPage === 0}
		>
			&laquo; Prev
		</button>
		<span class="page-info">
			Page {currentPage + 1} of {totalPages} ({filtered.length} total)
		</span>
		<button
			class="btn btn-quaternary btn-sm"
			on:click={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
			disabled={currentPage >= totalPages - 1}
		>
			Next &raquo;
		</button>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.result-count {
		font-weight: 500;
	}
	.filter-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}

	.bulk-bar {
		display: flex;
		align-items: center;
		gap: 15px;
		padding: 10px 16px;
		flex-wrap: wrap;
	}
	.bulk-select-all {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.bulk-count {
		font-size: 12px;
		font-weight: 500;
	}
	.bulk-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-left: auto;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 12px;
	}
	.candidate-card {
		padding: 16px;
		margin-bottom: 0;
		cursor: pointer;
		transition:
			box-shadow 0.2s ease,
			transform 0.2s ease;
		position: relative;
	}
	.candidate-card:hover {
		box-shadow: $shadow-lg;
		transform: translateY(-1px);
	}
	.card-selected {
		outline: 2px solid $yellow-primary;
	}
	.card-checkbox {
		position: absolute;
		top: 10px;
		right: 10px;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.card-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 10px;
	}

	.candidate-table tbody tr {
		cursor: pointer;
	}
	.row-selected {
		background-color: rgba(250, 204, 21, 0.12);
	}
	.col-check {
		width: 32px;
	}

	.cell-name {
		font-weight: 700;
		font-size: 14px;
		color: $text;
		display: inline-block;
	}
	.cell-sub {
		font-size: 12px;
		color: $text-muted;
		margin: 2px 0;
		display: block;
	}
	.conflict-flag {
		color: $warning;
		font-size: 13px;
		margin-left: 4px;
	}

	// Stage / status / outcome pills carry a computed background colour and so
	// can't use the shared tonal `.pill` classes.
	.stage-pill {
		display: inline-block;
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
		text-transform: uppercase;
		margin-right: 4px;
		white-space: nowrap;
	}

	.skeleton-card {
		padding: 20px;
		margin-bottom: 0;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin-top: 20px;
		padding: 12px 0;
	}
	.page-info {
		font-size: 12px;
		color: $text-muted;
		font-weight: 600;
	}
</style>
