<script lang="ts">
	let { message = 'This is a warning!' } = $props();
</script>

<div class="alert-soft alert-warning warning-box">
	<span class="warning-icon">⚠️</span>
	<span>{message}</span>
</div>

<style>
	/* Tone and shape come from the shared `.alert-soft` / `.alert-warning`. */
	.warning-box {
		display: flex;
		align-items: center;
	}
	.warning-icon {
		margin-right: 10px;
		font-size: 1.5em;
	}
</style>
