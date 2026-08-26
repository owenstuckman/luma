<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	let {
		title = '',
		subtitle = '',
		description = '',
		linkURL = '',
		linkName = '',
		options = [] as string[],
		imageSrc = '',
		imageAlt = '',
		name = '',
		selected = $bindable([] as string[])
	} = $props();

	const dispatch = createEventDispatcher();
</script>

<div class="img-card">
	<img src={imageSrc} alt={imageAlt} />
	<div class="img-card-content">
		<h5 class="img-card-title">{title}</h5>
		{#if subtitle}<p class="field-hint">{subtitle}</p>{/if}
		<p>{description}</p>
		{#if linkURL}
			<a class="underline card-link" href={linkURL} target="_blank">
				{linkName}
			</a>
		{/if}
		{#each options as option, i}
			<div class="form-check">
				<input
					class="form-check-input pointer"
					type="checkbox"
					{name}
					id={`${name}${i}`}
					value={option}
					bind:group={selected}
					onchange={() => dispatch('change', selected)}
				/>
				<label class="form-check-label" for={`${name}${i}`}>{option}</label>
			</div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.img-card {
		display: flex;
		margin: 10px 0;
		box-shadow: $shadow;
		border: none;
		border-radius: $radius-sm;
	}
	.img-card-title {
		font-size: 24px;
	}
	.card-link {
		position: relative;
		top: -15px;
		color: $yellow-secondary;
	}
	.img-card img {
		height: auto;
		width: 200px;
		object-fit: cover;
		border: none;
		border-radius: $radius-sm 0 0 $radius-sm;
	}
	.img-card-content {
		width: 100%;
		max-width: 400px;
		padding: 20px;
		background-color: $surface;
		border: none;
		border-radius: 0 $radius-sm $radius-sm 0;
	}
	@media (max-width: 799px) {
		.img-card img {
			display: none;
		}
		.img-card-content {
			border-radius: $radius-sm;
		}
	}
</style>
