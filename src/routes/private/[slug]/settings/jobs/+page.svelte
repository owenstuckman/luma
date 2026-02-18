<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import { getAllJobPostings, createJobPosting, deleteJobPosting, toggleJobPostingActive } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import type { JobPosting } from '$lib/types';

  let jobs: JobPosting[] = [];
  let orgId: number | null = null;
  let loading = true;

  // Create new job
  let showCreate = false;
  let newName = '';
  let newDescription = '';
  let creating = false;
  let createError = '';

  $: slug = $page.params.slug;

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!orgData) return;
    orgId = orgData.id;
    await loadJobs();
    loading = false;
  });

  async function loadJobs() {
    if (!orgId) return;
    jobs = await getAllJobPostings(orgId);
  }

  async function handleCreate() {
    if (!orgId || !newName.trim()) return;
    creating = true;
    createError = '';

    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerEmail = userData?.user?.email || '';

      await createJobPosting({
        name: newName,
        description: newDescription,
        owner: ownerEmail,
        org_id: orgId,
        questions: { steps: [] },
        schedule: {},
      });

      newName = '';
      newDescription = '';
      showCreate = false;
      await loadJobs();
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Failed to create';
    } finally {
      creating = false;
    }
  }

  async function handleToggle(job: JobPosting) {
    try {
      await toggleJobPostingActive(job.id, !job.active_flg);
      await loadJobs();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  }

  async function handleDelete(job: JobPosting) {
    if (!confirm(`Delete "${job.name}"? This cannot be undone.`)) return;
    try {
      await deleteJobPosting(job.id);
      await loadJobs();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }
</script>

<div class="layout">
  <div class="content-left">
    <div class="page-header">
      <div>
        <a href="/private/{slug}/settings" class="back-link">
          <i class="fi fi-br-arrow-left"></i> Settings
        </a>
        <h4 style="text-align: left; margin-top: 10px;">Job Postings</h4>
      </div>
      <button class="btn btn-tertiary" on:click={() => showCreate = !showCreate}>
        <i class="fi fi-br-plus"></i> New Posting
      </button>
    </div>

    {#if showCreate}
      <div class="card create-card">
        <h5>Create New Job Posting</h5>
        <div class="field">
          <label>Position Name</label>
          <input type="text" class="form-control" bind:value={newName} placeholder="e.g. Software Engineer" />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea class="form-control" bind:value={newDescription} rows="2" placeholder="Brief description of the role"></textarea>
        </div>
        {#if createError}
          <p class="error-text">{createError}</p>
        {/if}
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn btn-tertiary" on:click={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button class="btn btn-quaternary" on:click={() => showCreate = false}>Cancel</button>
        </div>
      </div>
    {/if}

    {#if loading}
      <p style="color: #878fa1;">Loading...</p>
    {:else if jobs.length === 0}
      <div class="empty-state">
        <i class="fi fi-br-document" style="font-size: 36px; color: #878fa1;"></i>
        <p style="color: #878fa1; margin-top: 10px;">No job postings yet. Create one to get started.</p>
      </div>
    {:else}
      <div class="job-list">
        {#each jobs as job}
          <div class="job-row">
            <div class="job-row-main">
              <div class="job-row-info">
                <div class="job-row-title-line">
                  <span class="job-row-name">{job.name}</span>
                  <span class="status-pill" class:active={job.active_flg} class:inactive={!job.active_flg}>
                    {job.active_flg ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {#if job.description}
                  <p class="job-row-desc">{job.description}</p>
                {/if}
                <div class="job-row-meta">
                  <span>Created {new Date(job.created_at).toLocaleDateString()}</span>
                  <span>{job.questions?.steps?.length || 0} form steps</span>
                </div>
              </div>
              <div class="job-row-actions">
                <a href="/private/{slug}/settings/jobs/{job.id}" class="btn btn-tertiary btn-sm">
                  Edit Form
                </a>
                <button class="btn btn-quaternary btn-sm" on:click={() => handleToggle(job)}>
                  {job.active_flg ? 'Deactivate' : 'Activate'}
                </button>
                <button class="btn btn-danger-outline btn-sm" on:click={() => handleDelete(job)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={6} />
</div>

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 15px;
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: $light-tertiary;
    font-size: 13px;
    font-weight: 600;
  }
  .back-link:hover { color: $dark-primary; }

  .create-card {
    max-width: 500px;
    margin-bottom: 20px;
  }
  .field {
    margin-bottom: 10px;
  }
  .field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-bottom: 4px;
  }
  .error-text {
    color: #ef4444;
    font-size: 13px;
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
    gap: 10px;
  }
  .job-row {
    background-color: white;
    border-radius: 8px;
    padding: 16px 20px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.06);
  }
  .job-row-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }
  .job-row-info {
    flex: 1;
  }
  .job-row-title-line {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .job-row-name {
    font-weight: 700;
    font-size: 15px;
  }
  .job-row-desc {
    font-size: 13px;
    color: $light-tertiary;
    margin: 0 0 6px;
  }
  .job-row-meta {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: $light-tertiary;
  }
  .job-row-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    align-items: flex-start;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .status-pill.active {
    background-color: #22c55e;
    color: white;
  }
  .status-pill.inactive {
    background-color: #878fa1;
    color: white;
  }

  .btn-sm {
    font-size: 11px !important;
    padding: 4px 12px !important;
  }
  .btn-danger-outline {
    background-color: transparent;
    border: 1px solid #ef4444;
    color: #ef4444;
    border-radius: 5px;
    font-weight: 600;
    font-size: 12px;
  }
  .btn-danger-outline:hover {
    background-color: #ef4444;
    color: white;
  }
</style>
