<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { getActiveRoles, getOrgBySlug } from '$lib/utils/supabase';
  import { goto } from '$app/navigation';
  import { selectedJob } from '$lib/stores/jobFilter';

  $: slug = $page.params.slug || '';

  let jobs = [];

  // When slug changes, reset and reload jobs
  $: if (slug) {
    selectedJob.set(null);
    loadJobs(slug);
  }

  // Keep select in sync with store (e.g. when dashboard cards set it)
  $: selectedJobId = $selectedJob ? String($selectedJob.id) : '';

  async function loadJobs(s) {
    const org = await getOrgBySlug(s);
    if (!org) return;
    jobs = await getActiveRoles(org.id);
  }

  function onJobChange(e) {
    const val = e.target.value;
    if (val === '') {
      selectedJob.set(null);
    } else {
      const job = jobs.find(j => j.id === Number(val));
      selectedJob.set(job || null);
    }
  }

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
    {#if slug && jobs.length > 0}
      <select class="job-select" value={selectedJobId} on:change={onJobChange}>
        <option value="">All Job Postings</option>
        {#each jobs as job}
          <option value={String(job.id)}>{job.name}</option>
        {/each}
      </select>
    {:else}
      <h3 class="hide-on-tiny">LUMA for Recruiters</h3>
    {/if}
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
  .job-select {
    background-color: $dark-secondary;
    color: white;
    border: 1px solid $dark-secondary;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    min-width: 200px;
    cursor: pointer;

    &:focus {
      outline: none;
      border-color: $yellow-primary;
    }

    option {
      background-color: $dark-primary;
      color: white;
    }
  }
</style>
