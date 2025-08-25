<div class="login-screen">
  <form method="POST" action="?/login" class="login">
    <div class="login-top">
      <h2>Recruiter Login</h2>
      <label>
        Email
        <input name="email" type="email" class="form-control input-dark" placeholder="Email" />
      </label>
      <label>
        Password
        <input name="password" type="password" class="form-control input-dark" placeholder="Password" />
      </label>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <a href="/">
          <button type="button" class="btn btn-primary">Back</button>
        </a>
        <button type="submit" class="btn btn-primary">Login</button>
        <button formaction="?/signup" class="btn btn-primary">Sign up</button>
      </div>
    </div>
    <div class="login-bottom">
      <p style="color: white; margin-bottom: -2px; margin-top: 50px;">Don't have an account?&nbsp;</p>
      <a style="color:white;" href="/recruiter/request_access" class="underline">Request LUMA access</a>
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
</style>