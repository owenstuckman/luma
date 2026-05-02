<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    options = [] as string[],
    name = '',
    selected = $bindable([] as string[])
  } = $props();

  const dispatch = createEventDispatcher();
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  {#each options as option, i}
    <div class="form-check">
      <input
        class="form-check-input pointer"
        type="checkbox"
        {name}
        id={name + i}
        value={option}
        bind:group={selected}
        onchange={() => dispatch('change', selected)}
      />
      <label class="form-check-label" for={name + i}>{option}</label>
    </div>
  {/each}
</div>
