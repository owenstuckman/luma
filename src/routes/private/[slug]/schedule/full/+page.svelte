<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { getInterviewsByOrg } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import { selectedJob } from '$lib/stores/jobFilter';
  import { ScheduleXCalendar } from '@schedule-x/svelte';
  import { createCalendar, createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar';
  import '@schedule-x/theme-default/dist/index.css';
  import type { Interview } from '$lib/types';

  let orgId: number | null = null;
  let interviews: Interview[] = [];
  let calendarApp: ReturnType<typeof createCalendar> | null = null;
  let loading = true;

  // Filter by interviewer
  let interviewerFilter = 'all';
  $: interviewerEmails = [...new Set(interviews.map(iv => iv.interviewer).filter(Boolean))].sort() as string[];

  $: slug = $page.params.slug;

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
    const events = filtered.map(iv => ({
      id: String(iv.id),
      title: `${iv.applicant || 'Unknown'} — ${iv.interviewer || '?'}`,
      start: formatForCalendar(iv.startTime),
      end: iv.endTime ? formatForCalendar(iv.endTime) : formatForCalendar(iv.startTime),
      location: iv.location || '',
      description: `Interviewer: ${iv.interviewer || 'TBD'}\nLocation: ${iv.location || 'TBD'}\nType: ${iv.type}`,
    }));

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
  });

  // Rebuild calendar when job filter or interviewer filter changes
  $: if (!loading && interviews.length > 0) {
    applyFilter($selectedJob?.id ?? null, interviewerFilter);
  }

  function applyFilter(jobId?: number | null, interviewer?: string) {
    let filtered = interviews;
    if (jobId) filtered = filtered.filter(iv => iv.job === jobId);
    if (interviewer && interviewer !== 'all') filtered = filtered.filter(iv => iv.interviewer === interviewer);
    buildCalendar(filtered);
  }
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Full Schedule</h4>

    <div class="filter-bar">
      <p class="subtitle">All interviews: <strong>{interviews.length}</strong> total across <strong>{interviewerEmails.length}</strong> interviewers</p>
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

    {#if loading}
      <p class="placeholder">Loading schedule...</p>
    {:else if !calendarApp}
      <p class="placeholder">No interviews found.</p>
    {:else}
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

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 15px;
    flex-wrap: wrap;
  }
  .subtitle {
    font-size: 13px;
    color: $light-tertiary;
    margin: 0;
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
</style>
