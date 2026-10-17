<script lang="ts">
	/**
	 * An org's teams (subteams, departments, committees — whatever it recruits
	 * into). Applicants pick from the active ones on the application form, and
	 * each pick becomes its own application (migration 00024).
	 *
	 * An org with no teams is a single-team org: the team picker step is simply
	 * skipped. Teams are retired, never deleted — past applications point at them.
	 * The slug is fixed once created because question `team_scope` rules and
	 * `per_team` answer ids reference it.
	 */
	import { getAllTeams, createTeam, updateTeam, slugifyTeam } from '$lib/utils/orgConfig';
	import type { Organization, Team } from '$lib/types';

	let { org }: { org: Organization } = $props();

	let teams = $state<Team[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let message = $state('');
	let failed = $state(false);
	let busyId = $state<number | null>(null);

	let newName = $state('');
	let newDescription = $state('');
	let creating = $state(false);

	$effect(() => {
		void load(org.id);
	});

	async function load(orgId: number) {
		loading = true;
		loadError = '';
		try {
			teams = await getAllTeams(orgId);
		} catch (e) {
			// Most likely migration 00015 isn't applied — say so rather than "no teams".
			loadError = e instanceof Error ? e.message : String(e);
		}
		loading = false;
	}

	function flash(text: string, isError = false) {
		message = text;
		failed = isError;
		if (!isError) setTimeout(() => (message = ''), 3000);
	}

	async function add() {
		const name = newName.trim();
		const slug = slugifyTeam(name);
		if (!slug) return flash('Give the team a name with at least one letter or digit.', true);
		creating = true;
		try {
			const nextOrder = teams.reduce((m, t) => Math.max(m, t.display_order), 0) + 1;
			const team = await createTeam(org.id, {
				name,
				slug,
				description: newDescription.trim() || null,
				display_order: nextOrder
			});
			teams = [...teams, team];
			newName = '';
			newDescription = '';
			flash(`Added ${team.name}.`);
		} catch (e) {
			flash(e instanceof Error ? e.message : String(e), true);
		}
		creating = false;
	}

	async function saveTeam(team: Team) {
		busyId = team.id;
		try {
			await updateTeam(team.id, {
				name: team.name.trim() || team.slug,
				description: team.description?.trim() || null
			});
			flash(`Saved ${team.name}.`);
		} catch (e) {
			flash(e instanceof Error ? e.message : String(e), true);
		}
		busyId = null;
	}

	async function toggleActive(team: Team) {
		busyId = team.id;
		try {
			await updateTeam(team.id, { active: !team.active });
			teams = teams.map((t) => (t.id === team.id ? { ...t, active: !t.active } : t));
		} catch (e) {
			flash(e instanceof Error ? e.message : String(e), true);
		}
		busyId = null;
	}

	/** Swap display order with the neighbour. Two writes; the list re-sorts locally. */
	async function move(index: number, delta: -1 | 1) {
		const a = teams[index];
		const b = teams[index + delta];
		if (!a || !b) return;
		busyId = a.id;
		try {
			// Equal orders (legacy data) would make a swap a no-op, so derive from position.
			const orderA = index + 1;
			const orderB = index + delta + 1;
			await updateTeam(a.id, { display_order: orderB });
			await updateTeam(b.id, { display_order: orderA });
			const next = [...teams];
			next[index] = { ...b, display_order: orderA };
			next[index + delta] = { ...a, display_order: orderB };
			teams = next;
		} catch (e) {
			flash(e instanceof Error ? e.message : String(e), true);
		}
		busyId = null;
	}
</script>

<div class="card">
	<h5>Teams ({teams.filter((t) => t.active).length})</h5>
	<p class="card-hint">
		The teams applicants can apply to. Leave empty for a single-team org. Retired teams disappear
		from new application forms but keep their past applications.
	</p>

	{#if loading}
		<p class="muted">Loading teams…</p>
	{:else if loadError}
		<div class="alert-soft alert-error">
			Couldn't load teams: {loadError}. If the <code>teams</code> table is missing, apply the
			database migrations (<code>npm run setup</code>).
		</div>
	{:else}
		{#if teams.length === 0}
			<p class="muted">No teams yet.</p>
		{/if}
		<div class="team-list">
			{#each teams as team, i (team.id)}
				<div class="team-row" class:retired={!team.active}>
					<div class="order-btns">
						<button
							class="btn-icon"
							title="Move up"
							aria-label="Move {team.name} up"
							disabled={i === 0 || busyId !== null}
							onclick={() => move(i, -1)}><i class="fi fi-br-angle-small-up"></i></button
						>
						<button
							class="btn-icon"
							title="Move down"
							aria-label="Move {team.name} down"
							disabled={i === teams.length - 1 || busyId !== null}
							onclick={() => move(i, 1)}><i class="fi fi-br-angle-small-down"></i></button
						>
					</div>
					<div class="team-fields">
						<div class="name-line">
							<input class="form-control form-control-sm" bind:value={team.name} />
							<code class="slug" title="Slug — referenced by question team rules">{team.slug}</code>
						</div>
						<input
							class="form-control form-control-sm"
							bind:value={team.description}
							placeholder="Description (optional)"
						/>
					</div>
					<div class="team-actions">
						<button
							class="btn btn-tertiary btn-sm"
							disabled={busyId !== null}
							onclick={() => saveTeam(team)}>Save</button
						>
						<button
							class="btn btn-quaternary btn-sm"
							disabled={busyId !== null}
							onclick={() => toggleActive(team)}>{team.active ? 'Retire' : 'Restore'}</button
						>
					</div>
				</div>
			{/each}
		</div>

		<div class="add-row">
			<input
				class="form-control form-control-sm"
				bind:value={newName}
				placeholder="New team name"
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
			<input
				class="form-control form-control-sm"
				bind:value={newDescription}
				placeholder="Description (optional)"
			/>
			<button class="btn btn-tertiary btn-sm" onclick={add} disabled={creating || !newName.trim()}>
				{creating ? 'Adding…' : 'Add Team'}
			</button>
		</div>
	{/if}

	{#if message}
		<p class={failed ? 'field-error' : 'ok-msg'}>{message}</p>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.card-hint {
		font-size: 12px;
		color: $text-muted;
		margin-bottom: 10px;
	}
	.team-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 10px;
	}
	.team-row {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 8px 10px;
		background-color: $light-secondary;
		border-radius: $radius-sm;

		&.retired {
			opacity: 0.55;
		}
	}
	.order-btns {
		display: flex;
		flex-direction: column;
	}
	.team-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.name-line {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.slug {
		font-size: 11px;
		color: $text-muted;
		white-space: nowrap;
	}
	.team-actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.add-row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;

		input {
			flex: 1;
			min-width: 140px;
		}
	}
	.ok-msg {
		font-size: 13px;
		color: $success;
		margin: 8px 0 0;
	}
</style>
