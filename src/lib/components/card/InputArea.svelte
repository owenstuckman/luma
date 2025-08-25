<script>
  import { createEventDispatcher } from 'svelte';

  export let title = "";
  export let subtitle = "";
  export let id = "";
  export let value = "";

  const dispatch = createEventDispatcher();

  // Watch for changes in the input value
  $: dispatch('change', value);
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}
    <p class="p2">{subtitle}</p>
  {/if}
  <div class="mb-3">
    <textarea
      class="form-control"
      id={id}
      rows="3"
      bind:value={value}
      on:change={() => dispatch('change', value)}
    ></textarea>
  </div>
</div>