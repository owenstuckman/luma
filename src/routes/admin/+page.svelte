<div class="login-screen">
  <div class="login">
    <div class="login-top">
      <h2>Admin Login</h2>

      <input type="text" class="form-control input-dark" id="loginEmail" placeholder="Email">
      <input type="text" class="form-control input-dark" id="loginPassword" placeholder="Password">

      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <a href="/">
          <button class="btn btn-primary">Back</button>
        </a>
        <a href="/recruiter/home">
          <button class="btn btn-primary">Login</button>
        </a>
      </div>
    </div>
    <div class="login-bottom">
      <p style="color: white; margin-bottom: -2px; margin-top: 50px;">Contact a LUMA admin for new admin accounts</p>
    </div>
  </div>
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