<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { goto } from '$app/navigation';

  $: slug = $page.params.slug || '';

  const logout = async () => {
    await supabase.auth.signOut();
    goto('/');
  };
</script>

<div class="navbar">
  <div class="navbar-left">
    <div class="navbar-logo">
      <a href="/"><img src="/images/ui/logo_white.png" alt="LUMA logo" style="height: 30px; width: auto;"></a>
    </div>
    {#if slug}
      <div class="navbar-year">
        <a href="/private" class="btn btn-secondary" style="width: 145px; font-size: 11px;">
          Switch Org
        </a>
      </div>
    {/if}
  </div>

  <div class="navbar-search">
    <h3 class="hide-on-tiny">LUMA for Recruiters</h3>
  </div>

  <div class="navbar-right">
    <button class="btn btn-secondary" style="font-size: 11px; margin-right: 10px;" on:click={logout}>
      Logout
    </button>
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
  .navbar-right {
    display: flex;
    align-items: center;
  }
</style>
