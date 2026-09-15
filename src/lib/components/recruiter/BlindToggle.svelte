<script lang="ts">
	// Switches every candidate name in the recruiter views to a number.
	import { onMount } from 'svelte';
	import { blindMode, initBlindMode } from '$lib/stores/blindMode';

	onMount(initBlindMode);
</script>

<label
	class="blind-toggle"
	class:on={$blindMode}
	title="Show candidates as numbers and hide their names in notes"
>
	<input type="checkbox" bind:checked={$blindMode} />
	<i class="fi {$blindMode ? 'fi-br-eye-crossed' : 'fi-br-eye'}"></i>
	Blind names
</label>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.blind-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: $radius;
		background-color: $surface;
		box-shadow: $shadow;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;

		input {
			margin: 0;
		}
		&.on {
			color: $text;
		}
	}
</style>
