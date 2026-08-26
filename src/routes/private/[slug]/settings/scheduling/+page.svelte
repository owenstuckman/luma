<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase, isPlatformAdmin } from '$lib/utils/supabase';
	import {
		getActiveRoles,
		getAllApplicants,
		getInterviewerAvailability,
		getInterviewsByOrg,
		bulkCreateInterviews,
		clearAutoScheduledInterviews,
		upsertSchedulingConfig,
		getSchedulingConfig,
		getOrgMembersWithEmail
	} from '$lib/utils/supabase';
	import { algorithms, getAlgorithm } from '$lib/scheduling/registry';
	import type {
		SchedulerInput,
		SchedulerOutput,
		TimeRange,
		BatchRound,
		BatchSessionWindow,
		AttributeMatchRule
	} from '$lib/scheduling/types';
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
		{
			id: 'r1',
			label: 'Individual Interview',
			type: 'individual',
			durationMinutes: 20,
			breakBeforeMinutes: 0,
			groupSize: 1,
			interviewersPerRoom: 1
		}
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

		if (!orgData) {
			loading = false;
			return;
		}
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
				} catch {
					/* not JSON, skip */
				}
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
					? val
							.split(',')
							.map((v: string) => v.trim())
							.filter(Boolean)
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
				? allApplicants.filter((a) => a.job === schedJobId)
				: allApplicants;

			const activeAttrRules =
				batchAttrEnabled && schedAlgorithmId === 'batch-scheduler' ? batchAttrRules : [];

			const schedulerApplicants = filtered.map((a) => ({
				email: a.email,
				name: a.name,
				jobId: a.job || 0,
				availability: parseApplicantAvailability(a.recruitInfo),
				priority: typeof a.metadata?.priority === 'number' ? (a.metadata.priority as number) : 0,
				attributes:
					a.recruitInfo && activeAttrRules.length > 0
						? extractApplicantAttributes(a.recruitInfo, activeAttrRules)
						: undefined
			}));

			const [iaRows, orgMembersForSched] = await Promise.all([
				getInterviewerAvailability(org.id),
				getOrgMembersWithEmail(org.id)
			]);
			const memberMetaMap = new Map(
				orgMembersForSched.map((m) => [
					m.email,
					((m as any).metadata as Record<string, unknown>) || {}
				])
			);

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
			const schedulerInterviewers = Array.from(interviewerMap.entries()).map(
				([email, availability]) => ({
					email,
					availability,
					attributes:
						activeAttrRules.length > 0
							? (memberMetaMap.get(email) as Record<string, string | string[]> | undefined)
							: undefined
				})
			);

			const existingInterviews = await getInterviewsByOrg(org.id);
			const existingForScheduler = existingInterviews.map((iv) => ({
				startTime: iv.start_time,
				endTime: iv.end_time || iv.start_time,
				interviewer: iv.interviewer || '',
				applicant: iv.applicant || ''
			}));

			const algorithm = getAlgorithm(schedAlgorithmId);
			if (!algorithm) {
				schedError = 'Algorithm not found.';
				schedPreviewing = false;
				return;
			}

			const config =
				schedAlgorithmId === 'batch-scheduler'
					? {
							rooms: batchRoomsText
								.split('\n')
								.map((r) => r.trim())
								.filter(Boolean),
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
			const rows = schedPreview.interviews.map((iv) => ({
				start_time: iv.startTime,
				end_time: iv.endTime,
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
				start_time: r.start_time,
				end_time: r.end_time,
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
		if (!confirm('Delete all auto-scheduled interviews for this org/job? This cannot be undone.'))
			return;
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
		batchRounds = [
			...batchRounds,
			{
				id: nextId,
				label: 'New Round',
				type: 'individual',
				durationMinutes: 20,
				breakBeforeMinutes: 5,
				groupSize: 1,
				interviewersPerRoom: 1
			}
		];
	}
	function removeRound(i: number) {
		batchRounds = batchRounds.filter((_, idx) => idx !== i);
	}
	function addSession() {
		if (!newSessionDate || !newSessionStart || !newSessionEnd) return;
		batchSessions = [
			...batchSessions,
			{ date: newSessionDate, startTime: newSessionStart, endTime: newSessionEnd }
		];
		newSessionDate = '';
	}
	function removeSession(i: number) {
		batchSessions = batchSessions.filter((_, idx) => idx !== i);
	}
	function addAttrRule() {
		if (!newRuleQId.trim() || !newRuleAttrKey.trim()) return;
		batchAttrRules = [
			...batchAttrRules,
			{
				applicantQuestionId: newRuleQId.trim(),
				interviewerAttributeKey: newRuleAttrKey.trim(),
				weight: newRuleWeight,
				hard: newRuleHard
			}
		];
		newRuleQId = '';
		newRuleAttrKey = '';
		newRuleWeight = 20;
		newRuleHard = false;
	}
	function removeAttrRule(i: number) {
		batchAttrRules = batchAttrRules.filter((_, idx) => idx !== i);
	}
</script>

<div class="layout">
	<div class="content-left">
		{#if loading}
			<div class="page-head">
				<div>
					<h4 class="page-title">Auto-Scheduling</h4>
					<p class="page-subtitle">Loading…</p>
				</div>
			</div>
		{:else if !isAdmin}
			<div class="page-head">
				<div>
					<h4 class="page-title">Auto-Scheduling</h4>
					<p class="page-subtitle">Build an interview schedule from interviewer availability.</p>
				</div>
			</div>
			<div class="alert-soft alert-warning">
				You need admin or owner access to use auto-scheduling.
			</div>
		{:else}
			<div class="page-head">
				<div>
					<h4 class="page-title">Auto-Scheduling</h4>
					<p class="page-subtitle">Build an interview schedule from interviewer availability.</p>
				</div>
				<div class="page-actions">
					<a href="/private/{slug}/settings" class="btn btn-quaternary btn-sm">
						<i class="fi fi-br-arrow-left back-icon"></i> Back to Settings
					</a>
				</div>
			</div>

			<!-- Job filter -->
			<div class="panel">
				<div class="field">
					<label class="field-label">Job Posting (optional — leave blank for all)</label>
					<select class="form-select" bind:value={schedJobId}>
						<option value={null}>All jobs</option>
						{#each schedJobs as job}
							<option value={job.id}>{job.name}</option>
						{/each}
					</select>
				</div>

				<!-- Algorithm picker -->
				<div class="field">
					<label class="field-label">Algorithm</label>
					<div class="algo-cards">
						{#each algorithms as algo}
							<button
								class="algo-card"
								class:algo-selected={schedAlgorithmId === algo.id}
								on:click={() => (schedAlgorithmId = algo.id)}
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
				<div class="panel">
					<div class="panel-head"><h6 class="panel-title">Batch Scheduler Configuration</h6></div>

					<!-- Rooms -->
					<div class="field">
						<label class="field-label">Rooms (one per line)</label>
						<textarea
							class="form-control"
							bind:value={batchRoomsText}
							rows="4"
							placeholder="MCB230&#10;MCB231&#10;MCB232"></textarea>
						<span class="field-hint hint-block"
							>{batchRoomsText.split('\n').filter((r) => r.trim()).length} room(s) configured</span
						>
					</div>

					<!-- Session windows -->
					<div class="field">
						<label class="field-label">Session Windows</label>
						{#each batchSessions as session, i}
							<div class="session-row">
								<span class="row-name">{session.date}</span>
								<span class="row-sub">{session.startTime} – {session.endTime}</span>
								<button class="btn btn-danger btn-sm" on:click={() => removeSession(i)}>×</button>
							</div>
						{/each}
						{#if batchSessions.length === 0}
							<p class="muted note">No sessions added yet.</p>
						{/if}
						<div class="add-session-form">
							<input
								type="date"
								class="form-control"
								bind:value={newSessionDate}
								style="max-width: 160px;"
							/>
							<input
								type="time"
								class="form-control"
								bind:value={newSessionStart}
								style="max-width: 110px;"
							/>
							<span class="muted" style="font-size: 12px;">to</span>
							<input
								type="time"
								class="form-control"
								bind:value={newSessionEnd}
								style="max-width: 110px;"
							/>
							<button class="btn btn-primary btn-sm" on:click={addSession}>Add</button>
						</div>
					</div>

					<!-- Rounds -->
					<div class="field">
						<label class="field-label">Rounds</label>
						{#each batchRounds as round, i}
							<div class="round-card">
								<div class="round-header">
									<input
										class="form-control"
										bind:value={round.label}
										placeholder="Round label"
										style="max-width: 220px;"
									/>
									<select class="form-select" bind:value={round.type} style="max-width: 140px;">
										<option value="individual">Individual</option>
										<option value="group">Group</option>
									</select>
									{#if batchRounds.length > 1}
										<button class="btn btn-danger btn-sm" on:click={() => removeRound(i)}
											>Remove</button
										>
									{/if}
								</div>
								<div class="round-fields">
									<div>
										<label class="field-label">Duration (min)</label>
										<input
											type="number"
											class="form-control"
											bind:value={round.durationMinutes}
											min="5"
											style="max-width: 90px;"
										/>
									</div>
									<div>
										<label class="field-label">Break before (min)</label>
										<input
											type="number"
											class="form-control"
											bind:value={round.breakBeforeMinutes}
											min="0"
											style="max-width: 90px;"
										/>
									</div>
									{#if round.type === 'group'}
										<div>
											<label class="field-label">Applicants/room</label>
											<input
												type="number"
												class="form-control"
												bind:value={round.groupSize}
												min="2"
												style="max-width: 90px;"
											/>
										</div>
										<div>
											<label class="field-label">Interviewers/room</label>
											<input
												type="number"
												class="form-control"
												bind:value={round.interviewersPerRoom}
												min="1"
												style="max-width: 90px;"
											/>
										</div>
									{/if}
								</div>
							</div>
						{/each}
						<button class="btn btn-quaternary btn-sm" on:click={addRound} style="margin-top: 8px;"
							>+ Add Round</button
						>
					</div>

					<!-- Batch options -->
					<div class="config-grid">
						<div class="field">
							<label class="field-label">Slot step (minutes)</label>
							<input
								type="number"
								class="form-control"
								bind:value={batchSlotStep}
								min="5"
								max="60"
							/>
						</div>
						<div class="field">
							<label class="field-label">Break between slots (minutes)</label>
							<input type="number" class="form-control" bind:value={batchBlockBreak} min="0" />
						</div>
						<div class="field field-span2">
							<label class="toggle-label">
								<input type="checkbox" bind:checked={batchRequireAll} />
								Require all rounds (remove assignments for applicants missing any round)
							</label>
						</div>
						<div class="field field-span2">
							<label class="toggle-label">
								<input type="checkbox" bind:checked={batchRelaxedFallback} />
								Relaxed fallback — schedule unmatched applicants with flagged violations
							</label>
							<p class="field-hint">
								A second pass places applicants who couldn't be strictly scheduled, even outside
								their stated availability. These are saved with a violation flag for human review.
							</p>
						</div>
						{#if batchRelaxedFallback}
							<div class="field">
								<label class="field-label">Availability penalty weight</label>
								<input
									type="number"
									class="form-control"
									bind:value={batchRelaxedPenalty}
									min="1"
									max="100"
									style="max-width: 90px;"
								/>
								<span class="field-hint hint-block"
									>Higher = stronger preference for slots within stated availability</span
								>
							</div>
						{/if}
					</div>

					<!-- Attribute matching -->
					<div class="field field-spaced">
						<label class="toggle-label">
							<input type="checkbox" bind:checked={batchAttrEnabled} />
							Attribute-based matching — pair applicants with interviewers by shared attributes
						</label>
						<p class="field-hint">
							Maps applicant answers (by question ID in recruitInfo) to interviewer attributes (by
							key in member metadata). Set member attributes in Settings &rarr; Team Members.
						</p>
					</div>

					{#if batchAttrEnabled}
						<div class="field">
							<label class="field-label">Matching Rules</label>
							{#each batchAttrRules as rule, i}
								<div class="attr-rule-row">
									<span class="rule-pill">
										<span class="rule-qid">{rule.applicantQuestionId}</span>
										<i class="fi fi-br-arrow-right arrow-icon"></i>
										<span class="rule-attr">{rule.interviewerAttributeKey}</span>
										<span class="rule-weight">+{rule.weight}</span>
										{#if rule.hard}<span class="rule-hard">hard</span>{/if}
									</span>
									<button
										class="btn-icon btn-icon-danger"
										on:click={() => removeAttrRule(i)}
										title="Remove rule">×</button
									>
								</div>
							{/each}
							{#if batchAttrRules.length === 0}
								<p class="muted note">No rules. Add one below.</p>
							{/if}
							<div class="attr-rule-add">
								<input
									class="form-control"
									bind:value={newRuleQId}
									placeholder="Applicant question ID (e.g. team_interest)"
									style="flex: 1;"
								/>
								<i class="fi fi-br-arrow-right arrow-icon"></i>
								<input
									class="form-control"
									bind:value={newRuleAttrKey}
									placeholder="Member attribute key (e.g. teams)"
									style="flex: 1;"
								/>
								<input
									type="number"
									class="form-control"
									bind:value={newRuleWeight}
									min="1"
									max="100"
									placeholder="Wt"
									style="max-width: 60px;"
									title="Score bonus for a match"
								/>
								<label class="toggle-label toggle-inline">
									<input type="checkbox" bind:checked={newRuleHard} /> Hard
								</label>
								<button class="btn btn-quaternary btn-sm" on:click={addAttrRule}>Add</button>
							</div>
							<p class="field-hint">
								Hard rules restrict to matching interviewers only (fallback if none). Soft rules add
								score bonus.
							</p>
						</div>
					{/if}
				</div>

				<!-- Config form — simple algorithms -->
			{:else}
				<div class="panel">
					<div class="panel-head"><h6 class="panel-title">Algorithm Configuration</h6></div>
					<div class="config-grid">
						<div class="field">
							<label class="field-label">Slot Duration (minutes)</label>
							<input
								type="number"
								class="form-control"
								bind:value={schedConfig.slotDurationMinutes}
								min="10"
								max="180"
							/>
						</div>
						<div class="field">
							<label class="field-label">Break Between (minutes)</label>
							<input
								type="number"
								class="form-control"
								bind:value={schedConfig.breakBetweenMinutes}
								min="0"
								max="60"
							/>
						</div>
						<div class="field">
							<label class="field-label">Max Interviews per Interviewer (0 = unlimited)</label>
							<input
								type="number"
								class="form-control"
								bind:value={schedConfig.maxInterviewsPerInterviewer}
								min="0"
							/>
						</div>
						<div class="field">
							<label class="field-label">Interview Type</label>
							<select class="form-select" bind:value={schedConfig.interviewType}>
								<option value="individual">Individual</option>
								<option value="group">Group</option>
							</select>
						</div>
						<div class="field">
							<label class="field-label">Location</label>
							<input
								class="form-control"
								bind:value={schedConfig.location}
								placeholder="e.g. Room 101, Zoom, etc."
							/>
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
					<i class="fi fi-br-paper-plane"></i>
					{schedEmailLoading ? 'Loading...' : 'Send Emails'}
				</button>
				<button
					class="btn btn-danger btn-sm"
					on:click={clearAutoInterviews}
					disabled={schedClearing}
				>
					{schedClearing ? 'Clearing...' : 'Clear Auto-Scheduled'}
				</button>
			</div>

			{#if schedError}<p class="alert-soft alert-error">{schedError}</p>{/if}
			{#if schedSuccess}<div class="alert-soft alert-success">{schedSuccess}</div>{/if}

			<!-- Preview Results -->
			{#if schedPreview}
				<div class="panel results-panel">
					<div class="panel-head"><h6 class="panel-title">Preview Results</h6></div>

					{#if schedPreview.warnings.length > 0}
						<div class="alert-soft alert-error">
							{#each schedPreview.warnings as w}
								<p class="alert-line">{w}</p>
							{/each}
						</div>
					{/if}

					{#if schedPreview.relaxedCount && schedPreview.relaxedCount > 0}
						<div class="alert-soft alert-warning alert-warn">
							<i class="fi fi-br-triangle-warning"></i>
							{schedPreview.relaxedCount} interview(s) placed via relaxed constraints — flagged for review.
							Confirm or adjust before applying.
						</div>
					{/if}

					{#if schedPreview.interviews.length > 0}
						<div class="table-scroll">
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
									<div
										class="sched-table-row table-row"
										class:sched-row-flagged={iv.violations && iv.violations.length > 0}
									>
										<span class="row-name">{iv.applicant}</span>
										<span class="row-name">{iv.interviewer}</span>
										<span class="row-sub">{iv.startTime.substring(0, 10)}</span>
										<span class="row-sub"
											>{iv.startTime.substring(11, 16)} - {iv.endTime.substring(11, 16)}</span
										>
										<span class="row-sub">{iv.location || '-'}</span>
										<span>
											{#if iv.violations && iv.violations.length > 0}
												<span
													class="pill violation-chip"
													title={iv.violations.map((v) => v.detail).join('; ')}
												>
													{iv.violations
														.map((v) => (v.type === 'availability' ? 'avail' : 'attr'))
														.join(', ')}
												</span>
											{/if}
										</span>
									</div>
								{/each}
							</div>
						</div>
						<p class="muted note">{schedPreview.interviews.length} interviews proposed</p>
					{:else}
						<p class="muted">No interviews could be scheduled.</p>
					{/if}

					<!-- Per-round stats (batch scheduler) -->
					{#if schedPreview.stats && schedPreview.stats.length > 0}
						<h6 class="subhead">Results by Round</h6>
						<div class="table-scroll">
							<div class="round-stats-table">
								<div class="rst-header">
									<span>Round</span><span>Scheduled</span><span>Relaxed</span><span>Missed</span
									><span>Slots Used</span>
								</div>
								{#each schedPreview.stats as stat}
									<div class="rst-row">
										<span class="row-name">{stat.roundLabel}</span>
										<span class="stat-num stat-ok">{stat.scheduled}</span>
										<span class="stat-num" class:stat-warn={stat.relaxedCount > 0}
											>{stat.relaxedCount}</span
										>
										<span
											class="stat-num"
											class:stat-bad={stat.missed > 0}
											class:stat-ok={stat.missed === 0}>{stat.missed}</span
										>
										<span class="row-sub">{stat.filledSlots}/{stat.totalSlots}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Unmatched applicants with suggestions (batch) -->
					{#if schedPreview.unmatchedDetails && schedPreview.unmatchedDetails.length > 0}
						<h6 class="subhead">
							Unmatched Applicants
							<span class="count-note"
								>({schedPreview.unmatchedDetails.length}) — suggested slots shown for manual
								placement</span
							>
						</h6>
						{#each schedPreview.unmatchedDetails as u}
							<div class="unmatched-row">
								<div class="unmatched-info">
									<span class="row-name">{u.name}</span>
									<span class="row-sub">{u.email}</span>
									<span class="row-sub missed-text">Missed: {u.missedRounds.join(', ')}</span>
								</div>
								<div class="suggested-slots">
									{#each u.suggestedSlots.slice(0, 4) as slot}
										<span class="slot-chip" class:slot-full={slot.isFull}>
											{slot.roundId}: {slot.date}
											{slot.startTime}–{slot.endTime} @ {slot.room}{slot.isFull ? ' full' : ''}
										</span>
									{/each}
									{#if u.suggestedSlots.length === 0}
										<span class="row-sub missed-text"
											>No available slots match their availability.</span
										>
									{:else if u.suggestedSlots.length > 4}
										<span class="row-sub">+{u.suggestedSlots.length - 4} more options</span>
									{/if}
								</div>
							</div>
						{/each}

						<!-- Unmatched fallback for simple algorithms -->
					{:else if schedPreview.unmatched.length > 0}
						<h6 class="subhead">Unmatched Applicants ({schedPreview.unmatched.length})</h6>
						<div class="unmatched-emails">
							{#each schedPreview.unmatched as email}
								<p class="alert-line">{email}</p>
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
		{slug}
		onClose={() => (showSchedEmailModal = false)}
	/>
{/if}

<style lang="scss">
	@use 'sass:color';
	@use '../../../../../styles/col.scss' as *;

	// Shared furniture (.page-head, .panel, .field/.field-label/.field-hint,
	// .alert-soft, .pill, .btn-icon, .muted, .row-name/.row-sub, .table-scroll)
	// is global — src/styles/ui.scss. Only the scheduler-specific pieces are here.

	// `.alert-soft.alert-warning` supplies the colours; this only lays out the
	// warning icon beside its text.
	.alert-warn {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.alert-line {
		margin: 2px 0;
	}
	.results-panel {
		margin-top: 16px;
	}
	.subhead {
		margin-top: 16px;
	}
	.count-note {
		font-weight: 400;
		font-size: 12px;
		color: $text-body;
	}
	.note {
		font-size: 12px;
		margin: 4px 0 8px;
	}
	.back-icon {
		font-size: 10px;
		margin-right: 4px;
	}
	.arrow-icon {
		font-size: 11px;
		color: $text-subtle;
		flex-shrink: 0;
	}

	.field-span2 {
		grid-column: span 2;
	}
	.field-spaced {
		margin-top: 8px;
	}
	// The shared `.field-hint` is a paragraph rule; these hints are inline spans
	// that need to sit on their own line.
	.hint-block {
		display: block;
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
		border: 2px solid $border;
		border-radius: $radius;
		background: $surface;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s;
		&:hover {
			border-color: $yellow-primary;
		}
	}
	.algo-selected {
		border-color: $yellow-primary !important;
		background-color: rgba(255, 200, 0, 0.05);
	}
	.algo-name {
		font-weight: 700;
		font-size: 13px;
		margin-bottom: 4px;
	}
	.algo-desc {
		font-size: 11px;
		color: $text-muted;
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

	.btn-danger {
		background-color: $danger;
		color: $surface;
		border: none;
		border-radius: $radius-sm;
		cursor: pointer;
		font-weight: 600;
		&:hover {
			background-color: color.adjust($danger, $lightness: -8%);
		}
		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		input[type='checkbox'] {
			width: 18px;
			height: 18px;
			accent-color: $yellow-primary;
		}
	}
	.toggle-inline {
		font-size: 11px;
		white-space: nowrap;
		gap: 4px;
		input[type='checkbox'] {
			width: 14px;
			height: 14px;
		}
	}

	.session-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		background-color: $light-secondary;
		border-radius: $radius-sm;
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
		border: 1px solid $border;
		border-radius: $radius;
		padding: 14px;
		margin-bottom: 10px;
		background-color: $surface-muted;
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

	// Preview results — a CSS-grid pseudo-table, not a <table>, because each row
	// carries flag state. Wrapped in the shared `.table-scroll`.
	.preview-table {
		background-color: $surface;
		border-radius: $radius;
		box-shadow: $shadow-sm;
		overflow: hidden;
		min-width: 720px;
	}
	.table-header,
	.table-row {
		display: grid;
		align-items: center;
		padding: 10px 16px;
		gap: 8px;
	}
	.table-header {
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border-bottom: 1px solid $border;
		background-color: $surface-muted;
	}
	.table-row {
		border-bottom: 1px solid $border-faint;
		font-size: 13px;
		&:last-child {
			border-bottom: none;
		}
	}
	.sched-table-header,
	.sched-table-row {
		grid-template-columns: 2fr 2fr 1fr 1fr 1fr 1fr !important;
	}
	.sched-row-flagged {
		background-color: $warning-bg !important;
	}
	// Extends the shared `.pill`: warmer fill than `.pill-warning` so a flagged
	// row's chip still reads against the flagged row background.
	.violation-chip {
		background-color: $warning-border;
		color: $warning-fg;
		cursor: help;
		text-transform: none;
	}

	.round-stats-table {
		background: $surface;
		border-radius: $radius;
		overflow: hidden;
		border: 1px solid $border;
		margin-bottom: 12px;
		min-width: 520px;
	}
	.rst-header,
	.rst-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
		padding: 8px 14px;
		gap: 8px;
		align-items: center;
		font-size: 13px;
	}
	.rst-header {
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		background-color: $surface-muted;
		border-bottom: 1px solid $border;
	}
	.rst-row {
		border-bottom: 1px solid $border-faint;
		&:last-child {
			border-bottom: none;
		}
	}
	.stat-num {
		font-weight: 600;
		color: $text-body;
	}
	.stat-ok {
		color: $success-fg;
	}
	.stat-warn {
		color: $warning-fg;
	}
	.stat-bad {
		color: $danger-fg;
	}

	.unmatched-row {
		display: flex;
		gap: 16px;
		padding: 10px 14px;
		background-color: $danger-bg;
		border: 1px solid $danger-border;
		border-radius: $radius;
		margin-bottom: 6px;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.unmatched-info {
		min-width: 180px;
	}
	.unmatched-emails {
		font-size: 13px;
		color: $danger-fg;
	}
	.missed-text {
		color: $danger-fg;
	}
	.suggested-slots {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1;
	}
	.slot-chip {
		display: inline-block;
		padding: 3px 8px;
		background-color: $success-bg;
		color: $success-fg;
		border-radius: $radius-pill;
		font-size: 11px;
		font-weight: 600;
		font-family: monospace;
		white-space: nowrap;
	}
	.slot-full {
		background-color: $warning-border !important;
		color: $warning-fg !important;
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
		border-radius: $radius-sm;
		padding: 4px 10px;
		font-size: 12px;
		flex: 1;
	}
	.rule-qid {
		color: $info-fg;
		font-weight: 600;
	}
	.rule-attr {
		color: $success-fg;
		font-weight: 600;
	}
	.rule-weight {
		color: $text-muted;
		font-size: 11px;
	}
	.rule-hard {
		background-color: $warning-border;
		color: $warning-fg;
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: $radius-pill;
	}
	.attr-rule-add {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 6px;
	}
</style>
