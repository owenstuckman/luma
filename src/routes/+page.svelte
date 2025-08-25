<div class="login-screen">
  <div class="login-left hide-on-small">
    <img src="/images/ui/logo.png" alt="LUMA logo" class="logo-large" style="margin-bottom: 15px;">
    <h1>Welcome!</h1>
    <p style="font-weight: 600">LUMA is a custom software built by Archimedes to streamline your recruiting experience.</p>
  </div>
  <div class="login-right widen-on-small">
    <div class="login-top-right">
      <h2>Get Started</h2>
      <a href="/applicant/1_verification">
        <button class="btn btn-primary">I'm an Applicant</button>
      </a>
      <a href="/auth">
        <button class="btn btn-primary">I'm a Recruiter</button>
      </a>
    </div>
    <div class="login-bottom-right">
      <a href="/admin" class="underline" style="color: white;">I'm an Admin</a>
    </div>
  </div>
</div>

<style lang="scss">
  @use '../styles/col.scss' as *;

  .login-screen {
    display: flex;
    background: #FFC800;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
  }

  .login-left {
    display: flex;
    flex-direction: column;
    background-image: url('/images/ui/stairs_yellow.png');
    background-size: cover;
    border-radius: 10px 0 0 10px;
    width: 35vw;
    height: 55vh;
    padding: 30px;
    justify-content: left;
    align-items: start;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.1);
    overflow-y: auto;
  }

  .login-right {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background-color: $dark-primary;
    border-radius: 0 10px 10px 0;
    width: 25vw;
    height: 55vh;
    padding: 30px;
    overflow-y: auto;
  }

  .login-top-right {
    display: flex;
    flex-direction: column;
    text-align: center;
    justify-items: center;
    align-items: center;
    gap: 15px;
  }

  .login-bottom-right {
    display: flex;
    justify-content: center;
    align-items: end;
    margin-top: 50px;
  }
</style>