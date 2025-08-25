<script>
  export let currentStep = 0;
  export let collapse = "collapse";
</script>

<div class="sidebar hide-on-small">
  <ul class="list-unstyled">
    <li>
      <a href="/private/recruiter/home" class="btn btn-secondary btn-sidebar" class:sidebar-selected={currentStep === 0}>
        <i class="fi fi-br-home"></i>
        Home
      </a>
    </li>
    <li>
      <a href="/private/recruiter/review" class="btn btn-secondary btn-sidebar" class:sidebar-selected={currentStep === 1}>
        <i class="fi fi-br-assessment-alt"></i>
        Review
      </a>
    </li>
    <li>
      <a class="btn btn-secondary btn-sidebar"
        class:sidebar-selected={currentStep >= 2 && currentStep <= 4}
        data-bs-toggle="collapse"
        href="#submenuSchedule"
        style="cursor: pointer !important;"
      >
        <i class="fi fi-br-calendar-clock"></i>
        Schedule
      </a>
      <div class={collapse} id="submenuSchedule">
        <ul class="list-unstyled sidebar-submenu">
          <li><a href="/private/recruiter/schedule/my_schedule" class:submenu-selected={currentStep === 2}>My Schedule</a></li>
          <li><a href="/private/recruiter/schedule/full_schedule" class:submenu-selected={currentStep === 3}>Full Schedule</a></li>
        </ul>
      </div>
    </li>
    <li>
      <a href="/private/recruiter/evaluate" class="btn btn-secondary btn-sidebar" class:sidebar-selected={currentStep === 5}>
        <i class="fi fi-br-tachometer-fast"></i>
        Evaluate
      </a>
    </li>
    <li>
      <a href="/private/recruiter/settings" class="btn btn-secondary btn-sidebar" class:sidebar-selected={currentStep === 6}>
        <i class="fi fi-br-lightbulb-setting"></i>
        Settings
      </a>
    </li>
  </ul>
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;
  
  .sidebar {
    grid-area: sidebar;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 5px;
    background-color: $dark-primary;
  }
  .sidebar-submenu li {
    align-content: center;
    height: 35px;
    font-size: 12px;
    margin-left: 20px;
    padding-left: 20px;
    border-left: 2px $light-tertiary solid;
    transition: border 0.2s ease;
  }
  .sidebar-submenu li:hover {
    border-left: 2px white solid;
    transition: border 0.2s ease;
  }
  .sidebar-submenu li a {
    color: $light-tertiary;
    transition: color 0.2s ease;
  }
  .sidebar-submenu li:hover a {
    color: white;
    transition: color 0.2s ease;
  }
  .submenu-selected {
    color: white !important;
    cursor: default;
  }
  .sidebar-submenu li:has(.submenu-selected) {
    border-left: 2px white solid !important;
  }
  .btn-sidebar {
    display: flex;
    margin-top: 5px;
    margin-bottom: 5px;
    padding-left: 10px;
    height: 35px;
    width: 195px;
    font-weight: 600;
    align-items: center;
    justify-content: start;
  }
  .btn-sidebar i {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-right: 15px;
  }
  .sidebar-selected {
    background-color: $dark-secondary;
    cursor: default;
  }
</style>