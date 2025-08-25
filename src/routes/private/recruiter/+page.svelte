<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/private/recruiter/home'); // Redirect to the home page
  });
</script>

<div class="login-screen">
  <div class="login">
    <div class="login-top">
      <h2>Redirecting...</h2>
      <p>Please wait while we redirect you to the home page.</p>
    </div>
  </div>
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .login-screen {
    display: flex;
    background: $yellow-primary;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
  }
  .login {
    display: flex;
    flex-direction: column;
    justify-content: center;
    background-color: $dark-primary;
    border-radius: 10px;
    width: 40vw;
    padding: 30px;
    overflow-y: auto;
  }
  .login-top {
    display: flex;
    flex-direction: column;
    text-align: center;
    justify-items: center;
    align-items: center;
    gap: 15px;
  }
</style>