<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let {
    title = '',
    subtitle = '',
    placeholder = '',
    options = [] as string[],
    selected = $bindable('')
  } = $props();

  const dispatch = createEventDispatcher();

  function selectOption(option: string) {
    selected = option;
    dispatch('change', selected);
  }
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
          <a href="#" class="dropdown-item" onclick={(e) => { e.preventDefault(); selectOption(option); }}>
            {option}
          </a>
        </li>
      {/each}
    </ul>
  </div>
  {#if selected === 'Other'}
    <input style="margin-top: 10px;" type="text" class="form-control" placeholder="Other" />
  {/if}
</div>
