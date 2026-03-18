<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase, isPlatformAdmin } from '$lib/utils/supabase';
  import {
    getActiveRoles, getAllApplicants, getInterviewerAvailability,
    getInterviewsByOrg, bulkCreateInterviews, clearAutoScheduledInterviews,
    upsertSchedulingConfig, getSchedulingConfig, getOrgMembersWithEmail
  } from '$lib/utils/supabase';
  import { algorithms, getAlgorithm } from '$lib/scheduling/registry';
  import type { SchedulerInput, SchedulerOutput, TimeRange, BatchRound, BatchSessionWindow, AttributeMatchRule } from '$lib/scheduling/types';
  import type { Organization, JobPosting, Interview, Applicant, OrgMember } from '$lib/types';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import EmailGeneratorModal from '$lib/components/recruiter/EmailGeneratorModal.svelte';

  let org: Organization | null = null;
  let userRole = '';
  let loading = true;

  // Scheduling state
  let schedJobId: number | null = null;
  let schedJobs: JobPosting[] = [];
  let schedAlgorithmId = 'batch-scheduler';
  let schedConfig: Record<string, unknown> = {
    slotDurationMinutes: 30,
    breakBetweenMinutes: 10,
    maxInterviewsPerInterviewer: 0,
    interviewType: 'individual',
    location: ''
  };
  let schedPreview: SchedulerOutput | null = null;
  let schedPreviewing = false;
  let schedApplying = false;
  let schedClearing = false;
  let schedError = '';
  let schedSuccess = '';

  // Email modal state
  let showSchedEmailModal = false;
  let schedEmailInterviews: Interview[] = [];
  let schedEmailApplicants: Applicant[] = [];
  let schedEmailOrgMembers: (OrgMember & { email: string })[] = [];
  let schedEmailJobs: JobPosting[] = [];
  let schedEmailLoading = false;

  // Batch scheduler config state
  let batchRoomsText = '';
  let batchRounds: BatchRound[] = [
    { id: 'r1', label: 'Individual Interview', type: 'individual', durationMinutes: 20, breakBeforeMinutes: 0, groupSize: 1, interviewersPerRoom: 1 }
  ];
  let batchSessions: BatchSessionWindow[] = [];
  let newSessionDate = '';
  let newSessionStart = '09:00';
  let newSessionEnd = '17:00';
  let batchSlotStep = 15;
  let batchBlockBreak = 5;
  let batchRequireAll = false;
  let batchRelaxedFallback = false;
  let batchRelaxedPenalty = 10;
  let batchAttrEnabled = false;
  let batchAttrRules: AttributeMatchRule[] = [];
  let newRuleQId = '';
  let newRuleAttrKey = '';
  let newRuleWeight = 20;
  let newRuleHard = false;

  $: slug = $page.params.slug;
  $: isAdmin = userRole === 'admin' || userRole === 'owner';

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!orgData) { loading = false; return; }
    org = orgData;

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (memberData) {
        userRole = memberData.role;
      } else {
        const platformAdmin = await isPlatformAdmin();
        if (platformAdmin) userRole = 'owner';
      }
    }

    // Load jobs and existing scheduling config
    if (org) {
      try {
        schedJobs = await getActiveRoles(org.id);
        const existing = await getSchedulingConfig(org.id);
        if (existing) {
          schedAlgorithmId = existing.algorithm_id;
          schedConfig = { ...schedConfig, ...(existing.config as Record<string, unknown>) };
        }
      } catch (e: any) {
        console.error('Error loading scheduling data:', e);
      }
    }

    loading = false;
  });

  function parseApplicantAvailability(recruitInfo: Record<string, string> | null): TimeRange[] {
    if (!recruitInfo) return [];
    for (const [key, value] of Object.entries(recruitInfo)) {
      if (key.toLowerCase().includes('availability') || key.toLowerCase().includes('avail')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed as TimeRange[];
          if (parsed?.ranges && Array.isArray(parsed.ranges)) return parsed.ranges as TimeRange[];
        } catch { /* not JSON, skip */ }
      }
    }
    return [];
  }

  function extractApplicantAttributes(
    recruitInfo: Record<string, string>,
    rules: AttributeMatchRule[]
  ): Record<string, string | string[]> {
    const attrs: Record<string, string | string[]> = {};
    for (const rule of rules) {
      const val = recruitInfo[rule.applicantQuestionId];
      if (val) {
        attrs[rule.applicantQuestionId] = val.includes(',')
          ? val.split(',').map((v: string) => v.trim()).filter(Boolean)
          : val.trim();
      }
    }
    return attrs;
  }

  async function runPreview() {
    if (!org) return;
    schedPreviewing = true;
    schedError = '';
    schedSuccess = '';
    schedPreview = null;

    try {
      const allApplicants = await getAllApplicants(org.id);
      const filtered = schedJobId
        ? allApplicants.filter(a => a.job === schedJobId)
        : allApplicants;

      const activeAttrRules = batchAttrEnabled && schedAlgorithmId === 'batch-scheduler' ? batchAttrRules : [];

      const schedulerApplicants = filtered.map(a => ({
        email: a.email,
        name: a.name,
        jobId: a.job || 0,
        availability: parseApplicantAvailability(a.recruitInfo),
        priority: typeof a.metadata?.priority === 'number' ? (a.metadata.priority as number) : 0,
        attributes: a.recruitInfo && activeAttrRules.length > 0
          ? extractApplicantAttributes(a.recruitInfo, activeAttrRules)
          : undefined
      }));

      const [iaRows, orgMembersForSched] = await Promise.all([
        getInterviewerAvailability(org.id),
        getOrgMembersWithEmail(org.id)
      ]);
      const memberMetaMap = new Map(orgMembersForSched.map(m => [m.email, (m as any).metadata as Record<string, unknown> || {}]));

      const interviewerMap = new Map<string, TimeRange[]>();
      for (const row of iaRows) {
        const ranges = interviewerMap.get(row.email) || [];
        ranges.push({
          date: row.date,
          start: row.start_time.substring(0, 5),
          end: row.end_time.substring(0, 5)
        });
        interviewerMap.set(row.email, ranges);
      }
      const schedulerInterviewers = Array.from(interviewerMap.entries()).map(([email, availability]) => ({
        email,
        availability,
        attributes: activeAttrRules.length > 0
          ? (memberMetaMap.get(email) as Record<string, string | string[]> | undefined)
          : undefined
      }));

      const existingInterviews = await getInterviewsByOrg(org.id);
      const existingForScheduler = existingInterviews.map(iv => ({
        startTime: iv.startTime,
        endTime: iv.endTime || iv.startTime,
        interviewer: iv.interviewer || '',
        applicant: iv.applicant || ''
      }));

      const algorithm = getAlgorithm(schedAlgorithmId);
      if (!algorithm) {
        schedError = 'Algorithm not found.';
        schedPreviewing = false;
        return;
      }

      const config = schedAlgorithmId === 'batch-scheduler'
        ? {
            rooms: batchRoomsText.split('\n').map(r => r.trim()).filter(Boolean),
            rounds: batchRounds,
            sessionWindows: batchSessions,
            slotStepMinutes: batchSlotStep,
            blockBreakMinutes: batchBlockBreak,
            requireAllRounds: batchRequireAll,
            relaxedFallback: batchRelaxedFallback,
            relaxedAvailabilityPenalty: batchRelaxedPenalty,
            attributeMatching: { enabled: batchAttrEnabled, rules: batchAttrRules },
            slotDurationMinutes: 0,
            breakBetweenMinutes: 0,
            maxInterviewsPerInterviewer: 0,
            interviewType: 'individual' as const,
            location: ''
          }
        : {
            slotDurationMinutes: Number(schedConfig.slotDurationMinutes) || 30,
            breakBetweenMinutes: Number(schedConfig.breakBetweenMinutes) || 10,
            maxInterviewsPerInterviewer: Number(schedConfig.maxInterviewsPerInterviewer) || 0,
            interviewType: (schedConfig.interviewType as 'individual' | 'group') || 'individual',
            location: String(schedConfig.location || ''),
            ...schedConfig
          };

      const input: SchedulerInput = {
        applicants: schedulerApplicants,
        interviewers: schedulerInterviewers,
        existingInterviews: existingForScheduler,
        config
      };

      schedPreview = algorithm.run(input);
    } catch (e: any) {
      schedError = e.message || 'Preview failed.';
    }
    schedPreviewing = false;
  }

  async function applySchedule() {
    if (!org || !schedPreview || schedPreview.interviews.length === 0) return;
    schedApplying = true;
    schedError = '';
    schedSuccess = '';

    try {
      const rows = schedPreview.interviews.map(iv => ({
        startTime: iv.startTime,
        endTime: iv.endTime,
        location: iv.location,
        type: iv.type,
        job: iv.jobId,
        applicant: iv.applicant,
        interviewer: iv.interviewer,
        org_id: org!.id,
        source: 'auto',
        violations: iv.violations && iv.violations.length > 0 ? iv.violations : null
      }));

      await bulkCreateInterviews(rows);
      await upsertSchedulingConfig(org!.id, schedAlgorithmId, schedConfig, schedJobId || undefined);

      schedSuccess = `Created ${rows.length} interviews successfully. You can now send notification emails.`;

      // Prepare email modal data
      schedEmailInterviews = rows.map((r, i) => ({
        id: i,
        created_at: new Date().toISOString(),
        startTime: r.startTime,
        endTime: r.endTime,
        location: r.location,
        type: r.type as 'individual' | 'group',
        comments: null,
        job: r.job,
        applicant: r.applicant,
        interviewer: r.interviewer,
        org_id: r.org_id,
        source: 'auto',
        violations: r.violations as Interview['violations']
      }));
      schedEmailApplicants = await getAllApplicants(org!.id);
      schedEmailOrgMembers = await getOrgMembersWithEmail(org!.id);
      schedEmailJobs = schedJobs;

      schedPreview = null;
    } catch (e: any) {
      schedError = e.message || 'Failed to apply schedule.';
    }
    schedApplying = false;
  }

  async function openEmailModal() {
    if (!org) return;
    schedEmailLoading = true;
    try {
      schedEmailInterviews = await getInterviewsByOrg(org.id);
      schedEmailApplicants = await getAllApplicants(org.id);
      schedEmailOrgMembers = await getOrgMembersWithEmail(org.id);
      schedEmailJobs = await getActiveRoles(org.id);
      showSchedEmailModal = true;
    } catch (e: any) {
      schedError = e.message || 'Failed to load email data.';
    }
    schedEmailLoading = false;
  }

  async function clearAutoInterviews() {
    if (!org) return;
    if (!confirm('Delete all auto-scheduled interviews for this org/job? This cannot be undone.')) return;
    schedClearing = true;
    schedError = '';
    schedSuccess = '';

    try {
      await clearAutoScheduledInterviews(org.id, schedJobId || undefined);
      schedSuccess = 'Auto-scheduled interviews cleared.';
    } catch (e: any) {
      schedError = e.message || 'Failed to clear interviews.';
    }
    schedClearing = false;
  }

  // Batch scheduling helpers
  function addRound() {
    const nextId = `r${batchRounds.length + 1}`;
    batchRounds = [...batchRounds, { id: nextId, label: 'New Round', type: 'individual', durationMinutes: 20, breakBeforeMinutes: 5, groupSize: 1, interviewersPerRoom: 1 }];
  }
  function removeRound(i: number) { batchRounds = batchRounds.filter((_, idx) => idx !== i); }
  function addSession() {
    if (!newSessionDate || !newSessionStart || !newSessionEnd) return;
    batchSessions = [...batchSessions, { date: newSessionDate, startTime: newSessionStart, endTime: newSessionEnd }];
    newSessionDate = '';
  }
  function removeSession(i: number) { batchSessions = batchSessions.filter((_, idx) => idx !== i); }
  function addAttrRule() {
    if (!newRuleQId.trim() || !newRuleAttrKey.trim()) return;
    batchAttrRules = [...batchAttrRules, {
      applicantQuestionId: newRuleQId.trim(),
      interviewerAttributeKey: newRuleAttrKey.trim(),
      weight: newRuleWeight,
      hard: newRuleHard
    }];
    newRuleQId = ''; newRuleAttrKey = ''; newRuleWeight = 20; newRuleHard = false;
  }
  function removeAttrRule(i: number) { batchAttrRules = batchAttrRules.filter((_, idx) => idx !== i); }
</script>

<div class="layout">
  <div class="content-left">
    {#if loading}
      <h4>Loading...</h4>
    {:else if !isAdmin}
      <h4>Auto-Scheduling</h4>
      <p class="muted">You need admin or owner access to use auto-scheduling.</p>
    {:else}
      <div class="page-header">
        <h4>Auto-Scheduling</h4>
        <a href="/private/{slug}/settings" class="btn btn-quaternary" style="font-size: 11px; padding: 4px 12px;">
          <i class="fi fi-br-arrow-left" style="font-size: 10px; margin-right: 4px;"></i> Back to Settings
        </a>
      </div>

      <!-- Job filter -->
      <div class="form-card">
        <div class="form-row">
          <label>Job Posting (optional — leave blank for all)</label>
          <select class="form-select" bind:value={schedJobId}>
            <option value={null}>All jobs</option>
            {#each schedJobs as job}
              <option value={job.id}>{job.name}</option>
            {/each}
          </select>
        </div>

        <!-- Algorithm picker -->
        <div class="form-row">
          <label>Algorithm</label>
          <div class="algo-cards">
            {#each algorithms as algo}
              <button
                class="algo-card"
                class:algo-selected={schedAlgorithmId === algo.id}
                on:click={() => schedAlgorithmId = algo.id}
              >
                <span class="algo-name">{algo.name}</span>
                <span class="algo-desc">{algo.description}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Config form — batch scheduler -->
      {#if schedAlgorithmId === 'batch-scheduler'}
        <div class="form-card">
          <h6>Batch Scheduler Configuration</h6>

          <!-- Rooms -->
          <div class="form-row">
            <label>Rooms (one per line)</label>
            <textarea class="form-control" bind:value={batchRoomsText} rows="4"
              placeholder="MCB230&#10;MCB231&#10;MCB232"></textarea>
            <span class="form-hint">{batchRoomsText.split('\n').filter(r => r.trim()).length} room(s) configured</span>
          </div>

          <!-- Session windows -->
          <div class="form-row">
            <label>Session Windows</label>
            {#each batchSessions as session, i}
              <div class="session-row">
                <span class="row-name">{session.date}</span>
                <span class="row-sub">{session.startTime} – {session.endTime}</span>
                <button class="btn btn-danger btn-sm" on:click={() => removeSession(i)}>×</button>
              </div>
            {/each}
            {#if batchSessions.length === 0}
              <p class="muted" style="font-size: 12px; margin: 4px 0 8px;">No sessions added yet.</p>
            {/if}
            <div class="add-session-form">
              <input type="date" class="form-control" bind:value={newSessionDate} style="max-width: 160px;" />
              <input type="time" class="form-control" bind:value={newSessionStart} style="max-width: 110px;" />
              <span class="muted" style="font-size: 12px;">to</span>
              <input type="time" class="form-control" bind:value={newSessionEnd} style="max-width: 110px;" />
              <button class="btn btn-primary btn-sm" on:click={addSession}>Add</button>
            </div>
          </div>

          <!-- Rounds -->
          <div class="form-row">
            <label>Rounds</label>
            {#each batchRounds as round, i}
              <div class="round-card">
                <div class="round-header">
                  <input class="form-control" bind:value={round.label} placeholder="Round label" style="max-width: 220px;" />
                  <select class="form-select" bind:value={round.type} style="max-width: 140px;">
                    <option value="individual">Individual</option>
                    <option value="group">Group</option>
                  </select>
                  {#if batchRounds.length > 1}
                    <button class="btn btn-danger btn-sm" on:click={() => removeRound(i)}>Remove</button>
                  {/if}
                </div>
                <div class="round-fields">
                  <div>
                    <label class="field-label">Duration (min)</label>
                    <input type="number" class="form-control" bind:value={round.durationMinutes} min="5" style="max-width: 90px;" />
                  </div>
                  <div>
                    <label class="field-label">Break before (min)</label>
                    <input type="number" class="form-control" bind:value={round.breakBeforeMinutes} min="0" style="max-width: 90px;" />
                  </div>
                  {#if round.type === 'group'}
                    <div>
                      <label class="field-label">Applicants/room</label>
                      <input type="number" class="form-control" bind:value={round.groupSize} min="2" style="max-width: 90px;" />
                    </div>
                    <div>
                      <label class="field-label">Interviewers/room</label>
                      <input type="number" class="form-control" bind:value={round.interviewersPerRoom} min="1" style="max-width: 90px;" />
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
            <button class="btn btn-quaternary btn-sm" on:click={addRound} style="margin-top: 8px;">+ Add Round</button>
          </div>

          <!-- Batch options -->
          <div class="config-grid">
            <div class="form-row">
              <label>Slot step (minutes)</label>
              <input type="number" class="form-control" bind:value={batchSlotStep} min="5" max="60" />
            </div>
            <div class="form-row">
              <label>Break between slots (minutes)</label>
              <input type="number" class="form-control" bind:value={batchBlockBreak} min="0" />
            </div>
            <div class="form-row" style="grid-column: span 2;">
              <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: var(--light-tertiary, #9ca3af);">
                <input type="checkbox" bind:checked={batchRequireAll} style="width: 16px; height: 16px; margin-right: 6px;" />
                Require all rounds (remove assignments for applicants missing any round)
              </label>
            </div>
            <div class="form-row" style="grid-column: span 2;">
              <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: var(--light-tertiary, #9ca3af);">
                <input type="checkbox" bind:checked={batchRelaxedFallback} style="width: 16px; height: 16px; margin-right: 6px;" />
                Relaxed fallback — schedule unmatched applicants with flagged violations
              </label>
              <p class="form-hint" style="margin-top: 4px;">
                A second pass places applicants who couldn't be strictly scheduled, even outside their stated availability. These are saved with a violation flag for human review.
              </p>
            </div>
            {#if batchRelaxedFallback}
              <div class="form-row">
                <label>Availability penalty weight</label>
                <input type="number" class="form-control" bind:value={batchRelaxedPenalty} min="1" max="100" style="max-width: 90px;" />
                <span class="form-hint">Higher = stronger preference for slots within stated availability</span>
              </div>
            {/if}
          </div>

          <!-- Attribute matching -->
          <div class="form-row" style="margin-top: 8px;">
            <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: var(--light-tertiary, #9ca3af);">
              <input type="checkbox" bind:checked={batchAttrEnabled} style="width: 16px; height: 16px; margin-right: 6px;" />
              Attribute-based matching — pair applicants with interviewers by shared attributes
            </label>
            <p class="form-hint" style="margin-top: 4px;">
              Maps applicant answers (by question ID in recruitInfo) to interviewer attributes (by key in member metadata). Set member attributes in Settings &rarr; Team Members.
            </p>
          </div>

          {#if batchAttrEnabled}
            <div class="form-row">
              <label>Matching Rules</label>
              {#each batchAttrRules as rule, i}
                <div class="attr-rule-row">
                  <span class="rule-pill">
                    <span class="rule-qid">{rule.applicantQuestionId}</span>
                    <i class="fi fi-br-arrow-right" style="font-size: 10px; color: #9ca3af;"></i>
                    <span class="rule-attr">{rule.interviewerAttributeKey}</span>
                    <span class="rule-weight">+{rule.weight}</span>
                    {#if rule.hard}<span class="rule-hard">hard</span>{/if}
                  </span>
                  <button class="btn-icon-sm" on:click={() => removeAttrRule(i)} title="Remove rule">×</button>
                </div>
              {/each}
              {#if batchAttrRules.length === 0}
                <p class="muted" style="font-size: 12px; margin: 4px 0 8px;">No rules. Add one below.</p>
              {/if}
              <div class="attr-rule-add">
                <input class="form-control" bind:value={newRuleQId} placeholder="Applicant question ID (e.g. team_interest)" style="flex: 1;" />
                <i class="fi fi-br-arrow-right" style="font-size: 11px; color: #9ca3af; flex-shrink: 0;"></i>
                <input class="form-control" bind:value={newRuleAttrKey} placeholder="Member attribute key (e.g. teams)" style="flex: 1;" />
                <input type="number" class="form-control" bind:value={newRuleWeight} min="1" max="100" placeholder="Wt" style="max-width: 60px;" title="Score bonus for a match" />
                <label class="toggle-label" style="font-size: 11px; white-space: nowrap; gap: 4px;">
                  <input type="checkbox" bind:checked={newRuleHard} style="width: 14px; height: 14px;" /> Hard
                </label>
                <button class="btn btn-quaternary btn-sm" on:click={addAttrRule}>Add</button>
              </div>
              <p class="form-hint">Hard rules restrict to matching interviewers only (fallback if none). Soft rules add score bonus.</p>
            </div>
          {/if}
        </div>

      <!-- Config form — simple algorithms -->
      {:else}
        <div class="form-card">
          <h6>Algorithm Configuration</h6>
          <div class="config-grid">
            <div class="form-row">
              <label>Slot Duration (minutes)</label>
              <input type="number" class="form-control" bind:value={schedConfig.slotDurationMinutes} min="10" max="180" />
            </div>
            <div class="form-row">
              <label>Break Between (minutes)</label>
              <input type="number" class="form-control" bind:value={schedConfig.breakBetweenMinutes} min="0" max="60" />
            </div>
            <div class="form-row">
              <label>Max Interviews per Interviewer (0 = unlimited)</label>
              <input type="number" class="form-control" bind:value={schedConfig.maxInterviewsPerInterviewer} min="0" />
            </div>
            <div class="form-row">
              <label>Interview Type</label>
              <select class="form-select" bind:value={schedConfig.interviewType}>
                <option value="individual">Individual</option>
                <option value="group">Group</option>
              </select>
            </div>
            <div class="form-row">
              <label>Location</label>
              <input class="form-control" bind:value={schedConfig.location} placeholder="e.g. Room 101, Zoom, etc." />
            </div>
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="sched-actions">
        <button class="btn btn-primary" on:click={runPreview} disabled={schedPreviewing}>
          {schedPreviewing ? 'Running...' : 'Preview Schedule'}
        </button>
        {#if schedPreview && schedPreview.interviews.length > 0}
          <button class="btn btn-primary" on:click={applySchedule} disabled={schedApplying}>
            {schedApplying ? 'Applying...' : `Apply ${schedPreview.interviews.length} Interviews`}
          </button>
        {/if}
        <button class="btn btn-primary" on:click={openEmailModal} disabled={schedEmailLoading}>
          <i class="fi fi-br-paper-plane"></i> {schedEmailLoading ? 'Loading...' : 'Send Emails'}
        </button>
        <button class="btn btn-danger btn-sm" on:click={clearAutoInterviews} disabled={schedClearing}>
          {schedClearing ? 'Clearing...' : 'Clear Auto-Scheduled'}
        </button>
      </div>

      {#if schedError}<p class="error-text">{schedError}</p>{/if}
      {#if schedSuccess}<div class="alert-success">{schedSuccess}</div>{/if}

      <!-- Preview Results -->
      {#if schedPreview}
        <div class="form-card" style="margin-top: 16px;">
          <h6>Preview Results</h6>

          {#if schedPreview.warnings.length > 0}
            <div class="alert-error" style="margin-bottom: 12px;">
              {#each schedPreview.warnings as w}
                <p style="margin: 2px 0;">{w}</p>
              {/each}
            </div>
          {/if}

          {#if schedPreview.relaxedCount && schedPreview.relaxedCount > 0}
            <div class="alert-warn" style="margin-bottom: 12px;">
              <i class="fi fi-br-triangle-warning"></i>
              {schedPreview.relaxedCount} interview(s) placed via relaxed constraints — flagged for review. Confirm or adjust before applying.
            </div>
          {/if}

          {#if schedPreview.interviews.length > 0}
            <div class="preview-table">
              <div class="table-header sched-table-header">
                <span>Applicant</span>
                <span>Interviewer</span>
                <span>Date</span>
                <span>Time</span>
                <span>Location</span>
                <span>Flags</span>
              </div>
              {#each schedPreview.interviews as iv}
                <div class="table-row sched-table-row" class:sched-row-flagged={iv.violations && iv.violations.length > 0}>
                  <span class="row-name">{iv.applicant}</span>
                  <span class="row-name">{iv.interviewer}</span>
                  <span class="row-sub">{iv.startTime.substring(0, 10)}</span>
                  <span class="row-sub">{iv.startTime.substring(11, 16)} - {iv.endTime.substring(11, 16)}</span>
                  <span class="row-sub">{iv.location || '-'}</span>
                  <span>
                    {#if iv.violations && iv.violations.length > 0}
                      <span class="violation-chip" title={iv.violations.map(v => v.detail).join('; ')}>
                        {iv.violations.map(v => v.type === 'availability' ? 'avail' : 'attr').join(', ')}
                      </span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
            <p class="muted" style="margin-top: 8px; font-size: 12px;">{schedPreview.interviews.length} interviews proposed</p>
          {:else}
            <p class="muted">No interviews could be scheduled.</p>
          {/if}

          <!-- Per-round stats (batch scheduler) -->
          {#if schedPreview.stats && schedPreview.stats.length > 0}
            <h6 style="margin-top: 16px;">Results by Round</h6>
            <div class="round-stats-table">
              <div class="rst-header">
                <span>Round</span><span>Scheduled</span><span>Relaxed</span><span>Missed</span><span>Slots Used</span>
              </div>
              {#each schedPreview.stats as stat}
                <div class="rst-row">
                  <span class="row-name">{stat.roundLabel}</span>
                  <span style="color: #065f46; font-weight: 600;">{stat.scheduled}</span>
                  <span style="color: {stat.relaxedCount > 0 ? '#92400e' : '#6b7280'}; font-weight: 600;">{stat.relaxedCount}</span>
                  <span style="color: {stat.missed > 0 ? '#991b1b' : '#065f46'}; font-weight: 600;">{stat.missed}</span>
                  <span class="row-sub">{stat.filledSlots}/{stat.totalSlots}</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Unmatched applicants with suggestions (batch) -->
          {#if schedPreview.unmatchedDetails && schedPreview.unmatchedDetails.length > 0}
            <h6 style="margin-top: 16px;">
              Unmatched Applicants
              <span style="font-weight: 400; font-size: 12px; color: #6b7280;">({schedPreview.unmatchedDetails.length}) — suggested slots shown for manual placement</span>
            </h6>
            {#each schedPreview.unmatchedDetails as u}
              <div class="unmatched-row">
                <div class="unmatched-info">
                  <span class="row-name">{u.name}</span>
                  <span class="row-sub">{u.email}</span>
                  <span class="row-sub" style="color: #991b1b;">Missed: {u.missedRounds.join(', ')}</span>
                </div>
                <div class="suggested-slots">
                  {#each u.suggestedSlots.slice(0, 4) as slot}
                    <span class="slot-chip" class:slot-full={slot.isFull}>
                      {slot.roundId}: {slot.date} {slot.startTime}–{slot.endTime} @ {slot.room}{slot.isFull ? ' full' : ''}
                    </span>
                  {/each}
                  {#if u.suggestedSlots.length === 0}
                    <span class="row-sub" style="color: #991b1b;">No available slots match their availability.</span>
                  {:else if u.suggestedSlots.length > 4}
                    <span class="row-sub">+{u.suggestedSlots.length - 4} more options</span>
                  {/if}
                </div>
              </div>
            {/each}

          <!-- Unmatched fallback for simple algorithms -->
          {:else if schedPreview.unmatched.length > 0}
            <h6 style="margin-top: 16px;">Unmatched Applicants ({schedPreview.unmatched.length})</h6>
            <div style="font-size: 13px; color: #991b1b;">
              {#each schedPreview.unmatched as email}
                <p style="margin: 2px 0;">{email}</p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={6} />
</div>

{#if showSchedEmailModal && org}
  <EmailGeneratorModal
    interviews={schedEmailInterviews}
    applicants={schedEmailApplicants}
    orgMembers={schedEmailOrgMembers}
    jobs={schedEmailJobs}
    orgName={org.name}
    orgId={org.id}
    slug={slug}
    onClose={() => showSchedEmailModal = false}
  />
{/if}

<style lang="scss">
  @use '../../../../../styles/col.scss' as *;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .muted { color: $light-tertiary; }
  .error-text { color: #ef4444; font-size: 13px; margin: 4px 0; }

  .alert-success {
    background-color: #ecfdf5;
    color: #065f46;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    margin: 8px 0;
  }
  .alert-error {
    background-color: #fef2f2;
    color: #991b1b;
    padding: 14px 18px;
    border-radius: 8px;
    font-size: 13px;
    margin: 8px 0;
    border: 1px solid #fecaca;
  }
  .alert-warn {
    background-color: #fffbeb;
    color: #92400e;
    border: 1px solid #fde68a;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-card {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.06);
    margin-bottom: 16px;
    h6 { margin-bottom: 14px; }
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .form-hint {
    font-size: 11px;
    color: $light-tertiary;
    margin-top: 4px;
    display: block;
  }
  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: $light-tertiary;
    margin-bottom: 3px;
    white-space: nowrap;
  }

  .algo-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 6px;
  }
  .algo-card {
    display: flex;
    flex-direction: column;
    padding: 14px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
    &:hover { border-color: #ffc800; }
  }
  .algo-selected {
    border-color: #ffc800 !important;
    background-color: rgba(255, 200, 0, 0.05);
  }
  .algo-name {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 4px;
  }
  .algo-desc {
    font-size: 11px;
    color: $light-tertiary;
    line-height: 1.4;
  }

  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    margin-top: 8px;
  }

  .sched-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 16px 0;
    flex-wrap: wrap;
  }

  .btn-sm { font-size: 11px !important; padding: 4px 10px !important; }
  .btn-danger {
    background-color: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;
    &:hover { background-color: #dc2626; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .toggle-label {
    display: flex; align-items: center; gap: 10px; cursor: pointer;
    input[type="checkbox"] { width: 18px; height: 18px; accent-color: $yellow-primary; }
  }

  .session-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background-color: $light-secondary;
    border-radius: 6px;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .add-session-form {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .round-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 10px;
    background-color: #fafbfc;
  }
  .round-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .round-fields {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .row-name { font-weight: 700; font-size: 13px; display: block; }
  .row-sub { font-size: 11px; color: $light-tertiary; font-family: monospace; display: block; }

  .preview-table {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }
  .table-header, .table-row {
    display: grid;
    align-items: center;
    padding: 10px 16px;
    gap: 8px;
  }
  .table-header {
    font-size: 11px; font-weight: 700; color: $light-tertiary;
    text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb; background-color: #fafbfc;
  }
  .table-row {
    border-bottom: 1px solid #f0f0f0; font-size: 13px;
    &:last-child { border-bottom: none; }
  }
  .sched-table-header, .sched-table-row {
    grid-template-columns: 2fr 2fr 1fr 1fr 1fr 1fr !important;
  }
  .sched-row-flagged {
    background-color: #fffbeb !important;
  }
  .violation-chip {
    display: inline-block;
    padding: 2px 7px;
    background-color: #fef3c7;
    color: #92400e;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    cursor: help;
  }

  .round-stats-table {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    margin-bottom: 12px;
  }
  .rst-header, .rst-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
    padding: 8px 14px;
    gap: 8px;
    align-items: center;
    font-size: 13px;
  }
  .rst-header {
    font-size: 11px; font-weight: 700; color: $light-tertiary;
    text-transform: uppercase; letter-spacing: 0.5px;
    background-color: #fafbfc;
    border-bottom: 1px solid #e5e7eb;
  }
  .rst-row {
    border-bottom: 1px solid #f0f0f0;
    &:last-child { border-bottom: none; }
  }

  .unmatched-row {
    display: flex;
    gap: 16px;
    padding: 10px 14px;
    background-color: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .unmatched-info { min-width: 180px; }
  .suggested-slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }
  .slot-chip {
    display: inline-block;
    padding: 3px 8px;
    background-color: #ecfdf5;
    color: #065f46;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: monospace;
    white-space: nowrap;
  }
  .slot-full {
    background-color: #fef3c7 !important;
    color: #92400e !important;
  }

  .attr-rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .rule-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: $light-secondary;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    flex: 1;
  }
  .rule-qid { color: #1e40af; font-weight: 600; }
  .rule-attr { color: #065f46; font-weight: 600; }
  .rule-weight { color: $light-tertiary; font-size: 11px; }
  .rule-hard {
    background-color: #fef3c7;
    color: #92400e;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 8px;
  }
  .attr-rule-add {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .btn-icon-sm {
    background: none;
    border: none;
    font-size: 16px;
    color: $light-tertiary;
    cursor: pointer;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    &:hover { color: #ef4444; background-color: #fef2f2; }
  }
</style>
