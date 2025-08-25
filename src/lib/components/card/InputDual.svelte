<script>
  import { createEventDispatcher } from 'svelte';

  export let title = "";
  export let subtitle = "";
  export let placeholder1 = "";
  export let placeholder2 = "";
  export let id1 = "";
  export let id2 = "";
  export let selected = "";
  export let selected2 = "";

  const dispatch = createEventDispatcher();

  // Watch for changes in either of the inputs
  $: {
    dispatch('change', selected);
    dispatch('change', selected2);
  }
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}
    <p class="p2">{subtitle}</p>
  {/if}
  <div class="dual">
    <input
      type="text"
      class="form-control"
      id={id1}
      placeholder={placeholder1}
      bind:value={selected}
      on:change={() => dispatch('change', selected)}
    />
    <input
      type="text"
      class="form-control"
      id={id2}
      placeholder={placeholder2}
      bind:value={selected2}
      on:change={() => dispatch('change', selected2)}
    />
  </div>
</div>

<style>
  .dual {
    display: flex;
    gap: 10px;
  }
</style>