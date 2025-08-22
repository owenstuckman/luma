<script>
  export let nextNav = "";
  export let backNav = "";
  export let nextText = "Next";
</script>

<div class="footer-buttons">
  {#if backNav}<a href={backNav}><button class="btn btn-tertiary">Back</button></a>{/if}
  {#if nextNav}<a href={nextNav}><button class="btn btn-tertiary">{nextText}</button></a>{/if}
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .footer-buttons {
    display: flex;
    width: 100%;
    margin-top: 15px;
    gap: 10px;
    justify-content: center;
  }
</style>