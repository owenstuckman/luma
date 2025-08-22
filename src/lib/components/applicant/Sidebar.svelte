<script>
  export let currentStep = 0;
</script>

<div class="sidebar hide-on-small">
  <ul class="list-unstyled">
    <li class:step-selected={currentStep === 0} class:step-disabled={currentStep < 0}>
      <p class="step-sidebar">
        <i class="fi fi-br-shield-trust"></i>
        Verification
      </p>
    </li>
    <li class:step-selected={currentStep === 1} class:step-disabled={currentStep < 1}>
      <p class="step-sidebar">
        <i class="fi fi-br-file-user"></i>
        Personal Info
      </p>
    </li>
    <li class:step-selected={currentStep === 2} class:step-disabled={currentStep < 2}>
      <p class="step-sidebar">
        <i class="fi fi-br-employees"></i>
        Teams
      </p>
    </li>
    <li class:step-selected={currentStep === 3} class:step-disabled={currentStep < 3}>
      <p class="step-sidebar">
        <i class="fi fi-br-calendar-clock"></i>
        Availability
      </p>
    </li>
    <li class:step-selected={currentStep === 4} class:step-disabled={currentStep < 4}>
      <p class="step-sidebar">
        <i class="fi fi-br-file-edit"></i>
        Free Response
      </p>
    </li>
    <li class:step-selected={currentStep === 5} class:step-disabled={currentStep < 5}>
      <p class="step-sidebar">
        <i class="fi fi-br-thumbs-up-trust"></i>
        Review
      </p>
    </li>
    <li class:step-selected={currentStep === 6} class:step-disabled={currentStep < 6}>
      <p class="step-sidebar">
        <i class="fi fi-br-paper-plane"></i>
        Submit
      </p>
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
  .step-sidebar {
    display: flex;
    margin-top: 5px;
    margin-bottom: 5px;
    padding-left: 10px;
    height: 35px;
    width: 195px;
    font-weight: 600;
    align-items: center;
    justify-content: start;
    background-color: transparent;
    border: none;
    font-weight: 600;
    font-size: 12px;
    color: white;
  }
  .step-sidebar i {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-right: 15px;
  }
  .step-selected .step-sidebar {
    background-color: $dark-secondary;
    border-radius: 5px;
  }
  .step-disabled .step-sidebar {
    color: $light-tertiary;
  }
</style>