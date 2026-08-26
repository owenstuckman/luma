<script lang="ts">
	import { onMount } from 'svelte';

	let {
		message,
		type = 'info' as 'info' | 'success' | 'error',
		duration = 4000,
		onDismiss = () => {}
	}: {
		message: string;
		type?: 'info' | 'success' | 'error';
		duration?: number;
		onDismiss?: () => void;
	} = $props();

	let visible = $state(true);

	onMount(() => {
		const timer = setTimeout(() => {
			visible = false;
			onDismiss();
		}, duration);
		return () => clearTimeout(timer);
	});
</script>

{#if visible}
	<div
		class="toast toast-{type}"
		onclick={() => {
			visible = false;
			onDismiss();
		}}
		role="status"
		aria-live="polite"
		aria-atomic="true"
	>
		{#if type === 'success'}
			<i class="fi fi-br-check" aria-hidden="true"></i>
		{:else if type === 'error'}
			<i class="fi fi-br-cross-circle" aria-hidden="true"></i>
		{:else}
			<i class="fi fi-br-info" aria-hidden="true"></i>
		{/if}
		<span>{message}</span>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.toast {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: $radius;
		font-size: 13px;
		font-weight: 600;
		box-shadow: $shadow-lg;
		cursor: pointer;
		animation: slideIn 0.25s ease-out;
		max-width: 400px;
	}
	.toast-info {
		background-color: $info-bg;
		color: $info-fg;
		border: 1px solid $info;
	}
	.toast-success {
		background-color: $success-bg;
		color: $success-fg;
		border: 1px solid $success;
	}
	.toast-error {
		background-color: $danger-bg;
		color: $danger-fg;
		border: 1px solid $danger-border;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
