<script>
  export let title = "";
  export let subtitle = "";
  export let options = [""];
  export let name = "";
  let selected = [];
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  {#each options as option, i}
    <div class="form-check">
      <input
        class="form-check-input pointer"
        type="checkbox"
        name={name}
        id={name + i}
        value={option}
        bind:group={selected}
      />
      <label class="form-check-label" for={"checkbox-" + i}>
        {option}
      </label>
    </div>
  {/each}
</div>