<script lang="ts">
  import { page } from '$app/stores';

  $: slug = $page.params.slug;
</script>

<div class="success-screen">
  <div class="success-card">
    <i class="fi fi-br-check-circle" style="font-size: 48px; color: #22c55e;"></i>
    <h2 style="color: white; margin-top: 15px;">Application Submitted!</h2>
    <p style="color: #878fa1;">Your application has been received. We'll be in touch soon.</p>
    <div style="display: flex; gap: 10px; margin-top: 15px;">
      <a href="/apply/{slug}">
        <button class="btn btn-primary">Back to Positions</button>
      </a>
      <a href="/">
        <button class="btn btn-primary">Home</button>
      </a>
    </div>
  </div>
</div>

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .success-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
  }
  .success-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: $dark-primary;
    border-radius: 10px;
    padding: 50px;
    text-align: center;
  }
</style>
