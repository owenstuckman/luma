<script lang='ts'>
  import { createEventDispatcher } from 'svelte';

  export let title: string = "";
  export let subtitle: string = "";
  export let description: string = "";
  export let linkURL: string = "";
  export let linkName: string = "";
  export let options: string[] = [""];
  export let imageSrc: string = "";
  export let imageAlt: string = "";
  export let name: string = "";
  export let selected: string[] = [];

  const dispatch = createEventDispatcher();

  // Watch for changes in the selected array
  $: dispatch('change', selected);
</script>

<div class="img-card">
  <img src={imageSrc} alt={imageAlt} />
  <div class="img-card-content">
    <h5 style="font-size: 24px;">{title}</h5>
    {#if subtitle}<p class="p2">{subtitle}</p>{/if}
    <p>{description}</p>
    {#if linkURL}
      <a class="underline" href={linkURL} target="_blank" style="position: relative; top: -15px; color: #e8aa00;">
        {linkName}
      </a>
    {/if}
    {#each options as option, i}
      <div class="form-check">
        <input
          class="form-check-input pointer"
          type="checkbox"
          name={name}
          id={`${name}${i}`}
          value={option}
          bind:group={selected}
          on:change={() => dispatch('change', selected)}
        />
        <label class="form-check-label" for={`checkbox-${i}`}>
          {option}
        </label>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .img-card {
    display: flex;
    margin: 10px 0;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.1);
    border: none;
    border-radius: 5px;
  }
  .img-card img {
    height: auto;
    width: 200px;
    object-fit: cover;
    border: none;
    border-radius: 5px 0 0 5px;
  }
  .img-card-content {
    width: 100%;
    max-width: 400px;
    padding: 20px;
    background-color: white;
    border: none;
    border-radius: 0 5px 5px 0;
  }

  @media (max-width: 799px) {
    .img-card img {
      display: none;
    }
    .img-card-content {
      border-radius: 5px;
    }
  }
</style>