<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-screen">
  <div class="error-card">
    <h1 class="error-code">{$page.status}</h1>
    <h2 class="error-title">
      {#if $page.status === 404}
        Page Not Found
      {:else if $page.status === 500}
        Server Error
      {:else}
        Something Went Wrong
      {/if}
    </h2>
    <p class="error-message">
      {#if $page.error?.message}
        {$page.error.message}
      {:else if $page.status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else}
        An unexpected error occurred. Please try again later.
      {/if}
    </p>
    <div class="error-actions">
      <a href="/" class="btn btn-primary">Back to Home</a>
      <button class="btn btn-secondary" on:click={() => history.back()}>Go Back</button>
    </div>
  </div>
</div>

<style lang="scss">
  @use '../styles/col.scss' as *;

  .error-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
  }
  .error-card {
    background-color: $dark-primary;
    border-radius: 10px;
    padding: 50px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 450px;
  }
  .error-code {
    font-size: 72px;
    font-weight: 900;
    color: $yellow-primary;
    line-height: 1;
    margin: 0;
  }
  .error-title {
    color: white;
    font-size: 22px;
    margin: 0;
  }
  .error-message {
    color: $light-tertiary;
    font-size: 14px;
    margin: 5px 0 15px;
  }
  .error-actions {
    display: flex;
    gap: 10px;
  }
</style>
