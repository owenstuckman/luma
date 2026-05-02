<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    placeholder1 = '',
    placeholder2 = '',
    id1 = '',
    id2 = '',
    selected = $bindable(''),
    selected2 = $bindable('')
  } = $props();

  const dispatch = createEventDispatcher();
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <div class="dual">
    <input
      type="text"
      class="form-control"
      id={id1}
      placeholder={placeholder1}
      bind:value={selected}
      onchange={() => dispatch('change', selected)}
    />
    <input
      type="text"
      class="form-control"
      id={id2}
      placeholder={placeholder2}
      bind:value={selected2}
      onchange={() => dispatch('change', selected2)}
    />
  </div>
</div>

<style>
  .dual { display: flex; gap: 10px; }
</style>
