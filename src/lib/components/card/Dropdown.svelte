<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	let {
		title = '',
		subtitle = '',
		placeholder = '',
		options = [] as string[],
		selected = $bindable('')
	} = $props();

	const dispatch = createEventDispatcher();

	// "Other" opens a free-text box. That box used to be bound to nothing, so
	// anything typed in it was discarded on the way to the answer — the
	// applicant saw their words on screen and we stored the bare word "Other".
	// Seeded from an already-stored "Other: ..." so a resumed draft keeps it.
	let otherText = $state(
		typeof selected === 'string' && selected.startsWith('Other: ') ? selected.slice(7) : ''
	);
	const isOther = $derived(selected === 'Other' || String(selected).startsWith('Other: '));

	function selectOption(option: string) {
		selected = option === 'Other' && otherText.trim() ? `Other: ${otherText.trim()}` : option;
		dispatch('change', selected);
	}

	function updateOther() {
		selected = otherText.trim() ? `Other: ${otherText.trim()}` : 'Other';
		dispatch('change', selected);
	}
</script>

<div class="card p-3">
	<h5>{title}</h5>
	{#if subtitle}<p class="field-hint">{subtitle}</p>{/if}
	<div class="dropdown">
		<button
			class="btn btn-quaternary dropdown-toggle"
			type="button"
			data-bs-toggle="dropdown"
			aria-expanded="false"
		>
			{selected || placeholder}
		</button>
		<ul class="dropdown-menu">
			{#each options as option}
				<li>
					<a
						href="#"
						class="dropdown-item"
						onclick={(e) => {
							e.preventDefault();
							selectOption(option);
						}}
					>
						{option}
					</a>
				</li>
			{/each}
		</ul>
	</div>
	{#if isOther}
		<input
			style="margin-top: 10px;"
			type="text"
			class="form-control"
			placeholder="Please specify"
			bind:value={otherText}
			oninput={updateOther}
		/>
	{/if}
</div>
