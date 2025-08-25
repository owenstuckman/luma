<script>
  import { createEventDispatcher } from 'svelte';

  export let title = "";
  export let subtitle = "";
  export let options = [""];
  export let name = "";
  export let other = "";
  export let selected = "";
  let selectedId = "";

  const dispatch = createEventDispatcher();

  // Watch for changes in the selected value
  $: {
    dispatch('change', selected);
  }
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  {#each options as option, i}
    <div class="form-check">
      <input
        class="form-check-input pointer"
        type="radio"
        name={name}
        id={name+i}
        value={option}
        bind:group={selected}
        on:change={() => {
          selectedId = name + i;
          dispatch('change', selected);
        }}
      />
      <label class="form-check-label pointer" for={name + i}>
        {option}
      </label>
    </div>
  {/each}
  {#if other}
    <div class="form-check" style="margin-top: -7px;">
      <input class="form-check-input pointer" type="radio" name={name} id={name+"Other"} on:change={() => selectedId = name+"Other"} />
      <input type="text" class="form-control mt-1" placeholder={other} disabled={selectedId !== name+"Other"} />
    </div>
  {/if}
</div>