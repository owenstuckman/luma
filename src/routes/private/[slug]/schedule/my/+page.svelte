<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { getInterviewsByInterviewer, getCurrentUserEmail } from '$lib/utils/supabase';
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
  let userEmail = '';

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

  // Rebuild calendar when job filter changes
  $: if (!loading && interviews.length > 0) {
    const filtered = $selectedJob
      ? interviews.filter(iv => iv.job === $selectedJob.id)
      : interviews;
    buildCalendar(filtered);
  }

  function buildCalendar(source: Interview[]) {
    const events = source.map(iv => ({
      id: String(iv.id),
      title: `${iv.applicant || 'Unknown'} — ${iv.type}`,
      start: formatForCalendar(iv.startTime),
      end: iv.endTime ? formatForCalendar(iv.endTime) : formatForCalendar(iv.startTime),
      location: iv.location || '',
      description: `Location: ${iv.location || 'TBD'}`,
    }));

    const now = new Date();
    const upcoming = source.find(iv => new Date(iv.startTime) >= now);
    const defaultDate = upcoming
      ? formatForCalendar(upcoming.startTime).split(' ')[0]
      : source.length > 0
        ? formatForCalendar(source[0].startTime).split(' ')[0]
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

    userEmail = (await getCurrentUserEmail()) || '';
    if (!userEmail) { loading = false; return; }

    interviews = await getInterviewsByInterviewer(orgId!, userEmail);
    loading = false;
  });
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">My Schedule</h4>
    <p class="subtitle">Your interviews: <strong>{interviews.length}</strong> total</p>

    {#if loading}
      <p class="placeholder">Loading schedule...</p>
    {:else if !calendarApp}
      <p class="placeholder">No interviews found for your account.</p>
    {:else}
      <div class="calendar-wrap">
        <ScheduleXCalendar {calendarApp} />
      </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={2} collapse="uncollapse" />
</div>

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .subtitle {
    font-size: 13px;
    color: $light-tertiary;
    margin-bottom: 15px;
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
</style>
