<script lang="ts">
  import { page } from '$app/stores';

  type AuthMode = 'login' | 'signup' | 'forgot' | 'magic';
  let mode: AuthMode = 'login';
  let statusMessage = '';
  let statusError = false;

  // Check URL params for status messages (e.g. after password reset email sent)
  $: {
    const msg = $page.url.searchParams.get('message');
    const err = $page.url.searchParams.get('error');
    if (msg) { statusMessage = msg; statusError = false; }
    if (err) { statusMessage = err; statusError = true; }
  }
</script>

<div class="login-screen">
  <form method="POST" action="?/login" class="login">
    <div class="login-top">
      {#if mode === 'login'}
        <h2>Recruiter Login</h2>
        <label>
          Email
          <input name="email" type="email" class="form-control input-dark" placeholder="Email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" class="form-control input-dark" placeholder="Password" required />
        </label>
        {#if statusMessage}
          <p class="status-msg" class:status-error={statusError}>{statusMessage}</p>
        {/if}
        <div style="display: flex; gap: 10px; margin-top: 8px;">
          <a href="/">
            <button type="button" class="btn btn-primary">Back</button>
          </a>
          <button type="submit" class="btn btn-primary">Login</button>
          <button formaction="?/signup" class="btn btn-primary">Sign up</button>
        </div>
        <div class="auth-links">
          <button type="button" class="link-btn" on:click={() => mode = 'forgot'}>Forgot password?</button>
          <button type="button" class="link-btn" on:click={() => mode = 'magic'}>Sign in with magic link</button>
        </div>

      {:else if mode === 'forgot'}
        <h2>Reset Password</h2>
        <p class="auth-desc">Enter your email and we'll send you a password reset link.</p>
        <label>
          Email
          <input name="email" type="email" class="form-control input-dark" placeholder="Email" required />
        </label>
        {#if statusMessage}
          <p class="status-msg" class:status-error={statusError}>{statusMessage}</p>
        {/if}
        <div style="display: flex; gap: 10px; margin-top: 8px;">
          <button type="button" class="btn btn-primary" on:click={() => { mode = 'login'; statusMessage = ''; }}>Back</button>
          <button formaction="?/resetPassword" class="btn btn-primary">Send Reset Link</button>
        </div>

      {:else if mode === 'magic'}
        <h2>Magic Link</h2>
        <p class="auth-desc">Enter your email and we'll send you a one-time sign-in link.</p>
        <label>
          Email
          <input name="email" type="email" class="form-control input-dark" placeholder="Email" required />
        </label>
        {#if statusMessage}
          <p class="status-msg" class:status-error={statusError}>{statusMessage}</p>
        {/if}
        <div style="display: flex; gap: 10px; margin-top: 8px;">
          <button type="button" class="btn btn-primary" on:click={() => { mode = 'login'; statusMessage = ''; }}>Back</button>
          <button formaction="?/magicLink" class="btn btn-primary">Send Magic Link</button>
        </div>
      {/if}
    </div>
    <div class="login-bottom">
      <p style="color: white; margin-bottom: -2px; margin-top: 50px;">Don't have an account?&nbsp;</p>
      <button type="button" class="link-btn" style="color: white; text-decoration: underline;" on:click={() => mode = 'signup'}>Sign up</button>
    </div>
  </form>
</div>

<style lang="scss">
  @use '../../styles/col.scss' as *;

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
    justify-content: space-between;
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
  .login-bottom {
    display: flex;
    justify-content: center;
    align-items: end;
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

  .auth-links {
    display: flex;
    gap: 20px;
    margin-top: 12px;
  }
  .link-btn {
    background: none;
    border: none;
    color: $light-tertiary;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    &:hover { color: white; }
  }
  .auth-desc {
    color: $light-tertiary;
    font-size: 13px;
    max-width: 300px;
    text-align: center;
  }
  .status-msg {
    color: #22c55e;
    font-size: 13px;
    text-align: center;
    max-width: 300px;
  }
  .status-error {
    color: #ef4444;
  }
</style>