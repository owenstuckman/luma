<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    id = '',
    value = $bindable('')
  } = $props();

  const dispatch = createEventDispatcher();
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <div class="mb-3">
    <textarea
      class="form-control"
      {id}
      rows="3"
      bind:value
      onchange={() => dispatch('change', value)}
    ></textarea>
  </div>
</div>
