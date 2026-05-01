<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase, getApplicantData, addComment, getCurrentUserEmail, updateApplicantStatus } from '$lib/utils/supabase';
  import type { Applicant, CommentEntry } from '$lib/types';

  interface Evaluation {
    rating: number;
    strengths: string;
    weaknesses: string;
    notes: string;
    recommendation: string;
    evaluator: string;
    evaluatedAt: string;
  }

  interface InterviewWithEval {
    id: number;
    interviewer: string | null;
    start_time: string;
    comments: Record<string, unknown> | null;
  }

  let applicant: Applicant | null = null;
  let commentsArray: CommentEntry[] = [];
  let newComment = '';
  let newStatus = 'pending';
  let loading = true;
  let interviews: InterviewWithEval[] = [];

  $: slug = $page.params.slug;

  $: evaluations = interviews
    .filter(iv => iv.comments && (iv.comments as Record<string, unknown>).evaluation)
    .map(iv => ({
      interviewer: iv.interviewer,
      interviewTime: iv.start_time,
      eval: (iv.comments as Record<string, unknown>).evaluation as Evaluation,
    }));

  $: avgRating = evaluations.length > 0
    ? evaluations.reduce((sum, e) => sum + (e.eval.rating || 0), 0) / evaluations.length
    : 0;

  $: recommendationCounts = evaluations.reduce<Record<string, number>>((acc, e) => {
    const r = e.eval.recommendation || 'neutral';
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

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
          .select('id')
          .eq('slug', slug)
          .single();

        if (orgData) {
          const { data: ivData } = await supabase
            .from('interviews')
            .select('id, interviewer, start_time, comments')
            .eq('org_id', orgData.id)
            .eq('applicant', applicant.email);
          interviews = (ivData || []) as InterviewWithEval[];
        }
      }
    }
    loading = false;
  });

  const handleAddComment = async () => {
    if (!newComment.trim() || !applicant) return;
    try {
      const email = (await getCurrentUserEmail()) as string;
      const newID = commentsArray.length > 0 ? commentsArray[commentsArray.length - 1].id + 1 : 1;
      await addComment(applicant.id, newID, newComment, email, newStatus);
      commentsArray = [...commentsArray, { id: newID, email, comment: newComment, decision: newStatus }];
      newComment = '';
      newStatus = 'pending';
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

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
      case 'pending': return '#878fa1';
      case 'interview': return '#3b82f6';
      case 'accepted': return '#22c55e';
      case 'denied': return '#ef4444';
      default: return '#878fa1';
    }
  }

  function getRecommendationLabel(rec: string): string {
    switch (rec) {
      case 'strong_yes': return 'Strong Yes';
      case 'yes': return 'Yes';
      case 'neutral': return 'Neutral';
      case 'no': return 'No';
      case 'strong_no': return 'Strong No';
      default: return rec;
    }
  }

  function getRecommendationColor(rec: string): string {
    switch (rec) {
      case 'strong_yes': return '#16a34a';
      case 'yes': return '#22c55e';
      case 'neutral': return '#878fa1';
      case 'no': return '#f59e0b';
      case 'strong_no': return '#ef4444';
      default: return '#878fa1';
    }
  }

  const recommendationOrder = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'];
</script>

<div class="candidate-page">
  <div class="candidate-header">
    <a href="/private/{slug}/review" class="back-btn">
      <i class="fi fi-br-arrow-left"></i> Back to Review
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
            <h5 style="margin: 0;">{applicant.name}</h5>
            <span class="status-badge" style="background-color: {getStatusColor(applicant.status)};">
              {applicant.status}
            </span>
          </div>
          <p class="meta">{applicant.email}</p>
          <p class="meta">Applied {new Date(applicant.created_at).toLocaleDateString()}</p>

          <div style="margin-top: 12px;">
            <label style="font-size: 12px; font-weight: 600; color: #878fa1;">Change Status</label>
            <select class="form-control" style="max-width: 200px; margin-top: 4px;"
              value={applicant.status}
              on:change={(e) => handleStatusChange(e.currentTarget.value)}>
              <option value="pending">Pending</option>
              <option value="interview">Interview</option>
              <option value="accepted">Accepted</option>
              <option value="denied">Denied</option>
            </select>
          </div>
        </div>

        {#if applicant.recruitInfo}
          <div class="card">
            <h5>Application Responses</h5>
            {#each Object.entries(applicant.recruitInfo) as [key, value]}
              <div class="response-item">
                <span class="response-key">{key}</span>
                <p class="response-value">{value}</p>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Evaluation Summary -->
        {#if interviews.length > 0}
          <div class="card">
            <h5>Evaluation Summary</h5>
            <p class="meta" style="margin-bottom: 12px;">
              {evaluations.length} of {interviews.length} interview{interviews.length !== 1 ? 's' : ''} evaluated
            </p>

            {#if evaluations.length > 0}
              <!-- Average rating -->
              <div class="eval-row">
                <span class="eval-label">Avg Rating</span>
                <div class="star-row">
                  {#each [1, 2, 3, 4, 5] as star}
                    <span class="star" class:filled={avgRating >= star - 0.5}>&#9733;</span>
                  {/each}
                  <span class="rating-num">{avgRating.toFixed(1)}</span>
                </div>
              </div>

              <!-- Recommendation breakdown -->
              <div class="eval-row" style="margin-top: 10px;">
                <span class="eval-label">Recommendations</span>
                <div class="rec-pills">
                  {#each recommendationOrder as rec}
                    {#if recommendationCounts[rec]}
                      <span class="rec-pill" style="background-color: {getRecommendationColor(rec)};">
                        {getRecommendationLabel(rec)} &times;{recommendationCounts[rec]}
                      </span>
                    {/if}
                  {/each}
                </div>
              </div>

              <!-- Individual evaluations -->
              <div class="eval-list">
                {#each evaluations as ev}
                  <div class="eval-item">
                    <div class="eval-item-header">
                      <span class="eval-interviewer">{ev.interviewer || 'Unknown'}</span>
                      <span class="rec-pill" style="background-color: {getRecommendationColor(ev.eval.recommendation)};">
                        {getRecommendationLabel(ev.eval.recommendation)}
                      </span>
                    </div>
                    <div class="star-row" style="margin: 4px 0;">
                      {#each [1, 2, 3, 4, 5] as star}
                        <span class="star" class:filled={ev.eval.rating >= star}>&#9733;</span>
                      {/each}
                    </div>
                    {#if ev.eval.strengths}
                      <p class="eval-text"><strong>+</strong> {ev.eval.strengths}</p>
                    {/if}
                    {#if ev.eval.weaknesses}
                      <p class="eval-text"><strong>−</strong> {ev.eval.weaknesses}</p>
                    {/if}
                    {#if ev.eval.notes}
                      <p class="eval-text" style="color: #878fa1;">{ev.eval.notes}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <p style="color: #878fa1; font-size: 13px;">No evaluations submitted yet.</p>
            {/if}
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
                    <span class="comment-decision" style="background-color: {getStatusColor(comment.decision.toLowerCase())};">
                      {comment.decision}
                    </span>
                  </div>
                  <p class="comment-text">{comment.comment}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p style="color: #878fa1; font-size: 13px;">No comments yet.</p>
          {/if}

          <div class="add-comment">
            <textarea bind:value={newComment} placeholder="Add a comment..." class="form-control" rows="3"></textarea>
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
    background-color: $light-secondary;
    padding: 20px 30px;
  }
  .candidate-header {
    margin-bottom: 20px;
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: $light-tertiary;
    font-size: 13px;
    font-weight: 600;
  }
  .back-btn:hover { color: $dark-primary; }

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
    color: $light-tertiary;
    margin: 2px 0;
  }
  .status-badge {
    font-size: 10px;
    font-weight: 700;
    color: white;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .response-item {
    margin-bottom: 12px;
  }
  .response-key {
    font-size: 11px;
    font-weight: 700;
    color: $light-tertiary;
    text-transform: uppercase;
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
    background-color: $light-secondary;
    border-radius: 6px;
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
    color: white;
    padding: 1px 6px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .comment-text {
    font-size: 13px;
    margin: 0;
  }
  .add-comment {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #e5e7eb;
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
    color: $light-tertiary;
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
    color: #d1d5db;
  }
  .star.filled {
    color: #fbbf24;
  }
  .rating-num {
    font-size: 13px;
    font-weight: 700;
    color: $dark-primary;
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
    color: white;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .eval-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .eval-item {
    padding: 10px;
    background-color: $light-secondary;
    border-radius: 6px;
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
    color: $dark-primary;
  }
  .eval-text {
    font-size: 12px;
    color: $dark-primary;
    margin: 3px 0 0;
  }
</style>
