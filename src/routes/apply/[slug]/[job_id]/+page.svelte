<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase, isMaintenanceMode, getTeams } from '$lib/utils/supabase';
	import { sendApplications } from '$lib/utils/supabase';
	import {
		visibleSteps,
		evaluateRejectRules,
		describeRejectMatch,
		splitSubmissionByTeam
	} from '$lib/utils/formSchema';
	import { readOrgSettings, emailMatchesDomain } from '$lib/types/orgSettings';
	import type { Organization, JobPosting, FormStep, Team, QuestionSchema } from '$lib/types';
	import QuestionRenderer from '$lib/components/QuestionRenderer.svelte';
	import { capture, EVENTS } from '$lib/analytics/posthog';

	let org: Organization | null = null;
	let job: JobPosting | null = null;
	let schema: QuestionSchema | null = null;
	let teams: Team[] = [];
	// Optional per-org restriction on the applicant's address (Archimedes is
	// vt.edu). Null for every org that hasn't set one, which is the default.
	let emailDomain: string | null = null;
	let selectedTeamSlugs: string[] = [];
	let teamError = '';

	// Questions are filtered to the teams this applicant picked. With no teams
	// configured the picker is skipped entirely and every question is shared,
	// which is how single-team orgs (and pre-00015 deployments) behave.
	// `teams` is passed so `per_team` questions expand into one copy per team the
	// applicant picked — that is how "Why are you interested in {team}?" becomes a
	// separate question, and a separate answer, for each team.
	$: steps = visibleSteps(schema, selectedTeamSlugs, teams) as FormStep[];
	$: hasTeamStep = teams.length > 0;
	let currentStep = 0;
	let loading = true;
	let error = '';
	let maintenanceMode = false;
	let submitting = false;
	let submitError = '';

	// Name/email are always collected (step 0 is auto-generated)
	let firstName = '';
	let lastName = '';
	let email = '';
	let step0Errors: { firstName?: string; lastName?: string; email?: string } = {};

	// Step layout: personal info, [team picker], ...question steps, review.
	$: teamStepIndex = hasTeamStep ? 1 : -1;
	$: firstQuestionStep = hasTeamStep ? 2 : 1;
	$: totalSteps = steps.length + (hasTeamStep ? 3 : 2);
	$: isFirstStep = currentStep === 0;
	$: isLastStep = currentStep === totalSteps - 1;
	$: isReviewStep = currentStep === totalSteps - 1;
	$: isTeamStep = hasTeamStep && currentStep === teamStepIndex;
	$: currentFormStep =
		currentStep >= firstQuestionStep && currentStep < totalSteps - 1
			? (steps[currentStep - firstQuestionStep] ?? null)
			: null;
	$: storagePrefix = job ? `job_${job.id}` : '';

	onMount(async () => {
		// Check maintenance mode
		maintenanceMode = await isMaintenanceMode();
		if (maintenanceMode) {
			loading = false;
			return;
		}

		const slug = $page.params.slug;
		const jobId = Number($page.params.job_id);

		const { data: orgData } = await supabase
			.from('organizations')
			.select('*')
			.eq('slug', slug)
			.single();

		if (!orgData) {
			error = 'Organization not found.';
			loading = false;
			return;
		}
		org = orgData;

		const { data: jobData } = await supabase
			.from('job_posting')
			.select('*')
			.eq('id', jobId)
			.eq('org_id', orgData.id)
			.single();

		if (!jobData) {
			error = 'Job posting not found.';
			loading = false;
			return;
		}
		job = jobData;
		schema = jobData.questions ?? null;

		teams = await getTeams(orgData.id);
		emailDomain = readOrgSettings(orgData.settings).application.email_domain;

		// Load personal info from localStorage
		firstName = localStorage.getItem(`${storagePrefix}_firstName`) || '';
		lastName = localStorage.getItem(`${storagePrefix}_lastName`) || '';
		email = localStorage.getItem(`${storagePrefix}_email`) || '';
		const storedTeams = localStorage.getItem(`${storagePrefix}_teams`);
		if (storedTeams) {
			// Drop any slug that no longer exists so a renamed team can't leave
			// the applicant answering questions for a team they can't apply to.
			const valid = new Set(teams.map((t) => t.slug));
			selectedTeamSlugs = storedTeams.split(',').filter((s) => valid.has(s));
		}

		// Check URL for step param
		const stepParam = $page.url.searchParams.get('step');
		if (stepParam) currentStep = Number(stepParam);

		// Top of the apply funnel. Fires once the form is actually renderable, so
		// it isn't inflated by hits on a dead org/job slug.
		capture(EVENTS.APPLICATION_STARTED, {
			org_id: orgData.id,
			org_slug: orgData.slug,
			job_id: jobData.id,
			resumed: Boolean(firstName || lastName || email)
		});

		loading = false;
	});

	function validateStep0(): boolean {
		step0Errors = {};
		if (!firstName.trim()) step0Errors.firstName = 'First name is required.';
		if (!lastName.trim()) step0Errors.lastName = 'Last name is required.';
		if (!email.trim()) {
			step0Errors.email = 'Email is required.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
			step0Errors.email = 'Please enter a valid email address.';
		} else if (!emailMatchesDomain(email, emailDomain)) {
			// Named explicitly rather than a generic "invalid": someone who typed a
			// personal address needs to know WHICH address to use, not just that
			// this one was refused.
			step0Errors.email = `Please use your @${emailDomain} email address.`;
		}
		return Object.keys(step0Errors).length === 0;
	}

	function toggleTeam(slug: string) {
		selectedTeamSlugs = selectedTeamSlugs.includes(slug)
			? selectedTeamSlugs.filter((s) => s !== slug)
			: [...selectedTeamSlugs, slug];
		teamError = '';
		localStorage.setItem(`${storagePrefix}_teams`, selectedTeamSlugs.join(','));
	}

	function nextStep() {
		if (currentStep === 0) {
			if (!validateStep0()) return;
			localStorage.setItem(`${storagePrefix}_firstName`, firstName);
			localStorage.setItem(`${storagePrefix}_lastName`, lastName);
			localStorage.setItem(`${storagePrefix}_email`, email);
		}
		if (isTeamStep) {
			if (selectedTeamSlugs.length === 0) {
				teamError = 'Select at least one team to continue.';
				return;
			}
			localStorage.setItem(`${storagePrefix}_teams`, selectedTeamSlugs.join(','));
		}
		if (currentStep < totalSteps - 1) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	async function submitApplication() {
		if (!job || !org) return;
		submitting = true;
		submitError = '';

		try {
			// Answers are keyed by the ids the FORM used, so a per-team question shows
			// up here as `why_team::astra`. splitSubmissionByTeam collapses those back
			// to the authored id on the one application they belong to.
			const formAnswers: Record<string, string> = {};
			for (const step of steps) {
				for (const q of step.questions) {
					const key = `${storagePrefix}_${q.id}`;
					if (q.type === 'input_dual') {
						const v1 = localStorage.getItem(`${key}_1`) || '';
						const v2 = localStorage.getItem(`${key}_2`) || '';
						formAnswers[q.id] = `${v1} | ${v2}`;
					} else {
						formAnswers[q.id] = localStorage.getItem(key) || '';
					}
				}
			}

			// Stored lowercased: interviews, drafts and the email log all join
			// applicants on this address, and the dedup index from migration 00025
			// is on lower(email). Letting case vary would fork one person into two
			// candidates across every one of those joins.
			const normalizedEmail = email.trim().toLowerCase();

			// One submission per team, each becoming its own independent application.
			const submissions = splitSubmissionByTeam(formAnswers, schema, selectedTeamSlugs, teams);

			// Ties the sibling rows together for auditing. The fallback keeps a
			// non-secure-context dev server (where crypto.randomUUID is absent) from
			// failing an otherwise valid submit.
			const submissionGroup =
				typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
					? crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`;

			const rows = submissions.map((sub) => {
				// Evaluated against THIS team's answers under THIS team's scope, so an
				// eligibility rule can deny the Astra application while the same
				// person's Terra application stays pending.
				const matches = evaluateRejectRules(
					sub.answers,
					schema,
					sub.teamSlug ? [sub.teamSlug] : []
				);
				const autoRejected = matches.length > 0;

				return {
					name: `${firstName} ${lastName}`,
					email: normalizedEmail,
					recruitInfo: sub.answers,
					job: job!.id,
					org_id: org!.id,
					status: autoRejected ? 'denied' : 'pending',
					metadata: autoRejected
						? {
								auto_rejected: true,
								auto_reject_reasons: matches.map(describeRejectMatch),
								auto_rejected_at: new Date().toISOString()
							}
						: {},
					submission_group: submissionGroup,
					// `team_id` arrives with 00024 and `selected_team_slugs` with 00020.
					// Both are omitted rather than sent as null when the org has no teams,
					// so a deployment missing those migrations still accepts applications
					// instead of 400-ing on an unknown column.
					...(sub.teamId !== null ? { team_id: sub.teamId } : {}),
					...(sub.teamSlug ? { selected_team_slugs: [sub.teamSlug] } : {})
				};
			});

			await sendApplications(rows);

			const rejectedCount = rows.filter((r) => r.status === 'denied').length;

			// Funnel endpoint. IDs and counts only — never the answers themselves.
			capture(EVENTS.APPLICATION_SUBMITTED, {
				org_id: org.id,
				org_slug: org.slug,
				job_id: job.id,
				team_count: selectedTeamSlugs.length,
				application_count: rows.length,
				question_count: Object.keys(formAnswers).length,
				auto_rejected: rejectedCount > 0
			});
			if (rejectedCount > 0) {
				capture(EVENTS.APPLICATION_AUTO_REJECTED, {
					org_id: org.id,
					job_id: job.id,
					// How many of this person's applications were denied — not which
					// answer denied them.
					application_count: rejectedCount
				});
			}

			// Clear localStorage for this application
			const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith(storagePrefix));
			keysToRemove.forEach((k) => localStorage.removeItem(k));

			// The count travels in the URL so the confirmation can say "two
			// applications", which is the applicant's first chance to notice if they
			// picked a team they didn't mean to.
			goto(`/apply/${org!.slug}/${job!.id}/success?n=${rows.length}`);
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'An unknown error occurred.';
			setTimeout(() => {
				submitError = '';
			}, 10000);
		} finally {
			submitting = false;
		}
	}

	// Sidebar step labels
	$: sidebarSteps = [
		{ title: 'Personal Info', icon: 'fi-br-file-user' },
		...(hasTeamStep ? [{ title: 'Choose Teams', icon: 'fi-br-users' }] : []),
		...steps.map((s) => ({ title: s.title, icon: s.icon })),
		{ title: 'Review & Submit', icon: 'fi-br-paper-plane' }
	];
</script>

{#if loading}
	<div class="loading-screen"><p>Loading application...</p></div>
{:else if maintenanceMode}
	<div class="loading-screen">
		<div class="error-card">
			<h2>Applications Closed</h2>
			<p class="muted">
				Applications are currently closed for maintenance. Please check back later.
			</p>
			<a href="/"><button class="btn btn-primary">Back to Home</button></a>
		</div>
	</div>
{:else if error}
	<div class="loading-screen">
		<div class="error-card">
			<h2>{error}</h2>
			<a href="/"><button class="btn btn-primary">Back to Home</button></a>
		</div>
	</div>
{:else if org && job}
	<div class="layout">
		<!-- Navbar -->
		<div class="navbar">
			<div class="navbar-left">
				<div class="navbar-logo">
					<a href="/apply/{org.slug}">
						{#if org.logo_url}
							<img src={org.logo_url} alt={org.name} style="height: 30px; width: auto;" />
						{:else}
							<img src="/images/ui/logo_white.png" alt="LUMA" style="height: 30px; width: auto;" />
						{/if}
					</a>
				</div>
				<div class="navbar-year">
					<button
						class="btn btn-secondary"
						type="button"
						on:click={() => {
							const keys = Object.keys(localStorage).filter((k) => k.startsWith(storagePrefix));
							keys.forEach((k) => localStorage.removeItem(k));
							firstName = '';
							lastName = '';
							email = '';
							currentStep = 0;
						}}
					>
						Reset Form
					</button>
				</div>
			</div>
			<div class="navbar-search">
				<h3 class="hide-on-tiny">{job.name}</h3>
			</div>
			<div class="navbar-right"></div>
		</div>

		<!-- Sidebar -->
		<div class="sidebar hide-on-small">
			<ul class="list-unstyled">
				{#each sidebarSteps as step, i}
					<li class:step-selected={currentStep === i} class:step-disabled={currentStep < i}>
						<p class="step-sidebar">
							<i class="fi {step.icon}"></i>
							{step.title}
						</p>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Mobile step progress bar (hidden on large screens where sidebar is visible) -->
		<div class="mobile-progress show-on-small">
			<div class="mobile-progress-text">
				Step {currentStep + 1} of {totalSteps} — {sidebarSteps[currentStep]?.title ?? ''}
			</div>
			<div class="mobile-progress-bar">
				<div
					class="mobile-progress-fill"
					style="width: {((currentStep + 1) / totalSteps) * 100}%"
				></div>
			</div>
		</div>

		<!-- Content -->
		<div class="content">
			{#if currentStep === 0}
				<!-- Personal Info (always required) -->
				<h4 class="text-center">Personal Information</h4>
				<div class="card">
					<h5>First Name <span class="required">*</span></h5>
					<input
						type="text"
						class="form-control"
						class:is-invalid={step0Errors.firstName}
						bind:value={firstName}
						placeholder="First name"
					/>
					{#if step0Errors.firstName}<p class="field-error">{step0Errors.firstName}</p>{/if}
				</div>
				<div class="card">
					<h5>Last Name <span class="required">*</span></h5>
					<input
						type="text"
						class="form-control"
						class:is-invalid={step0Errors.lastName}
						bind:value={lastName}
						placeholder="Last name"
					/>
					{#if step0Errors.lastName}<p class="field-error">{step0Errors.lastName}</p>{/if}
				</div>
				<div class="card">
					<h5>Email Address <span class="required">*</span></h5>
					<input
						type="email"
						class="form-control"
						class:is-invalid={step0Errors.email}
						bind:value={email}
						placeholder="you@example.com"
					/>
					{#if step0Errors.email}<p class="field-error">{step0Errors.email}</p>{/if}
				</div>
			{:else if isTeamStep}
				<!-- Team picker: drives which questions the rest of the form shows -->
				<h4 class="text-center">Which teams are you applying to?</h4>
				<p class="muted review-hint">
					Select one or more. Later steps only ask questions relevant to the teams you pick, and
					<strong>each team you choose is submitted as its own separate application</strong> — so you
					will be considered for each one independently.
				</p>

				<div class="team-grid">
					{#each teams as team (team.id)}
						<button
							type="button"
							class="team-card"
							class:team-selected={selectedTeamSlugs.includes(team.slug)}
							aria-pressed={selectedTeamSlugs.includes(team.slug)}
							on:click={() => toggleTeam(team.slug)}
						>
							<span class="team-check" aria-hidden="true">
								{selectedTeamSlugs.includes(team.slug) ? '✓' : ''}
							</span>
							<span class="team-name">{team.name}</span>
							{#if team.description}
								<span class="team-desc">{team.description}</span>
							{/if}
						</button>
					{/each}
				</div>

				{#if teamError}<p class="field-error">{teamError}</p>{/if}
			{:else if isReviewStep}
				<!-- Review & Submit -->
				<h4 class="text-center">Review & Submit</h4>
				<p class="muted review-hint">
					Please review your answers before submitting. Click a section to edit.
				</p>
				{#if selectedTeamSlugs.length > 1}
					<p class="muted review-hint">
						Submitting sends <strong>{selectedTeamSlugs.length} separate applications</strong> — one
						to each team you selected. Each is reviewed on its own.
					</p>
				{/if}

				<div
					class="card review-card"
					on:click={() => (currentStep = 0)}
					on:keydown={() => {}}
					role="button"
					tabindex="0"
				>
					<h5>Personal Information</h5>
					<div class="review-field">
						<span class="review-label">Name</span>
						<span class="review-value">{firstName} {lastName}</span>
					</div>
					<div class="review-field">
						<span class="review-label">Email</span>
						<span class="review-value">{email}</span>
					</div>
				</div>

				{#each steps as step, stepIndex}
					<div
						class="card review-card"
						on:click={() => (currentStep = stepIndex + firstQuestionStep)}
						on:keydown={() => {}}
						role="button"
						tabindex="0"
					>
						<h5>{step.title}</h5>
						{#each step.questions as q}
							{@const key = `${storagePrefix}_${q.id}`}
							<div class="review-field">
								<span class="review-label">{q.title}</span>
								<span class="review-value">
									{#if q.type === 'input_dual'}
										{localStorage.getItem(`${key}_1`) || ''}
										{localStorage.getItem(`${key}_2`) || ''}
									{:else if q.type === 'availability'}
										{@const raw = localStorage.getItem(key)}
										{#if raw}
											{@const ranges = JSON.parse(raw)}
											{#each ranges as r}
												<span class="review-tag">{r.date} {r.start}–{r.end}</span>
											{/each}
										{:else}
											<span class="review-empty">Not provided</span>
										{/if}
									{:else if q.type === 'checkbox' || q.type === 'checkbox_image'}
										{@const val = localStorage.getItem(key) || ''}
										{#if val}
											{#each val.split(',').filter(Boolean) as item}
												<span class="review-tag">{item}</span>
											{/each}
										{:else}
											<span class="review-empty">Not provided</span>
										{/if}
									{:else}
										{localStorage.getItem(key) || ''}
										{#if !localStorage.getItem(key)}
											<span class="review-empty">Not provided</span>
										{/if}
									{/if}
								</span>
							</div>
						{/each}
					</div>
				{/each}

				{#if submitError}
					<div class="alert-soft alert-error submit-error">{submitError}</div>
				{/if}

				<button
					on:click={submitApplication}
					class="btn btn-tertiary submit-btn"
					disabled={submitting}
				>
					{submitting ? 'Submitting...' : 'Submit Application'}
				</button>
			{:else if currentFormStep}
				<!-- Dynamic question step -->
				<h4 class="text-center">{currentFormStep.title}</h4>
				{#each currentFormStep.questions as question (question.id)}
					<QuestionRenderer {question} {storagePrefix} />
				{/each}
			{/if}

			<!-- Footer navigation -->
			<div class="footer-nav">
				{#if !isFirstStep}
					<button class="btn btn-quaternary" on:click={prevStep}>
						<i class="fi fi-br-arrow-left"></i> Back
					</button>
				{:else}
					<div></div>
				{/if}
				{#if !isReviewStep}
					<button class="btn btn-tertiary" on:click={nextStep}>
						Next <i class="fi fi-br-arrow-right"></i>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	.loading-screen {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background-color: $light-secondary;
	}
	.error-card {
		background-color: $dark-primary;
		border-radius: 10px;
		padding: 40px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 15px;
	}

	.navbar {
		grid-area: navbar;
		display: flex;
		justify-content: space-between;
		padding: 0;
		background-color: $dark-primary;
		border-bottom: 1px $dark-secondary solid;
	}
	.navbar-left {
		display: flex;
	}
	.navbar-logo {
		display: flex;
		height: 45px;
		width: 45px;
		align-items: center;
		justify-content: center;
		border-right: 1px $dark-secondary solid;
	}
	.navbar-year {
		display: flex;
		height: 45px;
		width: 160px;
		align-items: center;
		justify-content: center;
		border-right: 1px $dark-secondary solid;
	}
	.navbar-search {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.navbar-right {
		display: flex;
	}

	.sidebar {
		grid-area: sidebar;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 5px;
		background-color: $dark-primary;
	}
	// Same nav treatment as the recruiter and admin sidebars: muted until it's
	// the step you're on, then yellow with a left rule.
	.step-sidebar {
		display: flex;
		margin-top: 2px;
		margin-bottom: 2px;
		padding-left: 13px;
		height: 36px;
		width: 195px;
		font-weight: 500;
		align-items: center;
		justify-content: start;
		background-color: transparent;
		border: none;
		border-left: 3px solid transparent;
		border-radius: 0 $radius-sm $radius-sm 0;
		font-size: 13px;
		color: $text-muted;
		transition: all 0.15s;
	}
	.step-sidebar i {
		display: flex;
		align-items: center;
		font-size: 16px;
		margin-right: 15px;
	}
	.step-selected .step-sidebar {
		color: $yellow-primary;
		background-color: rgba(255, 200, 0, 0.08);
		border-left-color: $yellow-primary;
		font-weight: 600;
	}
	.step-disabled .step-sidebar {
		color: $text-subtle;
	}

	.footer-nav {
		display: flex;
		justify-content: space-between;
		width: 100%;
		max-width: 500px;
		margin-top: 20px;
		padding: 10px 0;
	}

	// Colour and size come from the shared `.muted` class.
	.review-hint {
		margin-bottom: 12px;
	}

	/* Team picker */
	.team-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
		margin-top: 8px;
	}
	.team-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		text-align: left;
		background-color: $surface;
		border: 2px solid transparent;
		border-radius: $radius;
		padding: 16px;
		box-shadow: $shadow;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			transform 0.15s ease;
	}
	.team-card:hover {
		transform: translateY(-1px);
	}
	.team-selected {
		border-color: $yellow-primary;
	}
	.team-check {
		position: absolute;
		top: 10px;
		right: 12px;
		font-weight: 800;
		color: $yellow-primary;
	}
	.team-name {
		font-weight: 700;
		font-size: 15px;
		color: $dark-primary;
	}
	.team-desc {
		font-size: 12px;
		color: $text-muted;
	}
	.review-card {
		cursor: pointer;
		transition:
			box-shadow 0.2s ease,
			border-color 0.2s ease;
		border: 1px solid transparent;
		&:hover {
			border-color: $yellow-primary;
			box-shadow: $shadow-lg;
		}
	}
	.review-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0;
		border-bottom: 1px solid $border-faint;
		&:last-child {
			border-bottom: none;
		}
	}
	.review-label {
		font-size: 11px;
		font-weight: 700;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.review-value {
		font-size: 14px;
		color: $text;
		word-break: break-word;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.review-tag {
		display: inline-block;
		background-color: $border-faint;
		color: $text;
		font-size: 12px;
		padding: 2px 8px;
		border-radius: $radius-sm;
	}
	.review-empty {
		color: $text-muted;
		font-style: italic;
		font-size: 13px;
	}
	.required {
		color: $danger;
	}
	// `.field-error` is shared (ui.scss); only the invalid border is local.
	.is-invalid {
		border-color: $danger !important;
	}
	.submit-error {
		max-width: 500px;
		margin-top: 1rem;
	}
	.submit-btn {
		margin-top: 20px;
		padding: 10px 40px;
	}

	.mobile-progress {
		grid-area: content;
		position: sticky;
		top: 0;
		z-index: 10;
		background-color: $dark-primary;
		padding: 10px 16px 6px;
		border-bottom: 1px solid $dark-secondary;
	}
	.mobile-progress-text {
		font-size: 12px;
		font-weight: 600;
		color: white;
		margin-bottom: 6px;
	}
	.mobile-progress-bar {
		height: 4px;
		background-color: $dark-secondary;
		border-radius: 2px;
		overflow: hidden;
	}
	.mobile-progress-fill {
		height: 100%;
		background-color: $yellow-primary;
		border-radius: 2px;
		transition: width 0.3s ease;
	}
</style>
