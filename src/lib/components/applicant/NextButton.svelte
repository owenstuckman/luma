<script lang="ts">
  let { nextNav = '', backNav = '', nextText = 'Next', localStorageKeys = [] as string[], data = [] as unknown[] } = $props();

  function handleNext() {
    if (localStorageKeys.length > 0 && data.length > 0) {
      localStorageKeys.forEach((key, index) => {
        if (data[index]) localStorage.setItem(key, JSON.stringify(data[index]));
      });
    }
  }
</script>

<div class="footer-buttons">
  {#if backNav}<a href={backNav}><button class="btn btn-tertiary">Back</button></a>{/if}
  {#if nextNav}<a href={nextNav} onclick={handleNext}><button class="btn btn-tertiary">{nextText}</button></a>{/if}
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
