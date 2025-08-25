<div class="login-screen">
  <div class="login">
    <div class="login-top">
      <h2>Create a LUMA Account</h2>

      <div style="display: flex; gap: 10px; width: 75%;">
        <input type="text" class="form-control input-dark" id="registerFirst" placeholder="First">
        <input type="text" class="form-control input-dark" id="registerLast" placeholder="Last">
      </div>
      <input type="text" class="form-control input-dark" id="registerEmail" placeholder="Email">
      <input type="text" class="form-control input-dark" id="registerPassword" placeholder="Password">
      <input type="text" class="form-control input-dark" id="registerPasswordConfirm" placeholder="Confirm Password">

      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <a href="/recruiter">
          <button class="btn btn-primary">Back</button>
        </a>
        <a href="/">
          <button class="btn btn-primary">Request</button>
        </a>
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

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