<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { countWords } from '$lib/utils/formSchema';

	let {
		title = '',
		subtitle = '',
		id = '',
		placeholder = '',
		maxWords = 0,
		value = $bindable('')
	} = $props();

	const dispatch = createEventDispatcher();

	// Counted live rather than on blur: someone pasting a 400-word essay should
	// see the problem immediately, not after they try to move on.
	const words = $derived(countWords(value));
	const over = $derived(maxWords > 0 && words > maxWords);
</script>

<div class="card">
	<h5>{title}</h5>
	<!-- The live counter below the box is the enforcement; this states the cap
	     up front, before anyone has written 400 words to discover it. -->
	{#if subtitle || maxWords > 0}
		<p class="field-hint">
			{subtitle}{#if subtitle && maxWords > 0}&nbsp;{/if}{#if maxWords > 0}<span class="limit-note"
					>{maxWords} words max.</span
				>{/if}
		</p>
	{/if}
	<div class="mb-3">
		<textarea
			class="form-control"
			class:is-invalid={over}
			{id}
			{placeholder}
			rows="5"
			bind:value
			aria-describedby={maxWords > 0 ? `${id}-wordcount` : undefined}
			onchange={() => dispatch('change', value)}
			oninput={() => dispatch('change', value)}></textarea>
		{#if maxWords > 0}
			<p id="{id}-wordcount" class="word-count" class:word-count-over={over} aria-live="polite">
				{words} / {maxWords} words{#if over}&nbsp;— please trim {words - maxWords} to continue{/if}
			</p>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.word-count {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: $text-muted;
		text-align: right;
	}

	.limit-note {
		font-weight: 600;
	}

	.word-count-over {
		color: $danger;
		font-weight: 600;
	}
</style>
