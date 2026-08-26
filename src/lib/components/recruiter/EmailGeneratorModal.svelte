<script lang="ts">
	import type { Interview, Applicant, JobPosting, OrgMember } from '$lib/types';
	import { generateApplicantEmails, generateInterviewerEmails } from '$lib/email/generate';
	import type { RecipientEmail } from '$lib/email/generate';
	import { buildICSFile, downloadICS, downloadICSZip } from '$lib/email/ics';
	import type { ICSEventParams } from '$lib/email/ics';

	let {
		interviews,
		applicants,
		orgMembers,
		jobs,
		orgName,
		orgId = null,
		slug = '',
		onClose
	}: {
		interviews: Interview[];
		applicants: Applicant[];
		orgMembers: (OrgMember & { email: string })[];
		jobs: JobPosting[];
		orgName: string;
		orgId?: number | null;
		slug?: string;
		onClose: () => void;
	} = $props();

	// ── Send state ───────────────────────────────────────────────────────────
	let sending = $state(false);
	let sendResult = $state<{
		sent: number;
		failed: number;
		errors: string[];
		dryRun?: boolean;
		message?: string;
		wouldSend?: { applicants: number; interviewers: number };
	} | null>(null);
	let sendError = $state('');

	async function sendEmails(recipientType: 'applicants' | 'interviewers' | 'both') {
		if (!orgId || !slug) {
			sendError =
				'Missing org context — orgId or slug is not set. Make sure you selected an organization.';
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
				sendError =
					data.message ??
					data.error ??
					`Server error ${resp.status}. Ensure the notify-interviews Edge Function is deployed and RESEND_API_KEY is set.`;
			} else {
				sendResult = data;
			}
		} catch (e: unknown) {
			sendError = e instanceof Error ? e.message : 'Network error — could not reach the server.';
		}
		sending = false;
	}

	type Tab = 'applicants' | 'interviewers';
	let activeTab = $state<Tab>('applicants');

	const applicantEmails = $derived(generateApplicantEmails(interviews, applicants, jobs, orgName));
	const interviewerEmails = $derived(
		generateInterviewerEmails(interviews, orgMembers, applicants, jobs, orgName)
	);

	let subjectOverrides = $state<Record<string, string>>({});
	let textOverrides = $state<Record<string, string>>({});

	$effect(() => {
		interviews;
		subjectOverrides = {};
		textOverrides = {};
	});

	function getSubject(email: RecipientEmail): string {
		return subjectOverrides[email.to] ?? email.subject;
	}
	function getText(email: RecipientEmail): string {
		return textOverrides[email.to] ?? email.text;
	}

	let recentlyCopied = $state<Record<string, boolean>>({});

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
			.map((e) => `To: ${e.to}\nSubject: ${getSubject(e)}\n\n${getText(e)}`)
			.join('\n\n' + '─'.repeat(60) + '\n\n');
		await navigator.clipboard.writeText(combined);
		recentlyCopied = { ...recentlyCopied, __all__: true };
		setTimeout(() => {
			recentlyCopied = { ...recentlyCopied, __all__: false };
		}, 1500);
	}

	const activeEmails = $derived(activeTab === 'applicants' ? applicantEmails : interviewerEmails);

	let selectedEmails = $state(new Set<string>());

	$effect(() => {
		activeTab;
		selectedEmails = new Set();
	});

	const allSelected = $derived(
		activeEmails.length > 0 && selectedEmails.size === activeEmails.length
	);

	function toggleSelectAll() {
		if (allSelected) {
			selectedEmails = new Set();
		} else {
			selectedEmails = new Set(activeEmails.map((e) => e.to));
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
				const key = `${iv.start_time}|${iv.location}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.map((iv) => ({
				uid: `${iv.id}-applicant@luma`,
				dtStart: iv.start_time,
				dtEnd: iv.end_time ?? null,
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
					dtStart: iv.start_time,
					dtEnd: iv.end_time ?? null,
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

	function downloadAllAsSingleICS(): void {
		const targets =
			selectedEmails.size > 0 ? activeEmails.filter((e) => selectedEmails.has(e.to)) : activeEmails;
		if (targets.length === 0) return;

		const allEvents = targets.flatMap((e) =>
			activeTab === 'applicants' ? buildApplicantEvents(e.to) : buildInterviewerEvents(e.to)
		);
		const label = activeTab === 'applicants' ? 'applicants' : 'interviewers';
		downloadICS(`${orgName.replace(/\s+/g, '-')}-${label}-invites.ics`, buildICSFile(allEvents));
	}

	let downloadingZip = $state(false);

	async function downloadSelectedICSZip(): Promise<void> {
		const targets =
			selectedEmails.size > 0 ? activeEmails.filter((e) => selectedEmails.has(e.to)) : activeEmails;
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
	class="modal-backdrop-luma"
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div
		class="modal-panel email-modal"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<!-- Sticky header -->
		<div class="modal-head email-modal-head">
			<h5 class="modal-title">Notification Emails</h5>
			<button class="btn-icon" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<!-- Tabs -->
		<div class="tab-bar">
			<button
				class="tab-btn"
				class:active={activeTab === 'applicants'}
				onclick={() => (activeTab = 'applicants')}
			>
				Applicants <span class="tab-count">{applicantEmails.length}</span>
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'interviewers'}
				onclick={() => (activeTab = 'interviewers')}
			>
				Interviewers <span class="tab-count">{interviewerEmails.length}</span>
			</button>
		</div>

		{#if activeEmails.length === 0}
			<div class="empty-state">
				<i class="fi fi-br-inbox-in"></i>
				<p class="empty-hint">No interviews loaded. Schedule interviews first.</p>
			</div>
		{:else}
			<!-- Toolbar: select all + bulk actions -->
			<div class="toolbar">
				<label class="select-all">
					<input type="checkbox" checked={allSelected} onchange={toggleSelectAll} />
					<span>Select all ({activeEmails.length})</span>
				</label>

				{#if selectedEmails.size > 0}
					<span class="subtle sel-count">{selectedEmails.size} selected</span>
				{/if}

				<div class="toolbar-spacer"></div>

				<button
					class="toolbar-btn"
					onclick={downloadAllAsSingleICS}
					title={selectedEmails.size > 0
						? `Download ${selectedEmails.size} events as single .ics`
						: 'Download all events as single .ics'}
				>
					<i class="fi fi-br-calendar-lines"></i>
					Single .ics
				</button>
				<button
					class="toolbar-btn"
					onclick={downloadSelectedICSZip}
					disabled={downloadingZip}
					title={selectedEmails.size > 0
						? `Download ${selectedEmails.size} .ics files as ZIP`
						: 'Download all .ics files as ZIP'}
				>
					{#if downloadingZip}
						Zipping...
					{:else}
						<i class="fi fi-br-download"></i>
						ZIP ({selectedEmails.size > 0 ? selectedEmails.size : 'All'})
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
								onclick={(e) => {
									e.stopPropagation();
									toggleSelect(email.to);
								}}
								onkeydown={(e) => e.stopPropagation()}
							/>
							<span class="card-chevron"></span>
							<span class="card-email">{email.to}</span>
							<div class="card-actions">
								<button
									class="action-btn ics"
									onclick={(e) => {
										e.stopPropagation();
										downloadRecipientICS(email.to);
									}}
									title="Download .ics"
								>
									.ics
								</button>
								<button
									class="action-btn copy"
									class:copied={recentlyCopied[email.to]}
									onclick={(e) => {
										e.stopPropagation();
										copyEmail(email);
									}}
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
								oninput={(e) => {
									subjectOverrides[email.to] = (e.target as HTMLInputElement).value;
								}}
							/>
							<label class="field-label mt-2">Body</label>
							<textarea
								class="form-control body-textarea"
								value={getText(email)}
								oninput={(e) => {
									textOverrides[email.to] = (e.target as HTMLTextAreaElement).value;
								}}
								rows={Math.min(getText(email).split('\n').length + 1, 12)}></textarea>
						</div>
					</details>
				{/each}
			</div>

			<!-- Sticky footer -->
			<div class="modal-footer">
				<div class="footer-row">
					<button class="footer-btn secondary" onclick={() => copyAllBodies(activeEmails)}>
						{recentlyCopied['__all__'] ? 'All Copied!' : `Copy All (${activeEmails.length})`}
					</button>

					{#if orgId && slug}
						<button
							class="footer-btn primary"
							onclick={() => sendEmails(activeTab)}
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
					<div
						class="alert-soft result-banner"
						class:alert-warning={sendResult.dryRun}
						class:alert-error={!sendResult.dryRun && sendResult.failed > 0}
						class:alert-success={!sendResult.dryRun && sendResult.failed === 0}
					>
						{#if sendResult.dryRun}
							<strong>No emails were sent.</strong>
							{sendResult.message}
							<br />Would send to {sendResult.wouldSend?.applicants ?? 0} applicant(s) and {sendResult
								.wouldSend?.interviewers ?? 0} interviewer(s).
							<br /><span class="hint"
								>Set RESEND_API_KEY in your Supabase Edge Function secrets to enable real sending.</span
							>
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
					<div class="alert-soft alert-error result-banner">{sendError}</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use 'sass:color';
	@use '../../../styles/col.scss' as *;

	/* Modal shell — the shared `.modal-panel` sized and re-laid-out for a
	   sticky header/footer with a scrolling body between them. */
	.email-modal {
		max-width: 780px;
		max-height: calc(100vh - 48px);
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Header */
	.email-modal-head {
		padding: 18px 24px 14px;
		margin-bottom: 0;
		border-bottom: 1px solid $border;
		flex-shrink: 0;
	}

	/* Tabs */

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 24px;
		border-bottom: 1px solid $border-faint;
		flex-shrink: 0;
		background: $surface-muted;
	}
	.select-all {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: $text;
		cursor: pointer;
		input {
			cursor: pointer;
			width: 15px;
			height: 15px;
			accent-color: $dark-primary;
		}
	}
	.sel-count {
		font-size: 11px;
		font-weight: 600;
	}
	.toolbar-spacer {
		flex: 1;
	}
	.toolbar-btn {
		font-size: 12px;
		font-weight: 600;
		padding: 5px 12px;
		border-radius: $radius-sm;
		border: 1px solid $info;
		background: $info-bg;
		color: $info-fg;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
		white-space: nowrap;
		&:hover {
			background: color.adjust($info-bg, $lightness: -4%);
		}
		&:disabled {
			opacity: 0.6;
			cursor: default;
		}
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
		border: 1px solid $border;
		border-radius: $radius;
		overflow: hidden;
		background: $surface;
		transition: border-color 0.15s;
		&:hover {
			border-color: $border-strong;
		}
	}
	.card-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		cursor: pointer;
		list-style: none;
		font-size: 13px;
		background: $surface-muted;
		user-select: none;
		&::-webkit-details-marker {
			display: none;
		}

		input[type='checkbox'] {
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
			color: $text-muted;
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
		color: $text;
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
		border-radius: $radius-sm;
		border: 1px solid $border;
		background: $surface;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;

		&.ics {
			color: $info-fg;
			border-color: $info;
			background: $info-bg;
			&:hover {
				background: color.adjust($info-bg, $lightness: -4%);
			}
		}
		&.copy {
			color: $text;
			&:hover {
				background: $border-faint;
			}
			&.copied {
				background: $success-bg;
				color: $success-fg;
				border-color: $success;
			}
		}
	}

	.card-body {
		padding: 12px 14px 16px;
		border-top: 1px solid $border-faint;
	}
	.mt-2 {
		margin-top: 10px;
	}
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
		border-top: 1px solid $border;
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
		border-radius: $radius;
		border: none;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;

		&.secondary {
			background: $border-faint;
			color: $text;
			border: 1px solid $border;
			&:hover {
				background: $border;
			}
		}
		&.primary {
			background: $dark-primary;
			color: $surface;
			&:hover {
				background: color.adjust($dark-primary, $lightness: 10%);
			}
			&:disabled {
				opacity: 0.6;
				cursor: default;
			}
		}
	}

	.result-banner {
		font-size: 12px;
		padding: 8px 12px;
		margin-bottom: 0;
	}
	.error-detail {
		display: block;
		font-family: monospace;
		font-size: 11px;
		margin-top: 2px;
		opacity: 0.85;
	}
</style>
