<div class="navbar">
  <div class=navbar-left>
    <div class="navbar-logo">
      <a href="/"><img src="/images/ui/logo_white.png" alt="LUMA logo" style="height: 30px; width: auto;"></a>
    </div>
    <div class="navbar-year">
      <div class="dropdown">
        <button class="btn btn-secondary dropdown-toggle" type="button" id="dropdownYear" data-bs-toggle="dropdown" aria-expanded="false" style="width: 145px;">
          Fall 2025
        </button>

        <ul class="dropdown-menu dropdown-menu-start" aria-labelledby="dropdownYear">
          <li><a class="dropdown-item" href="/">Fall 2025</a></li>
          <li><a class="dropdown-item" href="https://www.archimedesvt.org/luma">Fall 2024</a></li>
          <li><a class="dropdown-item" href="https://www.archimedesvt.org/luma">Fall 2023</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item" href="/">View All</a></li>
        </ul>
      </div>
    </div>
  </div>

  <div class="navbar-search">
    <h3 class="hide-on-tiny">LUMA for Recruiters</h3>
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