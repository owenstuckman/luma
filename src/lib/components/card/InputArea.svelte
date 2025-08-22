<script>
  export let title = "";
  export let subtitle = "";
  export let id = "";
</script>

<div class="card">
  <h5>{title}</h5>
  {#if subtitle}<p class="p2">{subtitle}</p>{/if}
  <div class="mb-3">
    <textarea class="form-control" id={id} rows="3"></textarea>
  </div>
</div>