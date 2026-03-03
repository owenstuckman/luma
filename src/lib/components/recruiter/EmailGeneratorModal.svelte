<script lang="ts">
  import type { Interview, Applicant, JobPosting, OrgMember } from '$lib/types';
  import { generateApplicantEmails, generateInterviewerEmails } from '$lib/email/generate';
  import type { RecipientEmail } from '$lib/email/generate';
  import { buildICSFile, downloadICS, downloadICSZip } from '$lib/email/ics';
  import type { ICSEventParams } from '$lib/email/ics';

  export let interviews: Interview[];
  export let applicants: Applicant[];
  export let orgMembers: (OrgMember & { email: string })[];
  export let jobs: JobPosting[];
  export let orgName: string;
  export let orgId: number | null = null;
  export let slug: string = '';
  export let onClose: () => void;

  // ── Send state ───────────────────────────────────────────────────────────
  let sending = false;
  let sendResult: { sent: number; failed: number; errors: string[]; dryRun?: boolean; message?: string; wouldSend?: { applicants: number; interviewers: number } } | null = null;
  let sendError = '';

  async function sendEmails(recipientType: 'applicants' | 'interviewers' | 'both') {
    if (!orgId || !slug) {
      sendError = 'Missing org context. Reload the page and try again.';
      return;
    }
    sending = true;
    sendResult = null;
    sendError = '';
    try {
      const resp = await fetch(`/private/${slug}/schedule/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, recipientType })
      });
      const data = await resp.json();
      if (!resp.ok) {
        sendError = data.message ?? data.error ?? `Server error ${resp.status}`;
      } else {
        sendResult = data;
      }
    } catch (e: unknown) {
      sendError = e instanceof Error ? e.message : 'Network error';
    }
    sending = false;
  }

  type Tab = 'applicants' | 'interviewers';
  let activeTab: Tab = 'applicants';

  $: applicantEmails = generateApplicantEmails(interviews, applicants, jobs, orgName);
  $: interviewerEmails = generateInterviewerEmails(interviews, orgMembers, applicants, jobs, orgName);

  // Per-card editable state: store overrides indexed by recipient email
  let subjectOverrides: Record<string, string> = {};
  let textOverrides: Record<string, string> = {};

  // Reset overrides when interviews change
  $: {
    interviews;
    subjectOverrides = {};
    textOverrides = {};
  }

  function getSubject(email: RecipientEmail): string {
    return subjectOverrides[email.to] ?? email.subject;
  }
  function getText(email: RecipientEmail): string {
    return textOverrides[email.to] ?? email.text;
  }

  // Copy state: track which card recently copied
  let recentlyCopied: Record<string, boolean> = {};

  async function copyEmail(email: RecipientEmail) {
    const body = `To: ${email.to}\nSubject: ${getSubject(email)}\n\n${getText(email)}`;
    await navigator.clipboard.writeText(body);
    recentlyCopied = { ...recentlyCopied, [email.to]: true };
    setTimeout(() => {
      recentlyCopied = { ...recentlyCopied, [email.to]: false };
    }, 1500);
  }

  async function copyAllBodies(emails: RecipientEmail[]) {
    const combined = emails
      .map(e => `To: ${e.to}\nSubject: ${getSubject(e)}\n\n${getText(e)}`)
      .join('\n\n' + '─'.repeat(60) + '\n\n');
    await navigator.clipboard.writeText(combined);
    recentlyCopied = { ...recentlyCopied, __all__: true };
    setTimeout(() => {
      recentlyCopied = { ...recentlyCopied, __all__: false };
    }, 1500);
  }

  $: activeEmails = activeTab === 'applicants' ? applicantEmails : interviewerEmails;

  // ── ICS helpers ──────────────────────────────────────────────────────────

  function lookupApplicantName(email: string): string {
    return applicants.find((a) => a.email === email)?.name ?? email;
  }

  function lookupJobTitle(jobId: number | null): string {
    if (!jobId) return 'Interview';
    return jobs.find((j) => j.id === jobId)?.name ?? 'Interview';
  }

  function safeFilename(email: string): string {
    return email.replace('@', '_at_').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  function buildApplicantEvents(applicantEmail: string): ICSEventParams[] {
    // Deduplicate by (startTime, location) — group interviews create multiple rows per slot
    const seen = new Set<string>();
    return interviews
      .filter((iv) => iv.applicant === applicantEmail)
      .filter((iv) => {
        const key = `${iv.startTime}|${iv.location}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((iv) => ({
        uid: `${iv.id}-applicant@luma`,
        dtStart: iv.startTime,
        dtEnd: iv.endTime ?? null,
        summary: `Interview – ${lookupJobTitle(iv.job)} @ ${orgName}`,
        description: `Format: ${iv.type === 'group' ? 'Group Interview' : 'Individual Interview'}\nLocation: ${iv.location || 'TBD'}`,
        location: iv.location || ''
      }));
  }

  function buildInterviewerEvents(interviewerEmail: string): ICSEventParams[] {
    return interviews
      .filter((iv) => iv.interviewer === interviewerEmail)
      .map((iv) => {
        const applicantName = lookupApplicantName(iv.applicant ?? '');
        return {
          uid: `${iv.id}-interviewer@luma`,
          dtStart: iv.startTime,
          dtEnd: iv.endTime ?? null,
          summary: `Interview with ${applicantName} – ${lookupJobTitle(iv.job)}`,
          description: `Applicant: ${iv.applicant || 'TBD'}\nFormat: ${iv.type === 'group' ? 'Group Interview' : 'Individual Interview'}\nLocation: ${iv.location || 'TBD'}`,
          location: iv.location || ''
        };
      });
  }

  function downloadRecipientICS(recipientEmail: string): void {
    const events =
      activeTab === 'applicants'
        ? buildApplicantEvents(recipientEmail)
        : buildInterviewerEvents(recipientEmail);
    const content = buildICSFile(events);
    downloadICS(`${safeFilename(recipientEmail)}.ics`, content);
  }

  let downloadingZip = false;

  async function downloadAllICSZip(): Promise<void> {
    downloadingZip = true;
    const folder = activeTab === 'applicants' ? 'applicants' : 'interviewers';
    const files = activeEmails.map((e) => ({
      filename: `${folder}/${safeFilename(e.to)}.ics`,
      content: buildICSFile(
        activeTab === 'applicants' ? buildApplicantEvents(e.to) : buildInterviewerEvents(e.to)
      )
    }));
    const zipName = `${orgName.replace(/\s+/g, '-')}-${folder}-invites.zip`;
    await downloadICSZip(files, zipName);
    downloadingZip = false;
  }
</script>

<div
  class="modal-overlay"
  on:click={onClose}
  on:keydown={(e) => e.key === 'Escape' && onClose()}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation>

    <div class="modal-header">
      <h6>Generate Notification Emails</h6>
      <button class="modal-close" on:click={onClose}>×</button>
    </div>

    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === 'applicants'}
        on:click={() => activeTab = 'applicants'}
      >
        Applicants <span class="tab-count">{applicantEmails.length}</span>
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'interviewers'}
        on:click={() => activeTab = 'interviewers'}
      >
        Interviewers <span class="tab-count">{interviewerEmails.length}</span>
      </button>
    </div>

    {#if activeEmails.length === 0}
      <p class="empty-state">No interviews loaded. Schedule interviews first.</p>
    {:else}
      <div class="email-list">
        {#each activeEmails as email (email.to)}
          <details class="email-card" open>
            <summary class="card-summary">
              <span class="to-label">To:</span>
              <span class="to-email">{email.to}</span>
              <button
                class="btn btn-sm ics-btn"
                on:click|stopPropagation={() => downloadRecipientICS(email.to)}
                title="Download calendar invite (.ics)"
              >
                <i class="fi fi-br-calendar-download"></i> .ics
              </button>
              <button
                class="btn btn-sm copy-btn"
                class:copied={recentlyCopied[email.to]}
                on:click|stopPropagation={() => copyEmail(email)}
              >
                {#if recentlyCopied[email.to]}
                  <i class="fi fi-br-check"></i> Copied
                {:else}
                  <i class="fi fi-br-copy-alt"></i> Copy
                {/if}
              </button>
            </summary>

            <div class="card-body">
              <label class="field-label">Subject</label>
              <input
                class="form-control form-control-sm subject-input"
                value={getSubject(email)}
                on:input={(e) => { subjectOverrides[email.to] = (e.target as HTMLInputElement).value; }}
              />
              <label class="field-label" style="margin-top: 10px;">Body</label>
              <textarea
                class="form-control body-textarea"
                value={getText(email)}
                on:input={(e) => { textOverrides[email.to] = (e.target as HTMLTextAreaElement).value; }}
                rows={getText(email).split('\n').length + 1}
              ></textarea>
            </div>
          </details>
        {/each}
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-sm btn-secondary"
          on:click={() => copyAllBodies(activeEmails)}
        >
          {#if recentlyCopied['__all__']}
            <i class="fi fi-br-check"></i> All Copied
          {:else}
            <i class="fi fi-br-copy-alt"></i> Copy All ({activeEmails.length})
          {/if}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          on:click={downloadAllICSZip}
          disabled={downloadingZip}
          title="Download all calendar invites as a ZIP file"
        >
          {#if downloadingZip}
            <i class="fi fi-br-spinner"></i> Zipping...
          {:else}
            <i class="fi fi-br-download"></i> Download All .ics (ZIP)
          {/if}
        </button>
        {#if orgId && slug}
          <button
            class="btn btn-sm btn-primary send-btn"
            on:click={() => sendEmails(activeTab)}
            disabled={sending}
            title="Send emails via Resend (requires RESEND_API_KEY)"
          >
            {#if sending}
              <i class="fi fi-br-spinner"></i> Sending...
            {:else}
              <i class="fi fi-br-paper-plane"></i> Send {activeTab === 'applicants' ? 'Applicant' : 'Interviewer'} Emails
            {/if}
          </button>
        {/if}
        <span class="footer-hint">Each email is editable before copying.</span>
      </div>

      {#if sendResult}
        <div class="send-result" class:has-errors={sendResult.failed > 0}>
          {#if sendResult.dryRun}
            <i class="fi fi-br-info"></i>
            {sendResult.message} — would send to {sendResult.wouldSend?.applicants ?? 0} applicants and {sendResult.wouldSend?.interviewers ?? 0} interviewers.
          {:else}
            <i class="fi fi-br-check"></i>
            Sent <strong>{sendResult.sent}</strong> email{sendResult.sent === 1 ? '' : 's'}.
            {#if sendResult.failed > 0}
              <strong>{sendResult.failed}</strong> failed.
              {#each sendResult.errors as err}
                <span class="send-error-line">{err}</span>
              {/each}
            {/if}
          {/if}
        </div>
      {/if}

      {#if sendError}
        <div class="send-result has-errors">
          <i class="fi fi-br-cross-circle"></i> {sendError}
        </div>
      {/if}
    {/if}

  </div>
</div>

<style lang="scss">
  @use '../../../styles/col.scss' as *;

  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex; justify-content: center; align-items: center;
    z-index: 1000;
  }
  .modal-content {
    background-color: white;
    border-radius: 10px;
    padding: 24px;
    width: min(700px, 95vw);
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    h6 { margin: 0; }
  }
  .modal-close {
    background: none; border: none; font-size: 20px; cursor: pointer;
    color: $light-tertiary; line-height: 1;
    &:hover { color: $dark-primary; }
  }

  /* Tabs */
  .tab-bar {
    display: flex;
    gap: 4px;
    border-bottom: 2px solid #f1f5f9;
    padding-bottom: 0;
  }
  .tab-btn {
    background: none;
    border: none;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    color: $light-tertiary;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: color 0.15s;
    &:hover { color: $dark-primary; }
    &.active {
      color: $dark-primary;
      border-bottom-color: $dark-primary;
    }
  }
  .tab-count {
    background: #f1f5f9;
    color: $light-secondary;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }

  /* Email cards */
  .email-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    flex: 1;
  }
  .email-card {
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    background: white;
    overflow: hidden;
  }
  .card-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    cursor: pointer;
    list-style: none;
    font-size: 13px;
    background: #f8fafc;
    border-radius: 8px;
    user-select: none;

    &::-webkit-details-marker { display: none; }

    &::before {
      content: '▶';
      font-size: 9px;
      color: $light-tertiary;
      transition: transform 0.15s;
      flex-shrink: 0;
    }
  }
  details[open] .card-summary::before {
    transform: rotate(90deg);
  }
  .to-label {
    font-weight: 700;
    color: $light-tertiary;
    flex-shrink: 0;
  }
  .to-email {
    font-family: monospace;
    font-size: 13px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ics-btn {
    flex-shrink: 0;
    font-size: 12px;
    padding: 3px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    color: #4f46e5;
    border-color: #c7d2fe;
    background-color: #eef2ff;
    &:hover {
      background-color: #e0e7ff;
      border-color: #a5b4fc;
    }
  }
  .copy-btn {
    flex-shrink: 0;
    font-size: 12px;
    padding: 3px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background-color 0.15s;

    &.copied {
      background-color: #ecfdf5;
      color: #065f46;
      border-color: #6ee7b7;
    }
  }
  .card-body {
    padding: 12px 14px 14px;
  }
  .field-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: $light-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }
  .subject-input {
    font-size: 13px;
  }
  .body-textarea {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }

  /* Footer */
  .modal-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
    border-top: 1px solid #f1f5f9;
  }
  .footer-hint {
    font-size: 11px;
    color: $light-tertiary;
  }

  .empty-state {
    color: $light-tertiary;
    font-size: 13px;
    text-align: center;
    padding: 24px 0;
  }

  .send-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .send-result {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    background-color: #ecfdf5;
    color: #065f46;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    flex-wrap: wrap;

    &.has-errors {
      background-color: #fef2f2;
      color: #991b1b;
    }
  }

  .send-error-line {
    display: block;
    font-family: monospace;
    font-size: 11px;
    margin-top: 2px;
    opacity: 0.85;
  }
</style>
