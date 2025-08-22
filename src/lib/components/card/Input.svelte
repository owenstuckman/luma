<script>
  export let title = "";
  export let subtitle = "";
  export let placeholder = "";
  export let id = "";
  let selected = "";
</script>

<div class="card p-3">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <input type="text" class="form-control" id={id} placeholder={placeholder}>
</div>