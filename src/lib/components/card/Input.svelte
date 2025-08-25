<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let title: string = "";
  export let subtitle: string = "";
  export let placeholder: string = "";
  export let id: string = "";
  export let value: string = "";

  const dispatch = createEventDispatcher();

  // Watch for changes in the input value
  $: dispatch('change', value);
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <input type="text" class="form-control" id={id} placeholder={placeholder} bind:value={value} on:input={() => dispatch('change', value)}>
</div>