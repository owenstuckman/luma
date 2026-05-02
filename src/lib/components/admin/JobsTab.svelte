<script lang="ts">
  import { supabase, toggleJobPostingActive, deleteJobPosting, adminCreateJobPosting } from '$lib/utils/supabase';
  import type { AdminJobPosting, Organization } from '$lib/types';

  let { jobPostings, organizations, onreload = () => {} }: {
    jobPostings: AdminJobPosting[];
    organizations: Organization[];
    onreload?: () => void;
  } = $props();

  let jobOrgFilter = '';
  let jobStatusFilter: 'all' | 'active' | 'inactive' = 'all';
  let showCreateJob = false;
  let newJobName = '';
  let newJobDescription = '';
  let newJobOrgId = '';
  let jobCreateError = '';
  let jobCreateSuccess = '';
  let jobCreating = false;

  $: filteredJobs = jobPostings.filter(j => {
    const orgMatch = !jobOrgFilter || j.org_name?.toLowerCase().includes(jobOrgFilter.toLowerCase());
    const statusMatch = jobStatusFilter === 'all' ||
      (jobStatusFilter === 'active' && j.active_flg) ||
      (jobStatusFilter === 'inactive' && !j.active_flg);
    return orgMatch && statusMatch;
  });

  async function toggleJob(jobId: number, currentActive: boolean) {
    try { await toggleJobPostingActive(jobId, !currentActive); onreload(); }
    catch (e: any) { console.error(e); }
  }

  async function deleteJob(jobId: number) {
    if (!confirm('Delete this job posting? This cannot be undone.')) return;
    try { await deleteJobPosting(jobId); onreload(); }
    catch (e: any) { console.error(e); }
  }

  async function createJob() {
    jobCreateError = ''; jobCreateSuccess = '';
    if (!newJobName.trim() || !newJobOrgId) { jobCreateError = 'Name and organization are required.'; return; }
    jobCreating = true;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerEmail = userData?.user?.email || '';
      await adminCreateJobPosting({
        name: newJobName,
        description: newJobDescription,
        owner: ownerEmail,
        org_id: parseInt(newJobOrgId),
        questions: { steps: [] },
        schedule: {},
      });
      jobCreateSuccess = `Created "${newJobName}" successfully.`;
      newJobName = ''; newJobDescription = ''; newJobOrgId = '';
      showCreateJob = false;
      onreload();
    } catch (e: any) { jobCreateError = e.message; }
    jobCreating = false;
  }
</script>

<div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
  <div class="filter-bar">
    <input class="form-control" bind:value={jobOrgFilter} placeholder="Filter by org name..." style="max-width: 250px;" />
    <select class="form-select" bind:value={jobStatusFilter} style="max-width: 150px;">
      <option value="all">All Status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
    <span class="muted" style="font-size: 12px;">{filteredJobs.length} postings</span>
  </div>
  <button class="btn btn-primary" on:click={() => showCreateJob = !showCreateJob}>
    {showCreateJob ? 'Cancel' : '+ New Job Posting'}
  </button>
</div>

{#if jobCreateSuccess}
  <div class="alert-success">{jobCreateSuccess}</div>
{/if}

{#if showCreateJob}
  <div class="form-card">
    <h6>Create Job Posting</h6>
    <div class="form-row">
      <label>Organization</label>
      <select class="form-select" bind:value={newJobOrgId}>
        <option value="">Select organization...</option>
        {#each organizations as org}
          <option value={org.id}>{org.name} (/{org.slug})</option>
        {/each}
      </select>
    </div>
    <div class="form-row">
      <label>Position Name</label>
      <input class="form-control" bind:value={newJobName} placeholder="e.g. Software Engineer" />
    </div>
    <div class="form-row">
      <label>Description</label>
      <textarea class="form-control" bind:value={newJobDescription} rows="2" placeholder="Brief description of the role"></textarea>
    </div>
    {#if jobCreateError}
      <p class="error-text">{jobCreateError}</p>
    {/if}
    <button class="btn btn-primary" on:click={createJob} disabled={jobCreating}>
      {jobCreating ? 'Creating...' : 'Create Job Posting'}
    </button>
  </div>
{/if}

<div class="jobs-table">
  <div class="table-header">
    <span class="col-name">Job Name</span>
    <span class="col-org">Organization</span>
    <span class="col-status">Status</span>
    <span class="col-apps">Applicants</span>
    <span class="col-actions">Actions</span>
  </div>
  {#each filteredJobs as job}
    <div class="table-row">
      <span class="col-name">
        <span class="row-name">{job.name}</span>
        {#if job.description}<span class="row-sub">{job.description}</span>{/if}
      </span>
      <span class="col-org">
        {#if job.org_name}
          <span class="row-name">{job.org_name}</span>
          <span class="row-sub">/{job.org_slug}</span>
        {:else}
          <span class="muted">No org</span>
        {/if}
      </span>
      <span class="col-status">
        <span class="badge" style="background-color: {job.active_flg ? '#ecfdf5' : '#fef2f2'}; color: {job.active_flg ? '#065f46' : '#991b1b'};">
          {job.active_flg ? 'Active' : 'Inactive'}
        </span>
      </span>
      <span class="col-apps">{job.applicant_count}</span>
      <span class="col-actions">
        <button class="btn btn-quaternary btn-sm" on:click={() => toggleJob(job.id, job.active_flg)}>
          {job.active_flg ? 'Deactivate' : 'Activate'}
        </button>
        {#if job.org_slug}
          <a href="/private/{job.org_slug}/settings/jobs/{job.id}" class="btn btn-quaternary btn-sm">Edit</a>
        {/if}
        <button class="btn btn-danger btn-sm" on:click={() => deleteJob(job.id)}>Delete</button>
      </span>
    </div>
  {/each}
  {#if filteredJobs.length === 0}
    <p class="muted" style="padding: 20px;">No job postings found.</p>
  {/if}
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .filter-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .form-card {
    background: white; border-radius: 8px; padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05); margin-bottom: 20px;
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .jobs-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 12px rgba(0,0,0,0.05); }
  .table-header {
    display: grid; grid-template-columns: 2fr 1.5fr 100px 80px 1fr;
    padding: 10px 16px; background: $light-secondary;
    font-size: 11px; font-weight: 700; color: $light-tertiary; text-transform: uppercase;
  }
  .table-row {
    display: grid; grid-template-columns: 2fr 1.5fr 100px 80px 1fr;
    padding: 12px 16px; border-bottom: 1px solid #f1f5f9; align-items: center;
    &:last-child { border-bottom: none; }
  }
  .col-actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
