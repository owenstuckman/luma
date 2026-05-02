<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    placeholder = '',
    id = '',
    value = $bindable('')
  } = $props();

  const dispatch = createEventDispatcher();
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <input
    type="text"
    class="form-control"
    {id}
    {placeholder}
    bind:value
    oninput={() => dispatch('change', value)}
  />
</div>
