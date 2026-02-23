<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import {
    getInterviewsByOrg, getAllApplicants, getOrgMembersWithEmail,
    getActiveRoles, createInterview
  } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import { selectedJob } from '$lib/stores/jobFilter';
  import { ScheduleXCalendar } from '@schedule-x/svelte';
  import { createCalendar, createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar';
  import '@schedule-x/theme-default/dist/index.css';
  import type { Interview, JobPosting, Applicant, OrgMember } from '$lib/types';

  let orgId: number | null = null;
  let interviews: Interview[] = [];
  let calendarApp: ReturnType<typeof createCalendar> | null = null;
  let loading = true;

  // Filter by interviewer
  let interviewerFilter = 'all';
  let showFlaggedOnly = false;
  $: interviewerEmails = [...new Set(interviews.map(iv => iv.interviewer).filter(Boolean))].sort() as string[];
  $: flaggedCount = interviews.filter(iv => iv.violations && iv.violations.length > 0).length;

  $: slug = $page.params.slug;

  // Create interview modal
  let showModal = false;
  let jobs: JobPosting[] = [];
  let orgMembers: (OrgMember & { email: string })[] = [];
  let allApplicants: Applicant[] = [];
  let newJobId = '';
  let newApplicantEmail = '';
  let newInterviewerEmail = '';
  let newDate = '';
  let newStart = '';
  let newEnd = '';
  let newLocation = '';
  let createError = '';
  let creating = false;
  let createSuccess = '';

  $: filteredApplicants = newJobId
    ? allApplicants.filter(a => String(a.job) === newJobId)
    : allApplicants;

  function formatForCalendar(dt: string): string {
    const d = new Date(dt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  function getTodayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Assign consistent colors per interviewer
  const interviewerColors = [
    '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];
  function getInterviewerColor(email: string): string {
    const emails = [...new Set(interviews.map(iv => iv.interviewer).filter(Boolean))].sort();
    const idx = emails.indexOf(email);
    return interviewerColors[idx % interviewerColors.length];
  }

  function buildCalendar(filtered: Interview[]) {
    const events = filtered.map(iv => {
      const isFlagged = iv.violations && iv.violations.length > 0;
      const violationSummary = isFlagged
        ? iv.violations!.map(v => v.detail).join('; ')
        : '';
      return {
        id: String(iv.id),
        title: `${isFlagged ? '⚠ ' : ''}${iv.applicant || 'Unknown'} — ${iv.interviewer || '?'}`,
        start: formatForCalendar(iv.startTime),
        end: iv.endTime ? formatForCalendar(iv.endTime) : formatForCalendar(iv.startTime),
        location: iv.location || '',
        description: `Interviewer: ${iv.interviewer || 'TBD'}\nLocation: ${iv.location || 'TBD'}\nType: ${iv.type}${isFlagged ? '\n⚠ Needs review: ' + violationSummary : ''}`,
      };
    });

    const now = new Date();
    const upcoming = filtered.find(iv => new Date(iv.startTime) >= now);
    const defaultDate = upcoming
      ? formatForCalendar(upcoming.startTime).split(' ')[0]
      : filtered.length > 0
        ? formatForCalendar(filtered[0].startTime).split(' ')[0]
        : getTodayStr();

    calendarApp = createCalendar({
      views: [createViewWeek(), createViewDay(), createViewMonthGrid()],
      events,
      selectedDate: defaultDate,
      dayBoundaries: { start: '07:00', end: '22:00' },
    });
  }

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!orgData) { loading = false; return; }
    orgId = orgData.id;

    interviews = await getInterviewsByOrg(orgId!);
    loading = false;

    // Load data for the create modal in the background
    [jobs, orgMembers, allApplicants] = await Promise.all([
      getActiveRoles(orgId!),
      getOrgMembersWithEmail(orgId!),
      getAllApplicants(orgId!)
    ]);
  });

  // Rebuild calendar when job filter, interviewer filter, or flagged filter changes
  $: if (!loading) {
    applyFilter($selectedJob?.id ?? null, interviewerFilter, showFlaggedOnly);
  }

  function applyFilter(jobId?: number | null, interviewer?: string, flaggedOnly?: boolean) {
    let filtered = interviews;
    if (jobId) filtered = filtered.filter(iv => iv.job === jobId);
    if (interviewer && interviewer !== 'all') filtered = filtered.filter(iv => iv.interviewer === interviewer);
    if (flaggedOnly) filtered = filtered.filter(iv => iv.violations && iv.violations.length > 0);
    buildCalendar(filtered);
  }

  function openModal() {
    createError = '';
    createSuccess = '';
    newJobId = '';
    newApplicantEmail = '';
    newInterviewerEmail = '';
    newDate = '';
    newStart = '';
    newEnd = '';
    newLocation = '';
    showModal = true;
  }

  async function handleCreate() {
    if (!orgId || !newApplicantEmail || !newInterviewerEmail || !newDate || !newStart) {
      createError = 'Applicant, interviewer, date, and start time are required.';
      return;
    }
    createError = '';
    creating = true;

    try {
      const startISO = `${newDate}T${newStart}:00`;
      const endISO = newEnd ? `${newDate}T${newEnd}:00` : startISO;

      await createInterview({
        startTime: startISO,
        endTime: endISO,
        location: newLocation,
        type: 'individual',
        job: newJobId ? parseInt(newJobId) : 0,
        applicant: newApplicantEmail,
        interviewer: newInterviewerEmail,
        org_id: orgId!
      });

      createSuccess = 'Interview created successfully.';
      // Refresh interviews list and calendar
      interviews = await getInterviewsByOrg(orgId!);
    } catch (e: any) {
      createError = e.message || 'Failed to create interview.';
    }
    creating = false;
  }
</script>

<div class="layout">
  <div class="content-left">
    <div class="page-header">
      <h4>Full Schedule</h4>
      <button class="btn btn-primary btn-sm" on:click={openModal}>
        <i class="fi fi-br-calendar-plus"></i> Schedule Interview
      </button>
    </div>

    <div class="filter-bar">
      <p class="subtitle">
        All interviews: <strong>{interviews.length}</strong> across <strong>{interviewerEmails.length}</strong> interviewers
        {#if flaggedCount > 0}
          <span class="flagged-badge" title="These interviews were placed with relaxed constraints and need human review">
            ⚠ {flaggedCount} need review
          </span>
        {/if}
      </p>
      <div class="filter-controls">
        {#if flaggedCount > 0}
          <label class="flagged-toggle">
            <input type="checkbox" bind:checked={showFlaggedOnly} />
            Flagged only
          </label>
        {/if}
        <select
          bind:value={interviewerFilter}
          class="form-control"
          style="max-width: 250px;"
        >
          <option value="all">All Interviewers</option>
          {#each interviewerEmails as email}
            <option value={email}>{email}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if loading}
      <p class="placeholder">Loading schedule...</p>
    {:else if calendarApp}
      <div class="calendar-wrap">
        <ScheduleXCalendar {calendarApp} />
      </div>
    {/if}

    <!-- Interviewer legend -->
    {#if interviewerFilter === 'all' && interviewerEmails.length > 0}
      <div class="legend">
        {#each interviewerEmails as email}
          <span class="legend-item">
            <span class="legend-dot" style="background-color: {getInterviewerColor(email)};"></span>
            {email}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={3} collapse="uncollapse" />
</div>

<!-- Create individual interview modal -->
{#if showModal}
  <div class="modal-overlay" on:click={() => showModal = false} on:keydown={(e) => e.key === 'Escape' && (showModal = false)}>
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation>
      <div class="modal-header">
        <h6>Schedule Individual Interview</h6>
        <button class="modal-close" on:click={() => showModal = false}>×</button>
      </div>

      {#if createSuccess}
        <div class="alert-success">{createSuccess}</div>
        <button class="btn btn-primary btn-sm" style="margin-top: 8px;" on:click={() => showModal = false}>Close</button>
      {:else}
        <div class="form-row">
          <label>Job Posting</label>
          <select class="form-select" bind:value={newJobId}>
            <option value="">All applicants</option>
            {#each jobs as job}
              <option value={String(job.id)}>{job.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-row">
          <label>Applicant *</label>
          <select class="form-select" bind:value={newApplicantEmail}>
            <option value="">Select applicant...</option>
            {#each filteredApplicants as a}
              <option value={a.email}>{a.name} ({a.email})</option>
            {/each}
          </select>
        </div>

        <div class="form-row">
          <label>Interviewer *</label>
          <select class="form-select" bind:value={newInterviewerEmail}>
            <option value="">Select interviewer...</option>
            {#each orgMembers as m}
              <option value={m.email}>{m.email} ({m.role})</option>
            {/each}
          </select>
        </div>

        <div class="form-row">
          <label>Date *</label>
          <input type="date" class="form-control" bind:value={newDate} />
        </div>

        <div class="time-row">
          <div class="form-row" style="flex: 1;">
            <label>Start Time *</label>
            <input type="time" class="form-control" bind:value={newStart} />
          </div>
          <div class="form-row" style="flex: 1;">
            <label>End Time</label>
            <input type="time" class="form-control" bind:value={newEnd} />
          </div>
        </div>

        <div class="form-row">
          <label>Location</label>
          <input class="form-control" bind:value={newLocation} placeholder="e.g. MCB230, Zoom link, etc." />
        </div>

        {#if createError}
          <p class="error-text">{createError}</p>
        {/if}

        <div class="modal-actions">
          <button class="btn btn-primary" on:click={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Interview'}
          </button>
          <button class="btn btn-quaternary btn-sm" on:click={() => showModal = false}>Cancel</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    h4 { margin: 0; }
  }
  .filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 15px;
    flex-wrap: wrap;
  }
  .filter-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .subtitle {
    font-size: 13px;
    color: $light-tertiary;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .flagged-badge {
    display: inline-block;
    background-color: #fef3c7;
    color: #92400e;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    cursor: default;
  }
  .flagged-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: #92400e;
    cursor: pointer;
    white-space: nowrap;
  }
  .placeholder {
    color: $light-tertiary;
    padding: 20px;
  }
  .calendar-wrap {
    :global(.sx-svelte-calendar-wrapper) {
      width: 100%;
      height: 700px;
      max-height: 75vh;
    }
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 15px;
    padding: 12px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: $light-tertiary;
  }
  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Modal */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  }
  .modal-content {
    background-color: white; border-radius: 10px; padding: 24px;
    width: min(480px, 90vw);
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    h6 { margin: 0; }
  }
  .modal-close {
    background: none; border: none; font-size: 20px; cursor: pointer;
    color: $light-tertiary; line-height: 1;
    &:hover { color: $dark-primary; }
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .time-row {
    display: flex; gap: 12px;
  }
  .modal-actions {
    display: flex; gap: 8px; margin-top: 16px;
  }
  .error-text { color: #ef4444; font-size: 13px; margin: 6px 0; }
  .alert-success {
    background-color: #ecfdf5; color: #065f46; padding: 10px 14px;
    border-radius: 6px; font-size: 13px;
  }
</style>
