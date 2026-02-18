<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase, getMyInterviewerAvailability, saveInterviewerAvailability } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import AvailabilityGrid from '$lib/components/applicant/AvailabilityGrid.svelte';

  let orgId: number | null = null;
  let loading = true;
  let saving = false;
  let saveSuccess = '';
  let saveError = '';
  let initialRanges: { date: string; start: string; end: string }[] = [];
  let gridRef: AvailabilityGrid;

  $: slug = $page.params.slug;

  // Compute next Sunday through Saturday for a fixed week view
  function getNextWeekDates(): { start: Date; end: Date } {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    // Start from next Sunday (or today if Sunday)
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + daysUntilSunday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  const weekDates = getNextWeekDates();

  function fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const startDate = fmt(weekDates.start);
  const endDate = fmt(weekDates.end);

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!orgData) { loading = false; return; }
    orgId = orgData.id;

    // Load existing availability and convert to grid ranges
    const rows = await getMyInterviewerAvailability(orgId!);
    initialRanges = rows.map(r => ({
      date: r.date,
      start: r.start_time.substring(0, 5), // HH:mm:ss -> HH:mm
      end: r.end_time.substring(0, 5)
    }));

    loading = false;
  });

  async function handleSave() {
    if (!orgId || !gridRef) return;
    saving = true;
    saveSuccess = '';
    saveError = '';

    try {
      const supabaseRows = gridRef.toSupabaseRows();
      await saveInterviewerAvailability(orgId, supabaseRows);
      saveSuccess = 'Availability saved successfully.';
    } catch (e: any) {
      saveError = e.message || 'Failed to save availability.';
    }
    saving = false;
  }
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">My Availability</h4>
    <p class="subtitle">
      Set your weekly availability for interviews. Select the time slots when you're free.
    </p>

    {#if loading}
      <p class="placeholder">Loading availability...</p>
    {:else}
      <AvailabilityGrid
        bind:this={gridRef}
        {startDate}
        {endDate}
        dayStart="08:00"
        dayEnd="20:00"
        stepMinutes={30}
        {initialRanges}
      />

      <div class="save-bar">
        <button class="btn btn-primary" on:click={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Availability'}
        </button>
        {#if saveSuccess}
          <span class="success-msg">{saveSuccess}</span>
        {/if}
        {#if saveError}
          <span class="error-msg">{saveError}</span>
        {/if}
      </div>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={7} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .subtitle {
    font-size: 13px;
    color: $light-tertiary;
    margin-bottom: 15px;
  }
  .placeholder {
    color: $light-tertiary;
    padding: 20px;
  }
  .save-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }
  .success-msg {
    color: #065f46;
    font-size: 13px;
    font-weight: 600;
  }
  .error-msg {
    color: #ef4444;
    font-size: 13px;
    font-weight: 600;
  }
</style>
