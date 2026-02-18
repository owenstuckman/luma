<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { getActiveRoles } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import { selectedJob } from '$lib/stores/jobFilter';
  import type { Organization, JobPosting } from '$lib/types';

  let org: Organization | null = null;
  let userEmail = '';
  let jobs: (JobPosting & { applicantCount: number })[] = [];
  let loading = true;

  // Filtered stats (shown after a job is selected)
  let applicantCount = 0;
  let pendingCount = 0;
  let interviewCount = 0;
  let acceptedCount = 0;

  $: slug = $page.params.slug;

  // Re-run counts when selected job changes
  $: if (org && $selectedJob) loadCounts(org.id, $selectedJob.id);

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();
    org = orgData;

    const { data: userData } = await supabase.auth.getUser();
    userEmail = userData?.user?.email || '';

    if (org) {
      const activeJobs = await getActiveRoles(org.id);

      // Fetch applicant count per job
      const jobsWithCounts = await Promise.all(
        activeJobs.map(async (job) => {
          const { count } = await supabase
            .from('applicants')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org!.id)
            .eq('job', job.id);
          return { ...job, applicantCount: count || 0 };
        })
      );
      jobs = jobsWithCounts;
    }

    loading = false;
  });

  function selectJob(job: JobPosting & { applicantCount: number }) {
    selectedJob.set(job);
  }

  function clearSelection() {
    selectedJob.set(null);
  }

  async function loadCounts(orgId: number, jobId: number) {
    let totalQ = supabase
      .from('applicants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('job', jobId);
    const { count: total } = await totalQ;
    applicantCount = total || 0;

    let pendingQ = supabase
      .from('applicants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .eq('job', jobId);
    const { count: pending } = await pendingQ;
    pendingCount = pending || 0;

    let interviewQ = supabase
      .from('applicants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'interview')
      .eq('job', jobId);
    const { count: interviews } = await interviewQ;
    interviewCount = interviews || 0;

    let acceptedQ = supabase
      .from('applicants')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'accepted')
      .eq('job', jobId);
    const { count: accepted } = await acceptedQ;
    acceptedCount = accepted || 0;
  }
</script>

<div class="layout">
  <div class="content-left">
    {#if loading}
      <p class="placeholder">Loading...</p>

    {:else if !$selectedJob}
      <!-- Job Picker -->
      <h4 style="text-align: left;">Hello, {userEmail}</h4>
      <p>Welcome to the {org?.name || ''} recruiter dashboard. Select a job posting to get started.</p>

      {#if jobs.length === 0}
        <div class="empty-state">
          <i class="fi fi-br-briefcase empty-icon"></i>
          <p>No active job postings.</p>
          <a href="/private/{slug}/settings/jobs" class="btn btn-tertiary">Manage Job Postings</a>
        </div>
      {:else}
        <div class="job-grid">
          {#each jobs as job}
            <div
              class="job-card"
              on:click={() => selectJob(job)}
              on:keydown={() => {}}
              role="button"
              tabindex="0"
            >
              <span class="job-name">{job.name}</span>
              {#if job.description}
                <p class="job-desc">{job.description}</p>
              {/if}
              <div class="job-meta">
                <span class="job-count">{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span>
                <span class="job-date">Created {new Date(job.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {:else}
      <!-- Dashboard for selected job -->
      <div class="dashboard-header">
        <div>
          <h4 style="text-align: left; margin-bottom: 2px;">{$selectedJob.name}</h4>
          {#if $selectedJob.description}
            <p class="selected-desc">{$selectedJob.description}</p>
          {/if}
        </div>
        <button class="btn btn-quaternary btn-sm" on:click={clearSelection}>
          <i class="fi fi-br-arrow-left"></i> All Jobs
        </button>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-number">{applicantCount}</span>
          <span class="stat-label">Total Applicants</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{pendingCount}</span>
          <span class="stat-label">Pending Review</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{interviewCount}</span>
          <span class="stat-label">In Interview</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{acceptedCount}</span>
          <span class="stat-label">Accepted</span>
        </div>
      </div>

      <div style="margin-top: 30px;">
        <h5>Quick Links</h5>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="/private/{slug}/review" class="btn btn-tertiary">Review Applicants</a>
          <a href="/private/{slug}/schedule/full" class="btn btn-tertiary">View Schedule</a>
          <a href="/private/{slug}/settings" class="btn btn-tertiary">Settings</a>
        </div>
      </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={0} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .placeholder {
    color: $light-tertiary;
    padding: 20px;
  }

  /* Job picker */
  .job-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 15px;
    margin-top: 20px;
  }
  .job-card {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    border-left: 4px solid $yellow-primary;
  }
  .job-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    transform: translateY(-2px);
  }
  .job-name {
    font-weight: 800;
    font-size: 16px;
    color: $dark-primary;
  }
  .job-desc {
    font-size: 13px;
    color: $light-tertiary;
    margin: 6px 0 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .job-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .job-count {
    font-size: 13px;
    font-weight: 700;
    color: $dark-primary;
  }
  .job-date {
    font-size: 11px;
    color: $light-tertiary;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: $light-tertiary;
    text-align: center;
  }
  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
    opacity: 0.4;
  }

  /* Dashboard header */
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }
  .selected-desc {
    font-size: 13px;
    color: $light-tertiary;
    margin: 0;
  }
  .btn-sm {
    font-size: 11px !important;
    padding: 4px 10px !important;
  }

  /* Stats */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-top: 20px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
  }
  .stat-number {
    font-size: 32px;
    font-weight: 900;
    color: $dark-primary;
  }
  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-top: 4px;
  }
</style>
