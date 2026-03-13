<script lang="ts">
  import { onMount } from 'svelte';

  export let message: string;
  export let type: 'info' | 'success' | 'error' = 'info';
  export let duration: number = 4000;
  export let onDismiss: () => void = () => {};

  let visible = true;

  onMount(() => {
    const timer = setTimeout(() => {
      visible = false;
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  });
</script>

{#if visible}
  <div class="toast toast-{type}" on:click={() => { visible = false; onDismiss(); }} role="status">
    {#if type === 'success'}
      <i class="fi fi-br-check"></i>
    {:else if type === 'error'}
      <i class="fi fi-br-cross-circle"></i>
    {:else}
      <i class="fi fi-br-info"></i>
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
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    animation: slideIn 0.25s ease-out;
    max-width: 400px;
  }

  .toast-info {
    background-color: #eef2ff;
    color: #3730a3;
    border: 1px solid #c7d2fe;
  }
  .toast-success {
    background-color: #ecfdf5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }
  .toast-error {
    background-color: #fef2f2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>
