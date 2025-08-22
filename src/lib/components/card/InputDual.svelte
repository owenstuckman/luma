<script>
  export let title = "";
  export let subtitle = "";
  export let placeholder1 = "";
  export let placeholder2 = "";
  export let id1 = "";
  export let id2 = "";
  let selected = "";
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <div class="dual">
    <input type="text" class="form-control" id={id1} placeholder={placeholder1}>
    <input type="text" class="form-control" id={id2} placeholder={placeholder2}>
  </div>
</div>

<style>
  .dual {
    display: flex;
    gap: 10px;
  }
</style>