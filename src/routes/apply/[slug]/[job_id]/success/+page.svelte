<script lang="ts">
	import { page } from '$app/stores';

	$: slug = $page.params.slug;
	// How many applications the submit actually created — one per team chosen.
	// Absent or unparseable falls back to 1, which is the single-team wording and
	// is never wrong enough to matter.
	$: count = Math.max(1, Number($page.url.searchParams.get('n')) || 1);
</script>

<div class="success-screen">
	<div class="success-card text-center">
		<i class="fi fi-br-check-circle success-icon"></i>
		<h2 class="success-title">Application Submitted!</h2>
		{#if count > 1}
			<p class="muted">
				Your <strong>{count} applications</strong> have been received — one for each team you selected.
				Each is reviewed separately, so you may hear back about them at different times.
			</p>
		{:else}
			<p class="muted">Your application has been received. We'll be in touch soon.</p>
		{/if}
		<div style="display: flex; gap: 10px; margin-top: 15px;">
			<a href="/apply/{slug}">
				<button class="btn btn-primary">Back to Positions</button>
			</a>
			<a href="/">
				<button class="btn btn-primary">Home</button>
			</a>
		</div>
	</div>
</div>

<style lang="scss">
	@use '../../../../../styles/col.scss' as *;

	.success-screen {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
	}
	.success-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		background-color: $dark-primary;
		border-radius: 10px;
		padding: 50px;
		text-align: center;
	}
	.success-icon {
		font-size: 48px;
		color: $success;
	}
	.success-title {
		margin-top: 15px;
	}
</style>
