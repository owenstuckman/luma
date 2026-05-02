<script lang="ts">
  import {
    getActiveRoles, getAllApplicants, getInterviewerAvailability, getInterviewsByOrg,
    bulkCreateInterviews, clearAutoScheduledInterviews, upsertSchedulingConfig,
    getSchedulingConfig, getOrgMembersWithEmail
  } from '$lib/utils/supabase';
  import { algorithms, getAlgorithm } from '$lib/scheduling/registry';
  import type { SchedulerInput, SchedulerOutput, TimeRange, BatchRound, BatchSessionWindow, AttributeMatchRule } from '$lib/scheduling/types';
  import type { Organization, JobPosting, Interview, Applicant, OrgMember } from '$lib/types';

  interface EmailModalPayload {
    interviews: Interview[];
    applicants: Applicant[];
    orgMembers: (OrgMember & { email: string })[];
    jobs: JobPosting[];
    orgName: string;
    orgId: number;
    slug: string;
  }

  let { organizations, onOpenEmailModal = () => {} }: {
    organizations: (Organization & { member_count?: number; applicant_count?: number })[];
    onOpenEmailModal?: (data: EmailModalPayload) => void;
  } = $props();

  let schedOrgId = $state<number | null>(null);
  let schedJobId = $state<number | null>(null);
  let schedJobs = $state<JobPosting[]>([]);
  let schedAlgorithmId = $state('batch-scheduler');
  let schedConfig = $state<Record<string, unknown>>({
    slotDurationMinutes: 30, breakBetweenMinutes: 10,
    maxInterviewsPerInterviewer: 0, interviewType: 'individual', location: ''
  });
  let schedPreview = $state<SchedulerOutput | null>(null);
  let schedPreviewing = $state(false);
  let schedApplying = $state(false);
  let schedClearing = $state(false);
  let schedError = $state('');
  let schedSuccess = $state('');
  let schedEmailLoading = $state(false);

  let batchRoomsText = $state('MCB230\nMCB231\nMCB232');
  let batchRounds = $state<BatchRound[]>([
    { id: 'r1', label: 'Individual Interview', type: 'individual', durationMinutes: 20, breakBeforeMinutes: 0, groupSize: 1, interviewersPerRoom: 1 }
  ]);
  let batchSessions = $state<BatchSessionWindow[]>([]);
  let newSessionDate = $state('');
  let newSessionStart = $state('09:00');
  let newSessionEnd = $state('17:00');
  let batchSlotStep = $state(15);
  let batchBlockBreak = $state(5);
  let batchRequireAll = $state(false);
  let batchRelaxedFallback = $state(false);
  let batchRelaxedPenalty = $state(10);
  let batchAttrEnabled = $state(false);
  let batchAttrRules = $state<AttributeMatchRule[]>([]);
  let newRuleQId = $state('');
  let newRuleAttrKey = $state('');
  let newRuleWeight = $state(20);
  let newRuleHard = $state(false);

  async function onSchedOrgChange() {
    schedJobs = []; schedJobId = null; schedPreview = null; schedError = ''; schedSuccess = '';
    if (!schedOrgId) return;
    try {
      schedJobs = await getActiveRoles(schedOrgId);
      const existing = await getSchedulingConfig(schedOrgId);
      if (existing) {
        schedAlgorithmId = existing.algorithm_id;
        schedConfig = { ...schedConfig, ...(existing.config as Record<string, unknown>) };
      }
    } catch (e: any) { console.error('Error loading scheduling data:', e); }
  }

  function parseApplicantAvailability(recruitInfo: Record<string, string> | null): TimeRange[] {
    if (!recruitInfo) return [];
    for (const [key, value] of Object.entries(recruitInfo)) {
      if (key.toLowerCase().includes('availability') || key.toLowerCase().includes('avail')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed as TimeRange[];
          if (parsed?.ranges && Array.isArray(parsed.ranges)) return parsed.ranges as TimeRange[];
        } catch { /* not JSON */ }
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
    if (!schedOrgId) return;
    schedPreviewing = true; schedError = ''; schedSuccess = ''; schedPreview = null;
    try {
      const allApplicants = await getAllApplicants(schedOrgId);
      const filtered = schedJobId ? allApplicants.filter(a => a.job === schedJobId) : allApplicants;
      const activeAttrRules = batchAttrEnabled && schedAlgorithmId === 'batch-scheduler' ? batchAttrRules : [];
      const schedulerApplicants = filtered.map(a => ({
        email: a.email, name: a.name, jobId: a.job || 0,
        availability: parseApplicantAvailability(a.recruitInfo),
        priority: typeof a.metadata?.priority === 'number' ? (a.metadata.priority as number) : 0,
        attributes: a.recruitInfo && activeAttrRules.length > 0
          ? extractApplicantAttributes(a.recruitInfo, activeAttrRules) : undefined
      }));
      const [iaRows, orgMembersForSched] = await Promise.all([
        getInterviewerAvailability(schedOrgId), getOrgMembersWithEmail(schedOrgId)
      ]);
      const memberMetaMap = new Map(orgMembersForSched.map(m => [m.email, (m as any).metadata as Record<string, unknown> || {}]));
      const interviewerMap = new Map<string, TimeRange[]>();
      for (const row of iaRows) {
        const ranges = interviewerMap.get(row.email) || [];
        ranges.push({ date: row.date, start: row.start_time.substring(0, 5), end: row.end_time.substring(0, 5) });
        interviewerMap.set(row.email, ranges);
      }
      const schedulerInterviewers = Array.from(interviewerMap.entries()).map(([email, availability]) => ({
        email, availability,
        attributes: activeAttrRules.length > 0
          ? (memberMetaMap.get(email) as Record<string, string | string[]> | undefined) : undefined
      }));
      const existingInterviews = await getInterviewsByOrg(schedOrgId);
      const existingForScheduler = existingInterviews.map(iv => ({
        startTime: iv.start_time, endTime: iv.end_time || iv.start_time,
        interviewer: iv.interviewer || '', applicant: iv.applicant || ''
      }));
      const algorithm = getAlgorithm(schedAlgorithmId);
      if (!algorithm) { schedError = 'Algorithm not found.'; schedPreviewing = false; return; }
      const config = schedAlgorithmId === 'batch-scheduler'
        ? {
            rooms: batchRoomsText.split('\n').map(r => r.trim()).filter(Boolean),
            rounds: batchRounds, sessionWindows: batchSessions,
            slotStepMinutes: batchSlotStep, blockBreakMinutes: batchBlockBreak,
            requireAllRounds: batchRequireAll, relaxedFallback: batchRelaxedFallback,
            relaxedAvailabilityPenalty: batchRelaxedPenalty,
            attributeMatching: { enabled: batchAttrEnabled, rules: batchAttrRules },
            slotDurationMinutes: 0, breakBetweenMinutes: 0, maxInterviewsPerInterviewer: 0,
            interviewType: 'individual' as const, location: ''
          }
        : {
            slotDurationMinutes: Number(schedConfig.slotDurationMinutes) || 30,
            breakBetweenMinutes: Number(schedConfig.breakBetweenMinutes) || 10,
            maxInterviewsPerInterviewer: Number(schedConfig.maxInterviewsPerInterviewer) || 0,
            interviewType: (schedConfig.interviewType as 'individual' | 'group') || 'individual',
            location: String(schedConfig.location || ''), ...schedConfig
          };
      schedPreview = algorithm.run({ applicants: schedulerApplicants, interviewers: schedulerInterviewers, existingInterviews: existingForScheduler, config } as SchedulerInput);
    } catch (e: any) { schedError = e.message || 'Preview failed.'; }
    schedPreviewing = false;
  }

  async function applySchedule() {
    if (!schedOrgId || !schedPreview || schedPreview.interviews.length === 0) return;
    schedApplying = true; schedError = ''; schedSuccess = '';
    try {
      const rows = schedPreview.interviews.map(iv => ({
        start_time: iv.startTime, end_time: iv.endTime, location: iv.location,
        type: iv.type, job: iv.jobId, applicant: iv.applicant, interviewer: iv.interviewer,
        org_id: schedOrgId!, source: 'auto',
        violations: iv.violations && iv.violations.length > 0 ? iv.violations : null
      }));
      await bulkCreateInterviews(rows);
      await upsertSchedulingConfig(schedOrgId!, schedAlgorithmId, schedConfig, schedJobId || undefined);
      schedSuccess = `Created ${rows.length} interviews successfully. You can now send notification emails.`;
      const org = organizations.find(o => o.id === schedOrgId);
      const emailInterviews = rows.map((r, i) => ({
        id: i, created_at: new Date().toISOString(),
        start_time: r.start_time, end_time: r.end_time, location: r.location,
        type: r.type as 'individual' | 'group', comments: null,
        job: r.job, applicant: r.applicant, interviewer: r.interviewer,
        org_id: r.org_id, source: 'auto',
        violations: r.violations as Interview['violations']
      }));
      const emailApplicants = await getAllApplicants(schedOrgId!);
      const emailOrgMembers = await getOrgMembersWithEmail(schedOrgId!);
      onOpenEmailModal({
        interviews: emailInterviews, applicants: emailApplicants,
        orgMembers: emailOrgMembers, jobs: schedJobs,
        orgName: org?.name ?? '', orgId: schedOrgId!, slug: org?.slug ?? ''
      });
      schedPreview = null;
    } catch (e: any) { schedError = e.message || 'Failed to apply schedule.'; }
    schedApplying = false;
  }

  async function openEmailModal() {
    if (!schedOrgId) return;
    schedEmailLoading = true;
    try {
      const org = organizations.find(o => o.id === schedOrgId);
      const [interviews, applicants, orgMembers, jobs] = await Promise.all([
        getInterviewsByOrg(schedOrgId), getAllApplicants(schedOrgId),
        getOrgMembersWithEmail(schedOrgId), getActiveRoles(schedOrgId)
      ]);
      onOpenEmailModal({
        interviews, applicants, orgMembers, jobs,
        orgName: org?.name ?? '', orgId: schedOrgId!, slug: org?.slug ?? ''
      });
    } catch (e: any) { schedError = e.message || 'Failed to load email data.'; }
    schedEmailLoading = false;
  }

  async function clearAutoInterviews() {
    if (!schedOrgId) return;
    if (!confirm('Delete all auto-scheduled interviews for this org/job? This cannot be undone.')) return;
    schedClearing = true; schedError = ''; schedSuccess = '';
    try {
      await clearAutoScheduledInterviews(schedOrgId, schedJobId || undefined);
      schedSuccess = 'Auto-scheduled interviews cleared.';
    } catch (e: any) { schedError = e.message || 'Failed to clear interviews.'; }
    schedClearing = false;
  }

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
      applicantQuestionId: newRuleQId.trim(), interviewerAttributeKey: newRuleAttrKey.trim(),
      weight: newRuleWeight, hard: newRuleHard
    }];
    newRuleQId = ''; newRuleAttrKey = ''; newRuleWeight = 20; newRuleHard = false;
  }
  function removeAttrRule(i: number) { batchAttrRules = batchAttrRules.filter((_, idx) => idx !== i); }
</script>

<div class="form-card">
  <h6>Scheduling Configuration</h6>

  <div class="form-row">
    <label>Organization</label>
    <select class="form-select" bind:value={schedOrgId} onchange={onSchedOrgChange}>
      <option value={null}>Select organization...</option>
      {#each organizations as org}
        <option value={org.id}>{org.name} (/{org.slug})</option>
      {/each}
    </select>
  </div>

  {#if schedOrgId}
    <div class="form-row">
      <label>Job Posting (optional — leave blank for all)</label>
      <select class="form-select" bind:value={schedJobId}>
        <option value={null}>All jobs</option>
        {#each schedJobs as job}
          <option value={job.id}>{job.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-row">
      <label>Algorithm</label>
      <div class="algo-cards">
        {#each algorithms as algo}
          <button
            class="algo-card"
            class:algo-selected={schedAlgorithmId === algo.id}
            onclick={() => schedAlgorithmId = algo.id}
          >
            <span class="algo-name">{algo.name}</span>
            <span class="algo-desc">{algo.description}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if schedAlgorithmId === 'batch-scheduler'}
      <div class="form-row">
        <label>Rooms (one per line)</label>
        <textarea class="form-control" bind:value={batchRoomsText} rows="4" placeholder="MCB230&#10;MCB231&#10;MCB232"></textarea>
        <span class="form-hint">{batchRoomsText.split('\n').filter(r => r.trim()).length} room(s) configured</span>
      </div>

      <div class="form-row">
        <label>Session Windows</label>
        {#each batchSessions as session, i}
          <div class="session-row">
            <span class="row-name">{session.date}</span>
            <span class="row-sub">{session.startTime} – {session.endTime}</span>
            <button class="btn btn-danger btn-sm" onclick={() => removeSession(i)}>×</button>
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
          <button class="btn btn-primary btn-sm" onclick={addSession}>Add</button>
        </div>
      </div>

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
                <button class="btn btn-danger btn-sm" onclick={() => removeRound(i)}>Remove</button>
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
        <button class="btn btn-quaternary btn-sm" onclick={addRound} style="margin-top: 8px;">+ Add Round</button>
      </div>

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
          <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: #9ca3af;">
            <input type="checkbox" bind:checked={batchRequireAll} style="width: 16px; height: 16px; margin-right: 6px;" />
            Require all rounds
          </label>
        </div>
        <div class="form-row" style="grid-column: span 2;">
          <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: #9ca3af;">
            <input type="checkbox" bind:checked={batchRelaxedFallback} style="width: 16px; height: 16px; margin-right: 6px;" />
            Relaxed fallback — schedule unmatched applicants with flagged violations
          </label>
          <p class="form-hint" style="margin-top: 4px;">
            A second pass places applicants who couldn't be strictly scheduled. These are saved with a violation flag for review.
          </p>
        </div>
        {#if batchRelaxedFallback}
          <div class="form-row">
            <label>Availability penalty weight</label>
            <input type="number" class="form-control" bind:value={batchRelaxedPenalty} min="1" max="100" style="max-width: 90px;" />
          </div>
        {/if}
      </div>

      <div class="form-row" style="margin-top: 8px;">
        <label class="toggle-label" style="font-size: 12px; font-weight: 600; color: #9ca3af;">
          <input type="checkbox" bind:checked={batchAttrEnabled} style="width: 16px; height: 16px; margin-right: 6px;" />
          Attribute-based matching
        </label>
      </div>

      {#if batchAttrEnabled}
        <div class="form-row">
          <label>Matching Rules</label>
          {#each batchAttrRules as rule, i}
            <div class="attr-rule-row">
              <span class="rule-pill">
                <span class="rule-qid">{rule.applicantQuestionId}</span>
                <i class="fi fi-br-arrow-right" style="font-size: 10px; color: #9ca3af;" aria-hidden="true"></i>
                <span class="rule-attr">{rule.interviewerAttributeKey}</span>
                <span class="rule-weight">+{rule.weight}</span>
                {#if rule.hard}<span class="rule-hard">hard</span>{/if}
              </span>
              <button class="btn-icon-sm" onclick={() => removeAttrRule(i)} aria-label="Remove rule">×</button>
            </div>
          {/each}
          {#if batchAttrRules.length === 0}
            <p class="muted" style="font-size: 12px; margin: 4px 0 8px;">No rules. Add one below.</p>
          {/if}
          <div class="attr-rule-add">
            <input class="form-control" bind:value={newRuleQId} placeholder="Applicant question ID" style="flex: 1;" />
            <i class="fi fi-br-arrow-right" style="font-size: 11px; color: #9ca3af; flex-shrink: 0;" aria-hidden="true"></i>
            <input class="form-control" bind:value={newRuleAttrKey} placeholder="Member attribute key" style="flex: 1;" />
            <input type="number" class="form-control" bind:value={newRuleWeight} min="1" max="100" placeholder="Wt" style="max-width: 60px;" />
            <label class="toggle-label" style="font-size: 11px; white-space: nowrap; gap: 4px;">
              <input type="checkbox" bind:checked={newRuleHard} style="width: 14px; height: 14px;" /> Hard
            </label>
            <button class="btn btn-quaternary btn-sm" onclick={addAttrRule}>Add</button>
          </div>
        </div>
      {/if}

    {:else}
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
    {/if}
  {/if}
</div>

{#if schedOrgId}
  <div class="sched-actions">
    <button class="btn btn-primary" onclick={runPreview} disabled={schedPreviewing}>
      {schedPreviewing ? 'Running...' : 'Preview Schedule'}
    </button>
    {#if schedPreview && schedPreview.interviews.length > 0}
      <button class="btn btn-primary" onclick={applySchedule} disabled={schedApplying}>
        {schedApplying ? 'Applying...' : `Apply ${schedPreview.interviews.length} Interviews`}
      </button>
    {/if}
    <button class="btn btn-primary" onclick={openEmailModal} disabled={schedEmailLoading}>
      <i class="fi fi-br-paper-plane" aria-hidden="true"></i> {schedEmailLoading ? 'Loading...' : 'Send Emails'}
    </button>
    <button class="btn btn-danger btn-sm" onclick={clearAutoInterviews} disabled={schedClearing}>
      {schedClearing ? 'Clearing...' : 'Clear Auto-Scheduled'}
    </button>
  </div>
{/if}

{#if schedError}<p class="error-text">{schedError}</p>{/if}
{#if schedSuccess}<div class="alert-success">{schedSuccess}</div>{/if}

{#if schedPreview}
  <div class="form-card" style="margin-top: 16px;">
    <h6>Preview Results</h6>

    {#if schedPreview.warnings.length > 0}
      <div class="alert-error" style="margin-bottom: 12px;">
        {#each schedPreview.warnings as w}<p style="margin: 2px 0;">{w}</p>{/each}
      </div>
    {/if}

    {#if schedPreview.relaxedCount && schedPreview.relaxedCount > 0}
      <div class="alert-warn" style="margin-bottom: 12px;">
        <i class="fi fi-br-triangle-warning" aria-hidden="true"></i>
        {schedPreview.relaxedCount} interview(s) placed via relaxed constraints — flagged for review.
      </div>
    {/if}

    {#if schedPreview.interviews.length > 0}
      <div class="jobs-table">
        <div class="table-header sched-table-header">
          <span>Applicant</span><span>Interviewer</span><span>Date</span><span>Time</span><span>Location</span><span>Flags</span>
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
                  ⚠ {iv.violations.map(v => v.type === 'availability' ? 'avail' : 'attr').join(', ')}
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

    {#if schedPreview.unmatchedDetails && schedPreview.unmatchedDetails.length > 0}
      <h6 style="margin-top: 16px;">
        Unmatched Applicants
        <span style="font-weight: 400; font-size: 12px; color: #6b7280;">({schedPreview.unmatchedDetails.length})</span>
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
                {slot.roundId}: {slot.date} {slot.startTime}–{slot.endTime} @ {slot.room}{slot.isFull ? ' ⚠ full' : ''}
              </span>
            {/each}
            {#if u.suggestedSlots.length === 0}
              <span class="row-sub" style="color: #991b1b;">No available slots.</span>
            {:else if u.suggestedSlots.length > 4}
              <span class="row-sub">+{u.suggestedSlots.length - 4} more options</span>
            {/if}
          </div>
        </div>
      {/each}
    {:else if schedPreview.unmatched.length > 0}
      <h6 style="margin-top: 16px;">Unmatched Applicants ({schedPreview.unmatched.length})</h6>
      <div style="font-size: 13px; color: #991b1b;">
        {#each schedPreview.unmatched as email}<p style="margin: 2px 0;">{email}</p>{/each}
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .form-card {
    background: white; border-radius: 8px; padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05); margin-bottom: 20px;
  }
  .form-row {
    margin-bottom: 14px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .form-hint { font-size: 11px; color: $light-tertiary; margin-top: 4px; display: block; }
  .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 8px; }
  .toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }

  .algo-cards { display: flex; gap: 8px; flex-wrap: wrap; }
  .algo-card {
    display: flex; flex-direction: column; padding: 10px 14px;
    border: 1px solid #e5e7eb; border-radius: 8px; background: white;
    cursor: pointer; text-align: left; transition: border-color 0.15s;
    min-width: 160px;
    &:hover { border-color: $yellow-primary; }
  }
  .algo-selected { border-color: $yellow-primary; background: rgba(255,200,0,0.06); }
  .algo-name { font-size: 12px; font-weight: 700; color: $dark-primary; }
  .algo-desc { font-size: 10px; color: $light-tertiary; margin-top: 2px; }

  .session-row {
    display: flex; align-items: center; gap: 12px; padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .add-session-form { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }

  .round-card {
    background: $light-secondary; border-radius: 6px; padding: 12px;
    margin-bottom: 8px;
  }
  .round-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .round-fields { display: flex; gap: 16px; flex-wrap: wrap; }
  .field-label { font-size: 11px; font-weight: 600; color: $light-tertiary; display: block; margin-bottom: 4px; }

  .attr-rule-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
  .rule-pill {
    display: flex; align-items: center; gap: 6px;
    background: white; border: 1px solid #e5e7eb; border-radius: 6px;
    padding: 4px 10px; font-size: 11px; flex: 1;
  }
  .rule-qid, .rule-attr { font-family: monospace; font-size: 11px; color: $dark-primary; }
  .rule-weight { font-size: 10px; font-weight: 700; color: #6366f1; }
  .rule-hard { font-size: 10px; font-weight: 700; color: #ef4444; }
  .attr-rule-add { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .btn-icon-sm {
    width: 22px; height: 22px; border: none; background: #fef2f2; color: #991b1b;
    border-radius: 4px; cursor: pointer; font-size: 14px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
  }

  .sched-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }

  .jobs-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 12px rgba(0,0,0,0.05); }
  .sched-table-header, .sched-table-row {
    display: grid; grid-template-columns: 1.5fr 1.5fr 100px 130px 120px 80px;
    padding: 10px 16px; font-size: 12px; align-items: center;
  }
  .table-header { background: $light-secondary; font-size: 11px; font-weight: 700; color: $light-tertiary; text-transform: uppercase; }
  .sched-table-row { border-bottom: 1px solid #f1f5f9; &:last-child { border-bottom: none; } }
  .sched-row-flagged { background-color: #fffbeb; }
  .violation-chip {
    font-size: 10px; font-weight: 700; color: #92400e;
    background: #fef3c7; padding: 1px 6px; border-radius: 3px;
  }

  .round-stats-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 8px rgba(0,0,0,0.04); }
  .rst-header, .rst-row { display: grid; grid-template-columns: 1.5fr 80px 80px 80px 100px; padding: 8px 14px; font-size: 12px; align-items: center; }
  .rst-header { background: $light-secondary; font-weight: 700; font-size: 11px; color: $light-tertiary; text-transform: uppercase; }
  .rst-row { border-bottom: 1px solid #f1f5f9; &:last-child { border-bottom: none; } }

  .unmatched-row {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid #f1f5f9;
    &:last-child { border-bottom: none; }
  }
  .unmatched-info { flex-shrink: 0; }
  .suggested-slots { display: flex; flex-wrap: wrap; gap: 4px; }
  .slot-chip {
    font-size: 10px; background: #eff6ff; color: #1e40af; padding: 2px 6px;
    border-radius: 4px; font-family: monospace;
    &.slot-full { background: #fef3c7; color: #92400e; }
  }

  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
  .alert-error { background: #fef2f2; color: #991b1b; padding: 10px 14px; border-radius: 6px; font-size: 13px; }
  .alert-warn { background: #fffbeb; color: #92400e; padding: 10px 14px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
