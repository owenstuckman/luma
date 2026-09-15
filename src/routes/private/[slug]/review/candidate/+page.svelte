<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		supabase,
		getApplicantData,
		addComment,
		getCurrentUserEmail,
		updateApplicantStatus,
		getUserRoleInOrg,
		getOrgMembersWithEmail,
		getTeams
	} from '$lib/utils/supabase';
	import {
		getCandidateTimeline,
		getSubmissionSiblings,
		getPersonInterviews,
		groupInterviewSessions,
		resolveApplicationTeam,
		personKey,
		scoredInterviews
	} from '$lib/utils/candidates';
	import type {
		TimelineEvent,
		TimelineKind,
		SubmissionSibling,
		InterviewLite,
		InterviewSession
	} from '$lib/utils/candidates';
	import { averageScore } from '$lib/utils/interviewForms';
	import { adjustedAverage } from '$lib/utils/scoreModel';
	import { blindMode } from '$lib/stores/blindMode';
	import { blindName, buildNameScrubber, candidateNumber } from '$lib/utils/blind';
	import {
		getJobScoringContext,
		getSecondRoundPicks,
		setSecondRoundPick,
		getReadinessScores,
		saveReadinessScore,
		summarizeReadiness,
		READINESS_PASS_LABELS,
		type JobScoringContext,
		type ReadinessPass,
		type ReadinessScore,
		type SecondRoundPick
	} from '$lib/utils/round2';
	import InterviewSessions from '$lib/components/recruiter/InterviewSessions.svelte';
	import BlindToggle from '$lib/components/recruiter/BlindToggle.svelte';
	import { allQuestions } from '$lib/utils/formSchema';
	import {
		tallyVotes,
		thresholdOutcome,
		votesRemaining,
		buildWeightMap,
		outcomeToStatus,
		redactApplicant,
		shouldBlind
	} from '$lib/utils/review';
	import { readOrgSettings, DEFAULT_ORG_SETTINGS } from '$lib/types/orgSettings';
	import type { OrgSettings } from '$lib/types/orgSettings';
	import type { Applicant, CommentEntry, QuestionSchema, Team } from '$lib/types';

	let applicant: Applicant | null = null;
	let commentsArray: CommentEntry[] = [];
	let newComment = '';
	let newStatus = 'pending';
	let loading = true;
	// The PERSON's interviews: they sat one interview round however many teams
	// they applied to, so every one of their applications shows it.
	let interviews: InterviewLite[] = [];
	let timeline: TimelineEvent[] = [];
	let timelineLoading = true;
	let teams: Team[] = [];
	// Sibling applications from the same submit. Surfaced ONLY as the quiet
	// "also applied to" line below — never merged into this application.
	let siblings: SubmissionSibling[] = [];

	// --- Review voting ---
	let orgSettings: OrgSettings = DEFAULT_ORG_SETTINGS;
	let reviewerWeights: Record<string, number> = {};
	let viewerRoles: string[] = [];
	let jobSchema: QuestionSchema | null = null;
	let myEmail = '';
	let voting = false;
	let voteNote = '';

	$: thresholds = orgSettings.review_thresholds;
	$: tally = tallyVotes(commentsArray, reviewerWeights);
	$: outcome = thresholdOutcome(tally, thresholds);
	$: remaining = votesRemaining(tally, thresholds);
	// Blinded either by the org's reviewer policy or by this viewer's blind toggle.
	$: policyBlinded = shouldBlind(viewerRoles, thresholds);
	$: blinded = policyBlinded || $blindMode;
	// What the reviewer is allowed to see. Advisors/admins get the real record;
	// a plain reviewer sees a redacted copy.
	$: shown = applicant ? redactApplicant(applicant, jobSchema, blinded) : null;
	$: myVote = tally.voters.find((v) => v.email === myEmail.toLowerCase())?.vote ?? null;

	// The ONE team this application is for. Everything on this page is about
	// that team's application; sibling applications are a footnote, not part of
	// the record being reviewed.
	$: appTeam = applicant ? resolveApplicationTeam(applicant, teams) : null;

	// Author-written copy can contain `{team}`; a per-team question is stored
	// under its authored id, so the placeholder has to be filled in at render
	// time from this application's team.
	$: teamCopy = appTeam?.legacy_multi
		? appTeam.all_names.join(' / ')
		: (appTeam?.name ?? 'this team');

	$: questionLabels = ((): Record<string, string> => {
		const map: Record<string, string> = {};
		for (const q of allQuestions(jobSchema)) {
			map[q.id] = (q.title ?? q.id).replace(/\{team\}/g, teamCopy);
		}
		return map;
	})();

	const TIMELINE_ICONS: Record<TimelineKind, string> = {
		draft: 'fi-br-pencil',
		applied: 'fi-br-paper-plane',
		comment: 'fi-br-comment-alt',
		status: 'fi-br-refresh',
		interview_scheduled: 'fi-br-calendar-clock',
		interview: 'fi-br-users-alt',
		evaluation: 'fi-br-star',
		decision: 'fi-br-badge-check',
		email: 'fi-br-envelope'
	};

	const TIMELINE_COLORS: Record<TimelineKind, string> = {
		draft: '#878fa1',
		applied: '#3b82f6',
		comment: '#8b5cf6',
		status: '#878fa1',
		interview_scheduled: '#0ea5e9',
		interview: '#0ea5e9',
		evaluation: '#f59e0b',
		decision: '#22c55e',
		email: '#878fa1'
	};

	$: slug = $page.params.slug;
	// This page is reachable from both /review and /candidates; send the user back
	// where they came from.
	$: backTo = $page.url.searchParams.get('from') === 'candidates' ? 'candidates' : 'review';

	$: sessions = groupInterviewSessions(interviews) as InterviewSession[];
	$: allEvaluations = sessions.flatMap((x) => x.entries.map((e) => e.evaluation));
	$: entryCount = sessions.reduce((n, x) => n + x.entries.length, 0);
	$: evaluatedCount = allEvaluations.filter(Boolean).length;
	$: overall = averageScore(allEvaluations);
	$: individualScore = averageScore(allEvaluations, 'individual');
	$: groupScore = averageScore(allEvaluations, 'group');
	$: legacyScore = averageScore(allEvaluations, 'legacy');
	$: hasIndividual = sessions.some((x) => x.type === 'individual');
	$: hasGroup = sessions.some((x) => x.type === 'group');

	// --- Interviewer-adjusted score, blind mode, round 2 ---
	let orgId: number | null = null;
	let myUserId: string | null = null;
	let scoring: JobScoringContext | null = null;
	let pick: SecondRoundPick | null = null;
	let readinessRows: ReadinessScore[] = [];
	let round2Saving = false;
	let round2Error = '';

	$: adjustedOverall = scoring
		? adjustedAverage(scoring.model, scoredInterviews(interviews))
		: null;
	$: myPersonKey = applicant ? personKey(applicant.job, applicant.email) : '';
	$: myNumber =
		scoring?.numberOf.get(myPersonKey) ??
		(applicant ? candidateNumber([applicant.id, ...siblings.map((x) => x.id)]) : 0);
	// Until the posting's name list arrives, still scrub this candidate's own name.
	$: scrub =
		$blindMode && applicant
			? buildNameScrubber(
					scoring?.people ?? [{ name: applicant.name, number: myNumber }],
					scoring?.sessionMates.get(myPersonKey) ?? []
				)
			: (text: string) => text;
	$: readiness = applicant
		? (summarizeReadiness(readinessRows, myUserId).get(applicant.id) ?? null)
		: null;

	const fmtScore = (n: number | null) => (n === null ? '—' : n.toFixed(1));
	/** Tone for a 1-10 value: the form's scale is 1/3/5/7/10. */
	const scoreTone = (n: number | null) =>
		n === null ? 'pill-neutral' : n >= 7 ? 'pill-success' : n >= 5 ? 'pill-warning' : 'pill-danger';

	async function togglePick(picked: boolean) {
		if (!applicant || orgId === null) return;
		round2Saving = true;
		round2Error = '';
		try {
			await setSecondRoundPick(orgId, applicant.id, picked);
			pick = picked
				? {
						applicant_id: applicant.id,
						picked_by_email: myEmail,
						created_at: new Date().toISOString()
					}
				: null;
		} catch (e) {
			round2Error = e instanceof Error ? e.message : 'Could not save.';
		} finally {
			round2Saving = false;
		}
	}

	async function rateReadiness(pass: ReadinessPass, score: number) {
		if (!applicant || orgId === null || !myUserId) return;
		const current = readiness?.mine[pass];
		const next = current === score ? null : score; // clicking your score again clears it
		round2Saving = true;
		round2Error = '';
		try {
			await saveReadinessScore(orgId, applicant.id, pass, next);
			const others = readinessRows.filter((r) => !(r.rater_id === myUserId && r.pass === pass));
			readinessRows =
				next === null
					? others
					: [
							...others,
							{
								applicant_id: applicant.id,
								rater_id: myUserId,
								rater_email: myEmail,
								pass,
								score: next,
								updated_at: new Date().toISOString()
							}
						];
		} catch (e) {
			round2Error = e instanceof Error ? e.message : 'Could not save.';
		} finally {
			round2Saving = false;
		}
	}

	// Loads in two waves. The applicant, org and session come first and render the
	// page; everything else starts at once and fills in as it lands, instead of
	// the old one-query-after-another chain.
	onMount(async () => {
		const id = Number(new URLSearchParams(window.location.search).get('id'));
		if (!id) {
			loading = false;
			timelineLoading = false;
			return;
		}

		const [applicantRows, orgRes, sessionRes] = await Promise.all([
			getApplicantData(id).catch((error) => {
				console.error('Failed to load applicant data:', error);
				return [] as Applicant[];
			}),
			supabase.from('organizations').select('id, settings').eq('slug', slug).single(),
			supabase.auth.getSession()
		]);

		applicant = applicantRows[0] ?? null;
		commentsArray = applicant?.comments?.comments || [];
		loading = false;

		const orgData = orgRes.data;
		if (!applicant || !orgData) {
			timelineLoading = false;
			return;
		}
		const app = applicant;
		const org = orgData.id as number;
		orgId = org;
		orgSettings = readOrgSettings(orgData.settings);
		const user = sessionRes.data.session?.user;
		myEmail = user?.email ?? '';
		myUserId = user?.id ?? null;

		const interviewsP = getPersonInterviews(org, app);

		await Promise.allSettled([
			// Reviewer weights must key by real email, since that is what comments
			// record — hence the RPC rather than a plain `org_members` select.
			getOrgMembersWithEmail(org).then((members) => (reviewerWeights = buildWeightMap(members))),
			getUserRoleInOrg(org, user?.id).then((me) => {
				viewerRoles = me ? [...(me.roles ?? []), me.role].filter(Boolean) : [];
			}),
			// The job's schema tells us which answers are marked `blinded`.
			app.job
				? supabase
						.from('job_posting')
						.select('questions')
						.eq('id', app.job)
						.single()
						.then(({ data }) => (jobSchema = data?.questions ?? null))
				: null,
			getTeams(org).then((list) => (teams = list)),
			getSubmissionSiblings(org, app)
				.then((list) => (siblings = list))
				.catch((error) => console.error('Failed to load sibling applications:', error)),
			interviewsP.then((list) => (interviews = list)),
			interviewsP
				.then((list) => getCandidateTimeline(org, app, list))
				.then((events) => (timeline = events))
				.catch((error) => console.error('Failed to load candidate timeline:', error))
				.finally(() => (timelineLoading = false)),
			app.job
				? getJobScoringContext(org, app.job)
						.then((context) => (scoring = context))
						.catch((error) => console.warn('Adjusted scores unavailable:', error))
				: null,
			getSecondRoundPicks(org, app.id).then((map) => (pick = map.get(app.id) ?? null)),
			getReadinessScores(org, app.id).then((rows) => (readinessRows = rows))
		]);
	});

	function formatEventTime(at: string | null): string {
		if (!at) return 'No timestamp';
		return new Date(at).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const handleAddComment = async () => {
		if (!newComment.trim() || !applicant) return;
		try {
			const email = (await getCurrentUserEmail()) as string;
			const newID = commentsArray.length > 0 ? commentsArray[commentsArray.length - 1].id + 1 : 1;
			await addComment(applicant.id, newID, newComment, email, newStatus);
			commentsArray = [
				...commentsArray,
				{ id: newID, email, comment: newComment, decision: newStatus }
			];
			newComment = '';
			newStatus = 'pending';
		} catch (error) {
			console.error('Failed to add comment:', error);
		}
	};

	/**
	 * Cast (or change) this reviewer's vote. Stored as a comment so it shows up
	 * in the existing comment thread and timeline; `tallyVotes` counts only each
	 * reviewer's most recent one.
	 *
	 * When a vote crosses a threshold the applicant's status advances
	 * automatically, matching the Phase 3 decision to auto-advance rather than
	 * wait for an admin to confirm.
	 */
	async function castVote(vote: 'approve' | 'reject') {
		if (!applicant || voting) return;
		voting = true;
		try {
			const email = (await getCurrentUserEmail()) as string;
			const newID = commentsArray.length > 0 ? commentsArray[commentsArray.length - 1].id + 1 : 1;
			const note = voteNote.trim() || `Voted to ${vote}`;
			await addComment(applicant.id, newID, note, email, vote);
			commentsArray = [...commentsArray, { id: newID, email, comment: note, decision: vote }];
			voteNote = '';

			const newTally = tallyVotes(commentsArray, reviewerWeights);
			const nextStatus = outcomeToStatus(thresholdOutcome(newTally, thresholds));
			if (nextStatus && nextStatus !== applicant.status) {
				await updateApplicantStatus(applicant.id, nextStatus);
				applicant = { ...applicant, status: nextStatus };
			}
		} catch (error) {
			console.error('Failed to record vote:', error);
		} finally {
			voting = false;
		}
	}

	const handleStatusChange = async (status: string) => {
		if (!applicant) return;
		try {
			await updateApplicantStatus(applicant.id, status);
			applicant = { ...applicant, status: status as Applicant['status'] };
		} catch (error) {
			console.error('Failed to update status:', error);
		}
	};

	function getStatusColor(status: string) {
		switch (status) {
			case 'pending':
				return '#878fa1';
			case 'interview':
				return '#3b82f6';
			case 'accepted':
				return '#22c55e';
			case 'denied':
				return '#ef4444';
			default:
				return '#878fa1';
		}
	}
</script>

<div class="candidate-page">
	<div class="candidate-header">
		<a href="/private/{slug}/{backTo}" class="back-btn">
			<i class="fi fi-br-arrow-left"></i>
			Back to {backTo === 'candidates' ? 'Candidates' : 'Review'}
		</a>
		<BlindToggle />
	</div>

	{#if loading}
		<p>Loading...</p>
	{:else if applicant}
		<div class="candidate-layout">
			<!-- Left: Applicant info -->
			<div class="candidate-info">
				<div class="card">
					<div style="display: flex; justify-content: space-between; align-items: center;">
						<h5 style="margin: 0;">
							{$blindMode ? blindName(myNumber) : (shown?.name ?? applicant.name)}
						</h5>
						<span
							class="status-badge"
							style="background-color: {getStatusColor(applicant.status)};"
						>
							{applicant.status}
						</span>
					</div>
					<p class="meta">{shown?.email ?? applicant.email}</p>
					<p class="meta">Applied {new Date(applicant.created_at).toLocaleDateString()}</p>
					{#if appTeam?.legacy_multi}
						<p class="team-line">
							<span
								class="pill pill-warning"
								title="Submitted before applications were split per team"
							>
								Legacy · {appTeam.all_names.join(', ')}
							</span>
						</p>
					{:else if appTeam?.name}
						<p class="team-line">
							<span class="pill pill-neutral">{appTeam.name}</span>
						</p>
					{/if}
					{#if !blinded && siblings.length > 0}
						<p class="sibling-note">
							Also applied to
							{#each siblings as sib, i (sib.id)}
								<a href="/private/{slug}/review/candidate?id={sib.id}&from={backTo}">
									{sib.team_name ?? `application #${sib.id}`}</a
								>{i < siblings.length - 1 ? ', ' : ''}
							{/each}
							— reviewed separately.
						</p>
					{/if}
					{#if policyBlinded}
						<p class="blind-note">
							<i class="fi fi-br-eye-crossed"></i>
							Blinded review — identifying details are hidden. Advisors and admins see the full record.
						</p>
					{:else if $blindMode}
						<p class="blind-note">
							<i class="fi fi-br-eye-crossed"></i>
							Blind names is on — candidate names are replaced with numbers, including in notes and comments.
						</p>
					{/if}

					<div style="margin-top: 12px;">
						<label class="field-label">Change Status</label>
						<select
							class="form-control"
							style="max-width: 200px;"
							value={applicant.status}
							on:change={(e) => handleStatusChange(e.currentTarget.value)}
						>
							<option value="pending">Pending</option>
							<option value="interview">Interview</option>
							<option value="accepted">Accepted</option>
							<option value="denied">Denied</option>
						</select>
					</div>
				</div>

				<!-- Review votes: tally, threshold progress, and this reviewer's vote -->
				<div class="card">
					<h5>Review Votes</h5>

					<div class="vote-counts">
						<span class="pill pill-success">{tally.approve} approve</span>
						<span class="pill pill-danger">{tally.reject} reject</span>
						{#if tally.neutral > 0}
							<span class="pill pill-neutral">{tally.neutral} neutral</span>
						{/if}
						{#if thresholds.weighted_scoring}
							<span class="vote-weighted">
								weighted {tally.weightedApprove} / {tally.weightedReject}
							</span>
						{/if}
					</div>

					<p class="meta">
						{#if outcome === 'advance'}
							Threshold met — advanced to interview.
						{:else if outcome === 'deny'}
							Rejection threshold met — marked denied.
						{:else}
							{remaining.toAdvance} more to advance · {remaining.toDeny} more to deny
						{/if}
					</p>

					{#if myVote}
						<p class="meta">
							You voted <strong>{myVote}</strong>. Voting again replaces it.
						</p>
					{/if}

					<textarea
						class="form-control"
						rows="2"
						bind:value={voteNote}
						placeholder="Optional note with your vote..."
						style="font-size: 12px; margin: 8px 0;"></textarea>

					<div class="vote-actions">
						<button
							class="btn btn-sm vote-btn approve-btn"
							disabled={voting}
							on:click={() => castVote('approve')}
						>
							{voting ? '...' : 'Approve'}
						</button>
						<button
							class="btn btn-sm vote-btn reject-btn"
							disabled={voting}
							on:click={() => castVote('reject')}
						>
							{voting ? '...' : 'Reject'}
						</button>
					</div>
				</div>

				<!-- Interviews: one entry per sitting, each interviewer's evaluation inside -->
				{#if sessions.length > 0}
					<div class="card">
						<h5>Interviews</h5>
						<p class="meta interviews-meta">
							{evaluatedCount} of {entryCount} evaluation{entryCount === 1 ? '' : 's'} submitted
							{#if siblings.length > 0}
								· shared with their {siblings.map((x) => x.team_name ?? 'other').join(', ')} application{siblings.length ===
								1
									? ''
									: 's'}
							{/if}
						</p>

						<div class="score-strip">
							<div
								class="score-tile"
								title="Average with each interviewer's usual lean removed. See Candidates → Team rankings → How scores work."
							>
								<span class="pill {scoreTone(adjustedOverall)} score-big"
									>{scoring ? fmtScore(adjustedOverall) : '…'}</span
								>
								<span class="score-cap">Adjusted /10</span>
							</div>
							<div class="score-tile">
								<span class="pill {scoreTone(overall.average)} score-big"
									>{fmtScore(overall.average)}</span
								>
								<span class="score-cap">Raw /10 · {overall.count} scored</span>
							</div>
							{#if hasIndividual}
								<div class="score-tile">
									<span class="pill {scoreTone(individualScore.average)} score-big"
										>{fmtScore(individualScore.average)}</span
									>
									<span class="score-cap">Individual · {individualScore.count} scored</span>
								</div>
							{/if}
							{#if hasGroup}
								<div class="score-tile">
									<span class="pill {scoreTone(groupScore.average)} score-big"
										>{fmtScore(groupScore.average)}</span
									>
									<span class="score-cap">Group · {groupScore.count} scored</span>
								</div>
							{/if}
							{#if legacyScore.count > 0}
								<div class="score-tile">
									<span class="pill {scoreTone(legacyScore.average)} score-big"
										>{fmtScore(legacyScore.average)}</span
									>
									<span class="score-cap">Older form (stars ×2) · {legacyScore.count}</span>
								</div>
							{/if}
						</div>

						<InterviewSessions {sessions} model={scoring?.model ?? null} {scrub} />
					</div>
				{/if}

				<!-- Full pipeline history, unioned from every table that records
				     something about this candidate. -->
				<div class="card">
					<h5>Timeline</h5>
					{#if timelineLoading}
						<p class="muted">Loading history...</p>
					{:else if timeline.length === 0}
						<p class="muted">No recorded activity.</p>
					{:else}
						<ol class="timeline">
							{#each timeline as ev, i (i)}
								<li class="timeline-item">
									<span
										class="timeline-marker"
										style="background-color: {TIMELINE_COLORS[ev.kind]};"
									>
										<i class="fi {TIMELINE_ICONS[ev.kind]}"></i>
									</span>
									<div class="timeline-body">
										<div class="timeline-head">
											<span class="timeline-title">{ev.title}</span>
											{#if ev.tag}
												<span
													class="timeline-tag"
													style="background-color: {TIMELINE_COLORS[ev.kind]};"
												>
													{ev.tag.replace(/_/g, ' ')}
												</span>
											{/if}
										</div>
										<span class="timeline-time">{formatEventTime(ev.at)}</span>
										{#if ev.actor}
											<span class="timeline-actor">{ev.actor}</span>
										{/if}
										{#if ev.detail}
											<p class="timeline-detail">{scrub(ev.detail)}</p>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
					{/if}
				</div>

				{#if shown?.recruitInfo}
					<div class="card">
						<h5>Application Responses</h5>
						{#each Object.entries(shown.recruitInfo) as [key, value]}
							<div class="response-item">
								<span class="response-key">{questionLabels[key] ?? key}</span>
								<p
									class="response-value"
									class:response-hidden={shown.redactedQuestionIds.includes(key)}
								>
									{value}
								</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right: Round 2 + comments -->
			<div class="candidate-comments">
				<div class="card">
					<h5>Round 2</h5>
					<label class="pick-line">
						<input
							type="checkbox"
							checked={!!pick}
							disabled={round2Saving || orgId === null}
							on:change={(e) => togglePick(e.currentTarget.checked)}
						/>
						<span>
							Second interview{appTeam?.name ? ` with ${appTeam.name}` : ''}
							{#if pick}<span class="meta">· picked by {pick.picked_by_email}</span>{/if}
						</span>
					</label>

					<span class="field-label">Your readiness rating (1–10)</span>
					{#each ['blind', 'informed'] as const as pass (pass)}
						<div class="readiness-row">
							<span class="readiness-label">{READINESS_PASS_LABELS[pass]}</span>
							<div class="readiness-scale">
								{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n (n)}
									<button
										class="scale-btn"
										class:active={readiness?.mine[pass] === n}
										disabled={round2Saving || !myUserId}
										on:click={() => rateReadiness(pass, n)}>{n}</button
									>
								{/each}
							</div>
							<span class="meta">
								Everyone: {readiness?.[pass].average != null
									? `${readiness[pass].average?.toFixed(1)} (${readiness[pass].count})`
									: '—'}
							</span>
						</div>
					{/each}
					<p class="meta">
						"Without scores" means before looking at interview scores — the
						<a
							href="/private/{slug}/candidates/readiness?job={applicant.job}&team={applicant.team_id}&pass=blind"
							>readiness review</a
						> hides them for you.
					</p>
					{#if round2Error}
						<div class="alert-soft alert-error">{round2Error}</div>
					{/if}
				</div>

				<div class="card">
					<h5>Comments ({commentsArray.length})</h5>

					{#if commentsArray.length > 0}
						<div class="comment-list">
							{#each commentsArray as comment}
								<div class="comment-item">
									<div class="comment-header">
										<strong>{comment.email}</strong>
										<span
											class="comment-decision"
											style="background-color: {getStatusColor(comment.decision.toLowerCase())};"
										>
											{comment.decision}
										</span>
									</div>
									<p class="comment-text">{scrub(comment.comment)}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="muted">No comments yet.</p>
					{/if}

					<div class="add-comment">
						<textarea
							bind:value={newComment}
							placeholder="Add a comment..."
							class="form-control"
							rows="3"></textarea>
						<div style="display: flex; gap: 10px; align-items: center; margin-top: 8px;">
							<select bind:value={newStatus} class="form-control" style="max-width: 150px;">
								<option value="pending">Pending</option>
								<option value="interview">Interview</option>
								<option value="accepted">Accepted</option>
								<option value="denied">Denied</option>
							</select>
							<button on:click={handleAddComment} class="btn btn-tertiary">Add Comment</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<p>Applicant not found.</p>
	{/if}
</div>

<style lang="scss">
	@use '../../../../../styles/col.scss' as *;

	.candidate-page {
		min-height: 100vh;
		background-color: $surface-sunken;
		padding: 20px 30px;
	}

	/* Review voting */
	.vote-counts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 6px;
	}
	.vote-weighted {
		font-size: 11px;
		color: $text-muted;
	}
	.vote-actions {
		display: flex;
		gap: 8px;
	}
	.vote-btn {
		font-size: 12px !important;
		padding: 5px 14px !important;
		border: none;
		color: $surface;
		font-weight: 700;
	}
	.approve-btn {
		background-color: $success;
	}
	.reject-btn {
		background-color: $danger;
	}
	.blind-note {
		font-size: 11px;
		color: $info;
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.response-hidden {
		color: $text-muted;
		font-style: italic;
	}

	.timeline {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	.timeline-item {
		display: flex;
		gap: 12px;
		position: relative;
		padding-bottom: 16px;
	}
	/* Connector line down the left rail, stopping at the last entry. */
	.timeline-item:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 11px;
		top: 24px;
		bottom: 0;
		width: 2px;
		background-color: $border;
	}
	.timeline-marker {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: $surface;
		font-size: 10px;
		z-index: 1;
	}
	.timeline-body {
		flex: 1;
		min-width: 0;
	}
	.timeline-head {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.timeline-title {
		font-size: 13px;
		font-weight: 700;
		color: $text;
	}
	.timeline-tag {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 1px 8px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.timeline-time {
		font-size: 11px;
		color: $text-muted;
		display: block;
	}
	.timeline-actor {
		font-size: 11px;
		color: $text-muted;
		display: block;
	}
	.timeline-detail {
		font-size: 12px;
		color: $text;
		margin: 4px 0 0;
		white-space: pre-wrap;
	}
	.candidate-header {
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.pick-line {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 12px;
		cursor: pointer;
		input {
			width: 16px;
			height: 16px;
		}
		.meta {
			font-weight: 400;
		}
	}
	.readiness-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 6px 0 10px;
	}
	.readiness-label {
		font-size: 12px;
		font-weight: 700;
		color: $text;
	}
	.readiness-scale {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.scale-btn {
		width: 28px;
		height: 28px;
		border: 1px solid $border-strong;
		border-radius: $radius-sm;
		background-color: $surface;
		font-size: 12px;
		font-weight: 700;
		color: $text;
		cursor: pointer;
		&:hover:not(:disabled) {
			border-color: $yellow-secondary;
		}
		&.active {
			background-color: $yellow-primary;
			border-color: $yellow-secondary;
		}
		&:disabled {
			cursor: default;
			opacity: 0.6;
		}
	}
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: $text-muted;
		font-size: 13px;
		font-weight: 600;
	}
	.back-btn:hover {
		color: $text;
	}

	.candidate-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	@media (max-width: 799px) {
		.candidate-layout {
			grid-template-columns: 1fr;
		}
	}

	.meta {
		font-size: 13px;
		color: $text-muted;
		margin: 2px 0;
	}
	.status-badge {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.response-item {
		margin-bottom: 12px;
	}
	.response-key {
		font-size: 12px;
		font-weight: 700;
		color: $text-muted;
	}
	.team-line {
		margin: 8px 0 0;
	}
	/* Deliberately understated: a sibling application is a navigation aid, not
	   part of this candidate's identity here. */
	.sibling-note {
		font-size: 11px;
		color: $text-subtle;
		margin: 6px 0 0;
	}
	.sibling-note a {
		color: $text-muted;
		text-decoration: underline;
	}
	.sibling-note a:hover {
		color: $text;
	}
	.response-value {
		font-size: 14px;
		margin: 4px 0 0;
	}

	.comment-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 15px;
	}
	.comment-item {
		padding: 10px;
		background-color: $surface-sunken;
		border-radius: $radius-sm;
	}
	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		margin-bottom: 4px;
	}
	.comment-decision {
		font-size: 9px;
		font-weight: 700;
		color: $surface;
		padding: 1px 6px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.comment-text {
		font-size: 13px;
		margin: 0;
	}
	.add-comment {
		margin-top: 15px;
		padding-top: 15px;
		border-top: 1px solid $border;
	}

	.interviews-meta {
		margin-bottom: 12px;
	}
	.score-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 14px;
	}
	.score-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 8px 10px;
		border: 1px solid $border;
		border-radius: $radius-sm;
		min-width: 110px;
	}
	.score-big {
		font-size: 15px;
		padding: 3px 10px;
	}
	.score-cap {
		font-size: 11px;
		color: $text-muted;
	}
</style>
