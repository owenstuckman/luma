<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import type { Organization, JobPosting } from '$lib/types';

  let org: Organization | null = null;
  let jobs: JobPosting[] = [];
  let loading = true;
  let error = '';

  onMount(async () => {
    const slug = $page.params.slug;

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (orgError || !orgData) {
      error = 'Organization not found.';
      loading = false;
      return;
    }

    org = orgData;

    const { data: jobData } = await supabase
      .from('job_posting')
      .select('*')
      .eq('org_id', orgData.id)
      .eq('active_flg', true)
      .order('created_at', { ascending: false });

    jobs = jobData || [];
    loading = false;
  });
</script>

{#if loading}
  <div class="loading-screen">
    <p>Loading...</p>
  </div>
{:else if error}
  <div class="loading-screen">
    <div class="error-card">
      <h2 style="color: white;">Organization not found</h2>
      <p style="color: #878fa1;">The organization you're looking for doesn't exist.</p>
      <a href="/">
        <button class="btn btn-primary">Back to Home</button>
      </a>
    </div>
  </div>
{:else if org}
  <div class="apply-screen">
    <div class="apply-header">
      {#if org.logo_url}
        <img src={org.logo_url} alt="{org.name} logo" class="org-logo" />
      {/if}
      <h1 style="color: {org.primary_color};">{org.name}</h1>
      <p class="apply-subtitle">Open Positions</p>
    </div>

    <div class="apply-content">
      {#if jobs.length === 0}
        <div class="empty-state">
          <i class="fi fi-br-file-circle-xmark" style="font-size: 48px; color: #878fa1;"></i>
          <p style="color: #878fa1; margin-top: 10px;">No open positions right now. Check back later!</p>
        </div>
      {:else}
        <div class="job-list">
          {#each jobs as job}
            <a href="/apply/{org.slug}/{job.id}" class="job-card">
              <div class="job-card-left">
                <h5 class="job-title">{job.name}</h5>
                {#if job.description}
                  <p class="job-desc">{job.description}</p>
                {/if}
              </div>
              <div class="job-card-right">
                <span class="apply-badge" style="background-color: {org.primary_color};">Apply</span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <div class="apply-footer">
      <a href="/" class="back-link">
        <i class="fi fi-br-arrow-left"></i> Back to LUMA
      </a>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .loading-screen, .apply-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    background-color: $light-secondary;
  }

  .loading-screen {
    justify-content: center;
  }

  .error-card {
    background-color: $dark-primary;
    border-radius: 10px;
    padding: 40px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
  }

  .apply-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 20px 20px;
    gap: 5px;
  }
  .org-logo {
    max-height: 60px;
    margin-bottom: 10px;
  }
  .apply-subtitle {
    color: $light-tertiary;
    font-weight: 500;
    font-size: 14px;
  }

  .apply-content {
    width: 100%;
    max-width: 600px;
    padding: 0 20px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 20px;
  }

  .job-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .job-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    text-decoration: none;
    color: $default;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .job-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
    color: $default;
  }
  .job-card-left {
    flex: 1;
  }
  .job-title {
    margin-bottom: 4px;
  }
  .job-desc {
    color: $light-tertiary;
    font-size: 13px;
    margin: 0;
    line-height: 1.4;
  }
  .job-card-right {
    margin-left: 20px;
    flex-shrink: 0;
  }
  .apply-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: $dark-primary;
  }

  .apply-footer {
    padding: 30px;
  }
  .back-link {
    display: flex;
    align-items: center;
    gap: 6px;
    color: $light-tertiary;
    font-size: 13px;
    font-weight: 500;
  }
  .back-link:hover {
    color: $default;
  }
</style>
