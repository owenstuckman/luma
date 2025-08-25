<div class="navbar">
  <div class=navbar-left>
    <div class="navbar-logo">
      <a href="/"><img src="/images/ui/logo_white.png" alt="LUMA logo" style="height: 30px; width: auto;"></a>
    </div>
    <div class="navbar-year">
        <button class="btn btn-secondary" type="button" id="dropdownYear" data-bs-toggle="dropdown" aria-expanded="false" style="width: 145px;" on:click={() => {localStorage.clear(); location.reload()}}>
          Reset Form
        </button>
    </div>
    <div class="navbar-year">
      <button class="btn btn-secondary" type="button" id="dropdownYear" data-bs-toggle="dropdown" aria-expanded="false" style="width: 145px;" on:click={() => window.history.back()}>
        Back
      </button>
  </div>

  </div>

  <div class="navbar-search">
    <h3 class="hide-on-tiny">2025-2026 Archimedes Application</h3>
  </div>

  <div class="navbar-right">

  </div>
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .navbar {
    grid-area: navbar;
    display: flex;
    justify-content: space-between;
    padding: 0;
    background-color: $dark-primary;
    border-bottom: 1px $dark-secondary solid;
  }
  .navbar-left {
    display: flex;
  }
  .navbar-logo {
    display: flex;
    height: 45px;
    width: 45px;
    align-items: center;
    justify-content: center;
    border-right: 1px $dark-secondary solid;
  }
  .navbar-year {
    display: flex;
    height: 45px;
    width: 160px;
    align-items: center;
    justify-content: center;
    border-right: 1px $dark-secondary solid;
  }
  .navbar-search {
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>