<script lang="ts">
	/**
	 * The per-org rules in `organizations.settings` — review thresholds, blinded
	 * review, scheduling defaults, email toggles and the applicant email domain.
	 *
	 * These keys existed (and were read by the app) long before anything could
	 * edit them: every org ran on the defaults unless someone wrote SQL. This card
	 * is that editor. Each section is saved independently through
	 * `saveOrgSettingsSection`, so unknown keys and other sections are untouched.
	 */
	import { readOrgSettings, normalizeEmailDomain } from '$lib/types/orgSettings';
	import type { OrgSettings } from '$lib/types/orgSettings';
	import { saveOrgSettingsSection } from '$lib/utils/orgConfig';
	import { algorithms } from '$lib/scheduling/registry';
	import type { Organization } from '$lib/types';

	let { org }: { org: Organization } = $props();

	const initial = readOrgSettings(org.settings);
	let review = $state({ ...initial.review_thresholds });
	let scheduling = $state({ ...initial.scheduling });
	let email = $state({ ...initial.email });
	let emailDomain = $state(initial.application.email_domain ?? '');

	let saving = $state(false);
	let message = $state('');
	let failed = $state(false);

	type EmailToggle = Exclude<keyof OrgSettings['email'], 'from_address' | 'from_name'>;
	const EMAIL_TOGGLES: { key: EmailToggle; label: string }[] = [
		{ key: 'auto_send_application_confirmation', label: 'Application received' },
		{ key: 'auto_send_auto_reject', label: 'Auto-rejected' },
		{ key: 'auto_send_interview_scheduled', label: 'Interview scheduled' },
		{ key: 'auto_send_decision_hire', label: 'Decision: hired' },
		{ key: 'auto_send_decision_reject', label: 'Decision: rejected' },
		{ key: 'auto_send_decision_waitlist', label: 'Decision: waitlisted' }
	];

	async function save() {
		saving = true;
		message = '';
		failed = false;
		const domain = normalizeEmailDomain(emailDomain);
		if (emailDomain.trim() && !domain) {
			failed = true;
			message = `"${emailDomain}" isn't a domain — use something like example.edu, or leave it blank.`;
			saving = false;
			return;
		}
		try {
			const positive = (n: number, d: number) => (Number.isFinite(n) && n >= 1 ? Math.round(n) : d);
			const cleanReview = {
				...review,
				approve_to_advance: positive(review.approve_to_advance, 3),
				reject_to_deny: positive(review.reject_to_deny, 2)
			};
			const cleanScheduling = {
				...scheduling,
				buffer_minutes: Math.max(0, Math.round(Number(scheduling.buffer_minutes) || 0))
			};
			await saveOrgSettingsSection(org.id, 'review_thresholds', cleanReview);
			await saveOrgSettingsSection(org.id, 'scheduling', cleanScheduling);
			await saveOrgSettingsSection(org.id, 'email', { ...email });
			// Merge into the application section so keys other than email_domain survive.
			await saveOrgSettingsSection(org.id, 'application', (current: unknown) => ({
				...(current && typeof current === 'object' ? current : {}),
				email_domain: domain
			}));
			review = cleanReview;
			scheduling = cleanScheduling;
			emailDomain = domain ?? '';
			message = 'Rules saved.';
		} catch (e) {
			failed = true;
			message = 'Failed to save: ' + (e instanceof Error ? e.message : String(e));
		}
		saving = false;
		if (!failed) setTimeout(() => (message = ''), 3000);
	}
</script>

<div class="card">
	<h5>Recruiting Rules</h5>
	<p class="card-hint">
		How applications move through review, scheduling defaults, and which automated emails go out.
	</p>

	<span class="group-label">Review</span>
	<div class="grid-2">
		<div class="field">
			<label class="field-label" for="rr-approve">Approvals to advance</label>
			<input
				id="rr-approve"
				type="number"
				min="1"
				class="form-control"
				bind:value={review.approve_to_advance}
			/>
		</div>
		<div class="field">
			<label class="field-label" for="rr-reject">Rejections to deny</label>
			<input
				id="rr-reject"
				type="number"
				min="1"
				class="form-control"
				bind:value={review.reject_to_deny}
			/>
		</div>
	</div>
	<label class="check-row">
		<input type="checkbox" bind:checked={review.blinded_review} />
		<span>Blinded review — reviewers don't see name, email or other blinded answers</span>
	</label>
	<label class="check-row">
		<input type="checkbox" bind:checked={review.weighted_scoring} />
		<span>Weighted scoring — use each member's review weight</span>
	</label>

	<span class="group-label">Scheduling defaults</span>
	<div class="grid-2">
		<div class="field">
			<label class="field-label" for="rr-algo">Default algorithm</label>
			<select id="rr-algo" class="form-select" bind:value={scheduling.default_algorithm}>
				{#each algorithms as a (a.id)}
					<option value={a.id}>{a.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label class="field-label" for="rr-buffer">Buffer between interviews (min)</label>
			<input
				id="rr-buffer"
				type="number"
				min="0"
				class="form-control"
				bind:value={scheduling.buffer_minutes}
			/>
		</div>
	</div>
	<label class="check-row">
		<input type="checkbox" bind:checked={scheduling.exclude_advisors_from_r1} />
		<span>Keep advisors out of the round 1 interviewer pool</span>
	</label>

	<span class="group-label">Applications</span>
	<div class="field">
		<label class="field-label" for="rr-domain">Applicant email domain</label>
		<input
			id="rr-domain"
			type="text"
			class="form-control"
			bind:value={emailDomain}
			placeholder="Any address (leave blank)"
		/>
		<p class="field-hint">
			e.g. <code>example.edu</code> to accept only that school's addresses. Subdomains are accepted too.
		</p>
	</div>

	<span class="group-label">Automated emails</span>
	{#each EMAIL_TOGGLES as t (t.key)}
		<label class="check-row">
			<input type="checkbox" bind:checked={email[t.key]} />
			<span>{t.label}</span>
		</label>
	{/each}

	<div class="save-row">
		<button class="btn btn-tertiary" onclick={save} disabled={saving}>
			{saving ? 'Saving...' : 'Save Rules'}
		</button>
		{#if message}
			<span class={failed ? 'field-error' : 'ok-msg'}>{message}</span>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.card-hint {
		font-size: 12px;
		color: $text-muted;
		margin-bottom: 10px;
	}
	.group-label {
		display: block;
		margin: 14px 0 6px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: $text-muted;
	}
	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		margin-bottom: 6px;
		cursor: pointer;

		input {
			margin-top: 3px;
		}
	}
	.save-row {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-top: 12px;
	}
	.ok-msg {
		font-size: 13px;
		color: $success;
	}
</style>
