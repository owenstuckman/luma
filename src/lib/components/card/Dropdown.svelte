<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let title: string = "";
  export let subtitle: string = "";
  export let placeholder: string = "";
  export let options: string[] = [""];
  export let selected: string = "";

  const dispatch = createEventDispatcher();

  const selectOption = (option: string) => {
    selected = option;
    dispatch('change', selected);
  };

  // Watch for changes in the selected value
  $: dispatch('change', selected);
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <div class="dropdown">
    <button 
      class="btn btn-quaternary dropdown-toggle" 
      type="button" 
      data-bs-toggle="dropdown"
      aria-expanded="false"
    >
      {selected || placeholder}
    </button>

    <ul class="dropdown-menu">
      {#each options as option}
        <li>
          <a 
            href="#"
            class="dropdown-item"
            on:click|preventDefault={() => selectOption(option)}
          >
            {option}
          </a>
        </li>
      {/each}
    </ul>
  </div>
  {#if selected === "Other"}
    <input style="margin-top: 10px;" type="text" class="form-control" placeholder="Other">
  {/if}
</div>