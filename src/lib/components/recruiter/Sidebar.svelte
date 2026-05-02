<script lang="ts">
  import { page } from '$app/stores';
  import { mobileMenuOpen } from '$lib/stores/mobileMenu';

  let { currentStep = 0, collapse = '' } = $props();

  let slug = $derived($page.params.slug || '');
  let base = $derived(`/private/${slug}`);
  let scheduleOpen = $state(currentStep >= 2 && currentStep <= 4);

  function closeMenu() { mobileMenuOpen.set(false); }
</script>

<div class="sidebar hide-on-small">
  <ul class="list-unstyled">
    <li>
      <a href="{base}/dashboard" class="btn btn-sidebar" class:sidebar-selected={currentStep === 0}>
        <i class="fi fi-br-home"></i>
        Home
      </a>
    </li>
    <li>
      <a href="{base}/review" class="btn btn-sidebar" class:sidebar-selected={currentStep === 1}>
        <i class="fi fi-br-assessment-alt"></i>
        Review
      </a>
    </li>
    <li>
      <button
        class="btn btn-sidebar"
        class:sidebar-selected={currentStep >= 2 && currentStep <= 4}
        onclick={() => scheduleOpen = !scheduleOpen}
      >
        <i class="fi fi-br-calendar-clock"></i>
        Schedule
        <i class="fi fi-br-angle-small-{scheduleOpen ? 'up' : 'down'} chevron"></i>
      </button>
      {#if scheduleOpen}
        <ul class="list-unstyled sidebar-submenu">
          <li><a href="{base}/schedule/my" class:submenu-selected={currentStep === 2}>My Schedule</a></li>
          <li><a href="{base}/schedule/full" class:submenu-selected={currentStep === 3}>Full Schedule</a></li>
        </ul>
      {/if}
    </li>
    <li>
      <a href="{base}/evaluate" class="btn btn-sidebar" class:sidebar-selected={currentStep === 5}>
        <i class="fi fi-br-tachometer-fast"></i>
        Evaluate
      </a>
    </li>
    <li>
      <a href="{base}/availability" class="btn btn-sidebar" class:sidebar-selected={currentStep === 7}>
        <i class="fi fi-br-clock"></i>
        Availability
      </a>
    </li>
    <li>
      <a href="{base}/settings" class="btn btn-sidebar" class:sidebar-selected={currentStep === 6}>
        <i class="fi fi-br-settings"></i>
        Settings
      </a>
    </li>
  </ul>
</div>

<!-- Mobile drawer -->
{#if $mobileMenuOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="mobile-overlay" onclick={closeMenu}></div>
  <div class="mobile-drawer" role="navigation" aria-label="Mobile navigation">
    <ul class="list-unstyled">
      <li>
        <a href="{base}/dashboard" class="btn btn-sidebar" class:sidebar-selected={currentStep === 0} onclick={closeMenu}>
          <i class="fi fi-br-home"></i>
          Home
        </a>
      </li>
      <li>
        <a href="{base}/review" class="btn btn-sidebar" class:sidebar-selected={currentStep === 1} onclick={closeMenu}>
          <i class="fi fi-br-assessment-alt"></i>
          Review
        </a>
      </li>
      <li>
        <button
          class="btn btn-sidebar"
          class:sidebar-selected={currentStep >= 2 && currentStep <= 4}
          onclick={() => scheduleOpen = !scheduleOpen}
        >
          <i class="fi fi-br-calendar-clock"></i>
          Schedule
          <i class="fi fi-br-angle-small-{scheduleOpen ? 'up' : 'down'} chevron"></i>
        </button>
        {#if scheduleOpen}
          <ul class="list-unstyled sidebar-submenu">
            <li><a href="{base}/schedule/my" class:submenu-selected={currentStep === 2} onclick={closeMenu}>My Schedule</a></li>
            <li><a href="{base}/schedule/full" class:submenu-selected={currentStep === 3} onclick={closeMenu}>Full Schedule</a></li>
          </ul>
        {/if}
      </li>
      <li>
        <a href="{base}/evaluate" class="btn btn-sidebar" class:sidebar-selected={currentStep === 5} onclick={closeMenu}>
          <i class="fi fi-br-tachometer-fast"></i>
          Evaluate
        </a>
      </li>
      <li>
        <a href="{base}/availability" class="btn btn-sidebar" class:sidebar-selected={currentStep === 7} onclick={closeMenu}>
          <i class="fi fi-br-clock"></i>
          Availability
        </a>
      </li>
      <li>
        <a href="{base}/settings" class="btn btn-sidebar" class:sidebar-selected={currentStep === 6} onclick={closeMenu}>
          <i class="fi fi-br-settings"></i>
          Settings
        </a>
      </li>
    </ul>
  </div>
{/if}

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
    background: transparent;
    border: none;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    &:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: white;
    }
  }
  .btn-sidebar i {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-right: 15px;
  }
  .btn-sidebar .chevron {
    margin-left: auto;
    margin-right: 8px;
    font-size: 12px;
  }
  .sidebar-selected {
    background-color: $dark-secondary !important;
    cursor: default;
  }

  .mobile-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 200;
  }
  .mobile-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 240px;
    background: $dark-primary;
    z-index: 201;
    padding: 60px 8px 20px;
    overflow-y: auto;
  }
</style>
