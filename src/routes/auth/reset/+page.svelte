<script lang="ts">
  import { page } from '$app/stores';

  let errorMsg = '';
  $: {
    const err = $page.url.searchParams.get('error');
    if (err) errorMsg = err;
  }
</script>

<div class="login-screen">
  <form method="POST" action="/auth?/updatePassword" class="login">
    <div class="login-top">
      <h2>Set New Password</h2>
      <p class="auth-desc">Enter your new password below.</p>
      <label>
        New Password
        <input name="password" type="password" class="form-control input-dark" placeholder="New password" required minlength="6" />
      </label>
      {#if errorMsg}
        <p class="status-error">{errorMsg}</p>
      {/if}
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button type="submit" class="btn btn-primary">Update Password</button>
      </div>
    </div>
  </form>
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
  }
  .login-top {
    display: flex;
    flex-direction: column;
    text-align: center;
    align-items: center;
    gap: 15px;
  }
  .input-dark {
    background-color: $dark-primary;
    border-color: $light-tertiary;
    width: 75%;
    color: white;
  }
  .input-dark:focus, .input-dark:active {
    background-color: $dark-primary;
    box-shadow: none;
    border-color: $yellow-primary;
    color: white;
  }
  .auth-desc {
    color: $light-tertiary;
    font-size: 13px;
  }
  .status-error {
    color: #ef4444;
    font-size: 13px;
  }
</style>
