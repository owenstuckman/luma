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
      sendError = 'Missing org context — orgId or slug is not set. Make sure you selected an organization.';
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
      // Handle non-JSON responses (e.g. HTML error pages, Edge Function not deployed)
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await resp.text();
        sendError = resp.ok
          ? 'Unexpected response from server. The Edge Function may not be deployed.'
          : `Server error ${resp.status}: ${text.substring(0, 200)}`;
        sending = false;
        return;
      }
      const data = await resp.json();
      if (!resp.ok) {
        sendError = data.message ?? data.error ?? `Server error ${resp.status}. Ensure the notify-interviews Edge Function is deployed and RESEND_API_KEY is set.`;
      } else {
        sendResult = data;
      }
    } catch (e: unknown) {
      sendError = e instanceof Error ? e.message : 'Network error — could not reach the server.';
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

  // ── Selection state ───────────────────────────────────────────────────────
  let selectedEmails = new Set<string>();

  // Reset selection when tab changes
  $: {
    activeTab;
    selectedEmails = new Set();
  }

  $: allSelected = activeEmails.length > 0 && selectedEmails.size === activeEmails.length;

  function toggleSelectAll() {
    if (allSelected) {
      selectedEmails = new Set();
    } else {
      selectedEmails = new Set(activeEmails.map(e => e.to));
    }
  }

  function toggleSelect(email: string) {
    const next = new Set(selectedEmails);
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    selectedEmails = next;
  }

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

  async function downloadSelectedICSZip(): Promise<void> {
    const targets = selectedEmails.size > 0
      ? activeEmails.filter(e => selectedEmails.has(e.to))
      : activeEmails;
    if (targets.length === 0) return;

    downloadingZip = true;
    const folder = activeTab === 'applicants' ? 'applicants' : 'interviewers';
    const files = targets.map((e) => ({
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
  <div class="modal-box" on:click|stopPropagation on:keydown|stopPropagation>

    <!-- Sticky header -->
    <div class="modal-header">
      <h5 class="modal-title">Notification Emails</h5>
      <button class="close-btn" on:click={onClose} aria-label="Close">&times;</button>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === 'applicants'}
        on:click={() => activeTab = 'applicants'}
      >
        Applicants <span class="badge">{applicantEmails.length}</span>
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'interviewers'}
        on:click={() => activeTab = 'interviewers'}
      >
        Interviewers <span class="badge">{interviewerEmails.length}</span>
      </button>
    </div>

    {#if activeEmails.length === 0}
      <div class="empty-state">
        <i class="fi fi-br-inbox-in"></i>
        <p>No interviews loaded. Schedule interviews first.</p>
      </div>
    {:else}
      <!-- Toolbar: select all + bulk actions -->
      <div class="toolbar">
        <label class="select-all">
          <input
            type="checkbox"
            checked={allSelected}
            on:change={toggleSelectAll}
          />
          <span>Select all ({activeEmails.length})</span>
        </label>

        {#if selectedEmails.size > 0}
          <span class="sel-count">{selectedEmails.size} selected</span>
        {/if}

        <div class="toolbar-spacer"></div>

        <button
          class="toolbar-btn"
          on:click={downloadSelectedICSZip}
          disabled={downloadingZip}
          title={selectedEmails.size > 0 ? `Download ${selectedEmails.size} .ics files as ZIP` : 'Download all .ics files as ZIP'}
        >
          {#if downloadingZip}
            Zipping...
          {:else}
            <i class="fi fi-br-download"></i>
            Download {selectedEmails.size > 0 ? `${selectedEmails.size}` : 'All'} .ics
          {/if}
        </button>
      </div>

      <!-- Scrollable email list -->
      <div class="email-list">
        {#each activeEmails as email (email.to)}
          <details class="email-card">
            <summary class="card-header">
              <input
                type="checkbox"
                checked={selectedEmails.has(email.to)}
                on:click|stopPropagation={() => toggleSelect(email.to)}
                on:keydown|stopPropagation
              />
              <span class="card-chevron"></span>
              <span class="card-email">{email.to}</span>
              <div class="card-actions">
                <button
                  class="action-btn ics"
                  on:click|stopPropagation={() => downloadRecipientICS(email.to)}
                  title="Download .ics"
                >
                  .ics
                </button>
                <button
                  class="action-btn copy"
                  class:copied={recentlyCopied[email.to]}
                  on:click|stopPropagation={() => copyEmail(email)}
                >
                  {recentlyCopied[email.to] ? 'Copied' : 'Copy'}
                </button>
              </div>
            </summary>

            <div class="card-body">
              <label class="field-label">Subject</label>
              <input
                class="form-control form-control-sm"
                value={getSubject(email)}
                on:input={(e) => { subjectOverrides[email.to] = (e.target as HTMLInputElement).value; }}
              />
              <label class="field-label mt-2">Body</label>
              <textarea
                class="form-control body-textarea"
                value={getText(email)}
                on:input={(e) => { textOverrides[email.to] = (e.target as HTMLTextAreaElement).value; }}
                rows={Math.min(getText(email).split('\n').length + 1, 12)}
              ></textarea>
            </div>
          </details>
        {/each}
      </div>

      <!-- Sticky footer -->
      <div class="modal-footer">
        <div class="footer-row">
          <button
            class="footer-btn secondary"
            on:click={() => copyAllBodies(activeEmails)}
          >
            {recentlyCopied['__all__'] ? 'All Copied!' : `Copy All (${activeEmails.length})`}
          </button>

          {#if orgId && slug}
            <button
              class="footer-btn primary"
              on:click={() => sendEmails(activeTab)}
              disabled={sending}
            >
              {#if sending}
                Sending...
              {:else}
                Send {activeTab === 'applicants' ? 'Applicant' : 'Interviewer'} Emails ({activeEmails.length})
              {/if}
            </button>
          {/if}
        </div>

        {#if sendResult}
          <div class="result-banner" class:error={sendResult.failed > 0}>
            {#if sendResult.dryRun}
              {sendResult.message} — would send to {sendResult.wouldSend?.applicants ?? 0} applicants and {sendResult.wouldSend?.interviewers ?? 0} interviewers.
            {:else}
              Sent <strong>{sendResult.sent}</strong> email{sendResult.sent === 1 ? '' : 's'}.
              {#if sendResult.failed > 0}
                <strong>{sendResult.failed}</strong> failed.
                {#each sendResult.errors as err}
                  <span class="error-detail">{err}</span>
                {/each}
              {/if}
            {/if}
          </div>
        {/if}

        {#if sendError}
          <div class="result-banner error">{sendError}</div>
        {/if}
      </div>
    {/if}

  </div>
</div>

<style lang="scss">
  @use 'sass:color';
  @use '../../../styles/col.scss' as *;

  /* Overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 24px;
  }

  /* Modal box — fixed layout with sticky header/footer */
  .modal-box {
    background: white;
    border-radius: 12px;
    width: min(780px, 100%);
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  /* Header */
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px 14px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .modal-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: $dark-primary;
  }
  .close-btn {
    background: none;
    border: none;
    font-size: 22px;
    color: $light-tertiary;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
    &:hover { color: $dark-primary; }
  }

  /* Tabs */
  .tab-bar {
    display: flex;
    gap: 0;
    padding: 0 24px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .tab-btn {
    background: none;
    border: none;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
    color: $light-tertiary;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: color 0.15s, border-color 0.15s;
    &:hover { color: $dark-primary; }
    &.active {
      color: $dark-primary;
      border-bottom-color: $dark-primary;
    }
  }
  .badge {
    background: #f1f5f9;
    color: $light-tertiary;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
    .active & {
      background: $dark-primary;
      color: white;
    }
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    border-bottom: 1px solid #f1f5f9;
    flex-shrink: 0;
    background: #fafbfc;
  }
  .select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: $dark-primary;
    cursor: pointer;
    input { cursor: pointer; width: 15px; height: 15px; accent-color: $dark-primary; }
  }
  .sel-count {
    font-size: 11px;
    color: $light-tertiary;
    font-weight: 600;
  }
  .toolbar-spacer { flex: 1; }
  .toolbar-btn {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid #c7d2fe;
    background: #eef2ff;
    color: #4f46e5;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    &:hover { background: #e0e7ff; border-color: #a5b4fc; }
    &:disabled { opacity: 0.6; cursor: default; }
  }

  /* Scrollable email list */
  .email-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  /* Email cards */
  .email-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: white;
    transition: border-color 0.15s;
    &:hover { border-color: #d1d5db; }
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
    list-style: none;
    font-size: 13px;
    background: #fafbfc;
    user-select: none;
    &::-webkit-details-marker { display: none; }

    input[type="checkbox"] {
      width: 15px;
      height: 15px;
      accent-color: $dark-primary;
      cursor: pointer;
      flex-shrink: 0;
    }
  }
  .card-chevron {
    flex-shrink: 0;
    width: 10px;
    &::before {
      content: '▸';
      font-size: 11px;
      color: $light-tertiary;
    }
  }
  details[open] .card-chevron::before {
    content: '▾';
  }
  .card-email {
    flex: 1;
    font-family: monospace;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: $dark-primary;
  }
  .card-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .action-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid #e5e7eb;
    background: white;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;

    &.ics {
      color: #4f46e5;
      border-color: #c7d2fe;
      background: #eef2ff;
      &:hover { background: #e0e7ff; }
    }
    &.copy {
      color: $dark-primary;
      &:hover { background: #f3f4f6; }
      &.copied {
        background: #ecfdf5;
        color: #065f46;
        border-color: #6ee7b7;
      }
    }
  }

  .card-body {
    padding: 12px 14px 16px;
    border-top: 1px solid #f1f5f9;
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
  .mt-2 { margin-top: 10px; }
  .body-textarea {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    resize: vertical;
    min-height: 100px;
    line-height: 1.6;
  }

  /* Footer */
  .modal-footer {
    padding: 14px 24px 18px;
    border-top: 1px solid #e5e7eb;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .footer-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .footer-btn {
    font-size: 13px;
    font-weight: 600;
    padding: 8px 18px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;

    &.secondary {
      background: #f3f4f6;
      color: $dark-primary;
      border: 1px solid #e5e7eb;
      &:hover { background: #e5e7eb; }
    }
    &.primary {
      background: $dark-primary;
      color: white;
      &:hover { background: color.adjust($dark-primary, $lightness: 10%); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
  }

  .result-banner {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    background: #ecfdf5;
    color: #065f46;
    &.error {
      background: #fef2f2;
      color: #991b1b;
    }
  }
  .error-detail {
    display: block;
    font-family: monospace;
    font-size: 11px;
    margin-top: 2px;
    opacity: 0.85;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 24px;
    color: $light-tertiary;
    font-size: 13px;
    i { font-size: 28px; }
    p { margin: 0; }
  }
</style>
