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
		sessionLabel,
		resolveApplicationTeam
	} from '$lib/utils/candidates';
	import type {
		TimelineEvent,
		TimelineKind,
		SubmissionSibling,
		InterviewLite,
		InterviewSession
	} from '$lib/utils/candidates';
	import {
		averageByPrompt,
		averageScore,
		questionText,
		UNIVERSAL_Q1,
		UNIVERSAL_Q2
	} from '$lib/utils/interviewForms';
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
	$: blinded = shouldBlind(viewerRoles, thresholds);
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

	const fmtScore = (n: number | null) => (n === null ? '—' : n.toFixed(1));
	/** Tone for a 1-10 value: the form's scale is 1/3/5/7/10. */
	const scoreTone = (n: number | null) =>
		n === null ? 'pill-neutral' : n >= 7 ? 'pill-success' : n >= 5 ? 'pill-warning' : 'pill-danger';

	function sessionWhen(session: InterviewSession): string {
		const start = new Date(session.start_time);
		const day = start.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		const time = (d: Date) =>
			d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return session.end_time
			? `${day}, ${time(start)} – ${time(new Date(session.end_time))}`
			: `${day}, ${time(start)}`;
	}

	onMount(async () => {
		const urlParams = new URLSearchParams(window.location.search);
		const id = Number(urlParams.get('id'));

		if (id) {
			try {
				const data = await getApplicantData(id);
				if (data && data.length > 0) {
					applicant = data[0];
					commentsArray = applicant.comments?.comments || [];
				}
			} catch (error) {
				console.error('Failed to load applicant data:', error);
			}

			// Fetch interviews for this applicant to show evaluation summary
			if (applicant?.email) {
				const { data: orgData } = await supabase
					.from('organizations')
					.select('id, settings')
					.eq('slug', slug)
					.single();

				if (orgData) {
					orgSettings = readOrgSettings(orgData.settings);
					myEmail = ((await getCurrentUserEmail()) as string) ?? '';

					// Reviewer weights + this viewer's roles drive weighted scoring
					// and whether the record is blinded. Weights must key by real
					// email, since that is what comments record — hence the RPC
					// rather than a plain `org_members` select (which only has user_id).
					const members = await getOrgMembersWithEmail(orgData.id);
					reviewerWeights = buildWeightMap(members);

					const me = await getUserRoleInOrg(orgData.id);
					viewerRoles = me ? [...(me.roles ?? []), me.role].filter(Boolean) : [];

					// The job's schema tells us which answers are marked `blinded`.
					if (applicant.job) {
						const { data: jobRow } = await supabase
							.from('job_posting')
							.select('questions')
							.eq('id', applicant.job)
							.single();
						jobSchema = jobRow?.questions ?? null;
					}

					teams = await getTeams(orgData.id);

					try {
						siblings = await getSubmissionSiblings(orgData.id, applicant);
					} catch (error) {
						console.error('Failed to load sibling applications:', error);
					}

					interviews = await getPersonInterviews(orgData.id, applicant);

					try {
						timeline = await getCandidateTimeline(orgData.id, applicant);
					} catch (error) {
						console.error('Failed to load candidate timeline:', error);
					}
				}
			}
		}
		timelineLoading = false;
		loading = false;
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

	function getRecommendationLabel(rec: string): string {
		switch (rec) {
			case 'strong_yes':
				return 'Strong Yes';
			case 'yes':
				return 'Yes';
			case 'neutral':
				return 'Neutral';
			case 'no':
				return 'No';
			case 'strong_no':
				return 'Strong No';
			default:
				return rec;
		}
	}

	function getRecommendationColor(rec: string): string {
		switch (rec) {
			case 'strong_yes':
				return '#16a34a';
			case 'yes':
				return '#22c55e';
			case 'neutral':
				return '#878fa1';
			case 'no':
				return '#f59e0b';
			case 'strong_no':
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
	</div>

	{#if loading}
		<p>Loading...</p>
	{:else if applicant}
		<div class="candidate-layout">
			<!-- Left: Applicant info -->
			<div class="candidate-info">
				<div class="card">
					<div style="display: flex; justify-content: space-between; align-items: center;">
						<h5 style="margin: 0;">{shown?.name ?? applicant.name}</h5>
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
					{#if blinded}
						<p class="blind-note">
							<i class="fi fi-br-eye-crossed"></i>
							Blinded review — identifying details are hidden. Advisors and admins see the full record.
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
							<div class="score-tile">
								<span class="pill {scoreTone(overall.average)} score-big"
									>{fmtScore(overall.average)}</span
								>
								<span class="score-cap">Overall /10 · {overall.count} scored</span>
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

						{#each sessions as session (session.key)}
							{@const form = session.type === 'group' ? 'group' : 'individual'}
							{@const panel = averageByPrompt(
								session.entries.map((e) => e.evaluation),
								form
							)}
							<div class="session">
								<div class="session-head">
									<span class="session-title">{sessionLabel(session.type)}</span>
									<span class="session-when"
										>{sessionWhen(session)}{session.location ? ` · ${session.location}` : ''}</span
									>
								</div>

								{#if session.entries.length > 1 && panel.some((q) => q.count > 0)}
									<div class="rating-list panel-avg">
										<span class="eval-label">Panel average</span>
										{#each panel as q (q.key)}
											<div class="rating-row">
												<span class="rating-label">{q.label}</span>
												<span class="pill {scoreTone(q.average)}">{fmtScore(q.average)}</span>
											</div>
										{/each}
									</div>
								{/if}

								{#each session.entries as entry (entry.interview.id)}
									{@const ev = entry.evaluation}
									<div class="eval-item">
										<div class="eval-item-header">
											<span class="eval-interviewer">
												{ev?.evaluator || entry.interview.interviewer || 'Unknown'}
											</span>
											{#if ev}
												<span class="pill {scoreTone(entry.score)}"
													>{entry.score === null
														? 'Not scored'
														: `${entry.score.toFixed(1)}/10`}</span
												>
											{:else}
												<span class="pill pill-neutral">Not evaluated yet</span>
											{/if}
										</div>

										{#if ev && ev.form !== 'legacy'}
											<div class="rating-list">
												{#each averageByPrompt([ev], ev.form) as q (q.key)}
													<div class="rating-row">
														<span class="rating-label">{q.label}</span>
														<span class="pill {scoreTone(q.average)}"
															>{q.average === null ? '—' : q.average}</span
														>
													</div>
												{/each}
											</div>

											{#if ev.form === 'individual'}
												<div class="asked">
													<span class="eval-label">Questions asked</span>
													<ul class="asked-list">
														<li>{UNIVERSAL_Q1}</li>
														<li>{UNIVERSAL_Q2}</li>
														{#each [...ev.successQuestions, ...ev.failureQuestions] as id (id)}
															<li>{questionText(id)}</li>
														{/each}
													</ul>
													{#if ev.otherQuestions.trim()}
														<span class="eval-label">Other questions</span>
														<p class="eval-text pre">{ev.otherQuestions}</p>
													{/if}
												</div>
											{/if}

											{#if ev.notes.trim()}
												<span class="eval-label">Notes</span>
												<p class="eval-text pre">{ev.notes}</p>
											{/if}
										{:else if ev && ev.form === 'legacy'}
											<div class="star-row">
												{#each [1, 2, 3, 4, 5] as star (star)}
													<span class="star" class:filled={ev.rating >= star}>&#9733;</span>
												{/each}
												{#if ev.recommendation}
													<span
														class="rec-pill"
														style="background-color: {getRecommendationColor(ev.recommendation)};"
													>
														{getRecommendationLabel(ev.recommendation)}
													</span>
												{/if}
											</div>
											{#if ev.strengths}
												<p class="eval-text pre"><strong>+</strong> {ev.strengths}</p>
											{/if}
											{#if ev.weaknesses}
												<p class="eval-text pre"><strong>−</strong> {ev.weaknesses}</p>
											{/if}
											{#if ev.notes}
												<p class="eval-text pre eval-text-muted">{ev.notes}</p>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{/each}
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
											<p class="timeline-detail">{ev.detail}</p>
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

			<!-- Right: Comments -->
			<div class="candidate-comments">
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
									<p class="comment-text">{comment.comment}</p>
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

	/* Evaluation summary */
	.eval-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.eval-label {
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.star-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.star {
		font-size: 16px;
		color: $border-strong;
	}
	.star.filled {
		color: $yellow-primary;
	}
	.rating-num {
		font-size: 13px;
		font-weight: 700;
		color: $text;
		margin-left: 6px;
	}
	.rec-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.rec-pill {
		font-size: 10px;
		font-weight: 700;
		color: $surface;
		padding: 2px 8px;
		border-radius: $radius-pill;
	}
	.eval-list {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.eval-item {
		padding: 10px;
		background-color: $surface-sunken;
		border-radius: $radius-sm;
	}
	.eval-item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}
	.eval-interviewer {
		font-size: 12px;
		font-weight: 700;
		color: $text;
	}
	.eval-text {
		font-size: 12px;
		color: $text;
		margin: 3px 0 0;
	}
	.eval-text-muted {
		color: $text-muted;
	}
	.pre {
		white-space: pre-wrap;
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
	.session {
		border-top: 1px solid $border-faint;
		padding-top: 12px;
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.session-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 8px;
	}
	.session-title {
		font-size: 14px;
		font-weight: 700;
		color: $text;
	}
	.session-when {
		font-size: 12px;
		color: $text-muted;
	}
	.rating-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 6px 0;
	}
	.panel-avg {
		padding: 8px 10px;
		border: 1px dashed $border;
		border-radius: $radius-sm;
		margin: 0;
	}
	.rating-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: $text;
	}
	.asked {
		margin: 6px 0;
	}
	.asked-list {
		margin: 4px 0 6px;
		padding-left: 18px;
		font-size: 12px;
		color: $text;
	}
</style>
