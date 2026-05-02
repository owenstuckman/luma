<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    options = [] as string[],
    name = '',
    other = '',
    selected = $bindable('')
  } = $props();

  const dispatch = createEventDispatcher();
  let selectedId = $state('');
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  {#each options as option, i}
    <div class="form-check">
      <input
        class="form-check-input pointer"
        type="radio"
        {name}
        id={name + i}
        value={option}
        bind:group={selected}
        onchange={() => {
          selectedId = name + i;
          dispatch('change', selected);
        }}
      />
      <label class="form-check-label pointer" for={name + i}>{option}</label>
    </div>
  {/each}
  {#if other}
    <div class="form-check" style="margin-top: -7px;">
      <input class="form-check-input pointer" type="radio" {name} id={name + 'Other'} onchange={() => selectedId = name + 'Other'} />
      <input type="text" class="form-control mt-1" placeholder={other} disabled={selectedId !== name + 'Other'} />
    </div>
  {/if}
</div>
