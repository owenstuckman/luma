<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import { getActiveRoles } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import { selectedJob } from '$lib/stores/jobFilter';
  import type { Applicant, JobPosting } from '$lib/types';

  let applicants: Applicant[] = [];
  let searchQuery = '';
  let statusFilter = 'all';
  let sortBy: 'date' | 'name' | 'status' = 'date';
  let orgId: number | null = null;
  let jobs: (JobPosting & { applicantCount: number })[] = [];
  let loading = true;

  // Bulk selection
  let selectedIds: Set<number> = new Set();
  let selectMode = false;
  let bulkStatus = 'pending';
  let bulkUpdating = false;

  $: slug = $page.params.slug;

  // Re-fetch when selected job changes (only when a job is selected)
  $: if (orgId && $selectedJob) loadApplicants($selectedJob.id);

  // Clear applicants when job is deselected
  $: if (!$selectedJob) applicants = [];

  $: filteredApplicants = applicants
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  $: allSelected = filteredApplicants.length > 0 && filteredApplicants.every(a => selectedIds.has(a.id));

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!orgData) { loading = false; return; }
    orgId = orgData.id;

    // Load active jobs for the picker
    const activeJobs = await getActiveRoles(orgId);
    const jobsWithCounts = await Promise.all(
      activeJobs.map(async (job) => {
        const { count } = await supabase
          .from('applicants')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('job', job.id);
        return { ...job, applicantCount: count || 0 };
      })
    );
    jobs = jobsWithCounts;
    loading = false;
  });

  function selectJob(job: JobPosting & { applicantCount: number }) {
    selectedJob.set(job);
  }

  async function loadApplicants(jobId: number) {
    if (!orgId) return;
    const { data } = await supabase
      .from('applicants')
      .select('*')
      .eq('org_id', orgId)
      .eq('job', jobId)
      .order('created_at', { ascending: false });
    applicants = data || [];
  }

  const navigateToReview = (id: number) => {
    if (selectMode) return;
    goto(`/private/${slug}/review/candidate?id=${id}`);
  };

  function toggleSelect(id: number) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = new Set(selectedIds);
  }

  function toggleSelectAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(filteredApplicants.map(a => a.id));
    }
  }

  function exitSelectMode() {
    selectMode = false;
    selectedIds = new Set();
  }

  async function bulkUpdateStatus() {
    if (selectedIds.size === 0) return;
    bulkUpdating = true;

    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('applicants')
      .update({ status: bulkStatus })
      .in('id', ids);

    if (error) {
      console.error('Bulk update failed:', error);
    } else {
      if ($selectedJob) await loadApplicants($selectedJob.id);
      selectedIds = new Set();
    }
    bulkUpdating = false;
  }

  function exportCSV() {
    const targets = selectMode && selectedIds.size > 0
      ? filteredApplicants.filter(a => selectedIds.has(a.id))
      : filteredApplicants;

    const headers = ['Name', 'Email', 'Status', 'Applied', 'Job ID'];
    const rows = targets.map(a => [
      `"${a.name}"`,
      `"${a.email}"`,
      a.status,
      new Date(a.created_at).toLocaleDateString(),
      a.job ?? '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applicants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return '#878fa1';
      case 'interview': return '#3b82f6';
      case 'accepted': return '#22c55e';
      case 'denied': return '#ef4444';
      default: return '#878fa1';
    }
  }
</script>

<div class="layout">
  <div class="content-left">
    {#if loading}
      <p class="placeholder-text">Loading...</p>

    {:else if !$selectedJob}
      <!-- Job Picker -->
      <h4 style="text-align: left;">Review Applications</h4>
      <p class="subtitle">Select a job posting to review its applicants.</p>

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
              <span class="job-count">{job.applicantCount} applicant{job.applicantCount !== 1 ? 's' : ''}</span>
            </div>
          {/each}
        </div>
      {/if}

    {:else}

    <h4 style="text-align: left;">Review Applications — {$selectedJob.name}</h4>

    <div class="filter-bar">
      <input
        type="text"
        placeholder="Search by name..."
        bind:value={searchQuery}
        class="form-control"
        style="max-width: 250px;"
      />
      <select bind:value={statusFilter} class="form-control" style="max-width: 150px;">
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="interview">Interview</option>
        <option value="accepted">Accepted</option>
        <option value="denied">Denied</option>
      </select>
      <select bind:value={sortBy} class="form-control" style="max-width: 140px;">
        <option value="date">Sort: Date</option>
        <option value="name">Sort: Name</option>
        <option value="status">Sort: Status</option>
      </select>
      <span class="result-count">{filteredApplicants.length} applicants</span>
      <div class="filter-actions">
        {#if !selectMode}
          <button class="btn btn-quaternary btn-sm" on:click={() => selectMode = true}>
            Select
          </button>
        {:else}
          <button class="btn btn-quaternary btn-sm" on:click={exitSelectMode}>
            Cancel
          </button>
        {/if}
        <button class="btn btn-quaternary btn-sm" on:click={exportCSV} title="Export to CSV">
          <i class="fi fi-br-download"></i> CSV
        </button>
      </div>
    </div>

    <!-- Bulk action bar -->
    {#if selectMode}
      <div class="bulk-bar">
        <label class="bulk-select-all">
          <input type="checkbox" checked={allSelected} on:change={toggleSelectAll} />
          Select all ({filteredApplicants.length})
        </label>
        <span class="bulk-count">{selectedIds.size} selected</span>
        <div class="bulk-actions">
          <select bind:value={bulkStatus} class="form-control" style="max-width: 140px; font-size: 12px;">
            <option value="pending">Set Pending</option>
            <option value="interview">Set Interview</option>
            <option value="accepted">Set Accepted</option>
            <option value="denied">Set Denied</option>
          </select>
          <button
            class="btn btn-tertiary btn-sm"
            on:click={bulkUpdateStatus}
            disabled={selectedIds.size === 0 || bulkUpdating}
          >
            {bulkUpdating ? 'Updating...' : 'Apply'}
          </button>
        </div>
      </div>
    {/if}

    <div class="applicant-grid">
      {#each filteredApplicants as applicant}
        <div
          class="applicant-card"
          class:card-selected={selectedIds.has(applicant.id)}
          on:click={() => selectMode ? toggleSelect(applicant.id) : navigateToReview(applicant.id)}
          on:keydown={() => {}}
          role="button"
          tabindex="0"
        >
          {#if selectMode}
            <div class="card-checkbox">
              <input
                type="checkbox"
                checked={selectedIds.has(applicant.id)}
                on:click|stopPropagation={() => toggleSelect(applicant.id)}
              />
            </div>
          {/if}
          <div class="applicant-card-top">
            <span class="applicant-name">{applicant.name}</span>
            <span class="status-badge" style="background-color: {getStatusColor(applicant.status)};">
              {applicant.status}
            </span>
          </div>
          <p class="applicant-meta">{applicant.email}</p>
          <p class="applicant-meta">{new Date(applicant.created_at).toLocaleDateString()}</p>
        </div>
      {/each}

      {#if filteredApplicants.length === 0}
        <p style="color: #878fa1; padding: 20px;">No applicants found.</p>
      {/if}
    </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={1} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .placeholder-text {
    color: $light-tertiary;
    padding: 20px;
  }
  .subtitle {
    font-size: 13px;
    color: $light-tertiary;
    margin-bottom: 10px;
  }

  /* Job picker */
  .job-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
    margin-top: 15px;
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
  .job-count {
    font-size: 13px;
    font-weight: 700;
    color: $dark-primary;
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

  .filter-bar {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 15px;
    flex-wrap: wrap;
  }
  .result-count {
    font-size: 13px;
    color: $light-tertiary;
    font-weight: 500;
  }
  .filter-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .btn-sm {
    font-size: 11px !important;
    padding: 4px 10px !important;
  }

  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px 16px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    margin-bottom: 15px;
    flex-wrap: wrap;
  }
  .bulk-select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .bulk-count {
    font-size: 12px;
    color: $light-tertiary;
    font-weight: 500;
  }
  .bulk-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-left: auto;
  }

  .applicant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }
  .applicant-card {
    background-color: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    position: relative;
  }
  .applicant-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }
  .card-selected {
    outline: 2px solid $yellow-primary;
  }
  .card-checkbox {
    position: absolute;
    top: 10px;
    right: 10px;
  }
  .applicant-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .applicant-name {
    font-weight: 700;
    font-size: 14px;
    color: $dark-primary;
  }
  .status-badge {
    font-size: 10px;
    font-weight: 700;
    color: white;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .applicant-meta {
    font-size: 12px;
    color: $light-tertiary;
    margin: 2px 0;
  }
</style>
