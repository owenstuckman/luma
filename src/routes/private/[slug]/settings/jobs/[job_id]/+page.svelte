<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase, getTeams } from '$lib/utils/supabase';
	import { updateJobPosting } from '$lib/utils/supabase';
	import type { Team, RejectRule } from '$lib/types';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import QuestionRenderer from '$lib/components/QuestionRenderer.svelte';
	import type { JobPosting, FormStep, FormQuestion } from '$lib/types';

	let job: JobPosting | null = null;
	let loading = true;
	let saving = false;
	let saveMessage = '';

	// Editable job fields
	let jobName = '';
	let jobDescription = '';
	let steps: FormStep[] = [];

	// Editing state
	let editingStepIndex: number | null = null;
	let editingQuestionIndex: number | null = null;

	// New step form
	let showAddStep = false;
	let newStepTitle = '';
	let newStepIcon = 'fi-br-document';

	// New question form
	let addingQuestionToStep: number | null = null;
	let newQ: FormQuestion = emptyQuestion();

	// --- V1 per-question metadata (team_scope / reject_if / blinded) ---
	// Held as flat UI state and folded into the question on add, because the
	// stored shapes are unions that are awkward to bind directly.
	let teams: Team[] = [];
	let newQTeamSlugs: string[] = [];
	let newQRejectOp: '' | RejectRule['op'] = '';
	let newQRejectValue = '';

	/** Ops that need no operand — the rest read `newQRejectValue`. */
	const NULLARY_OPS = ['truthy', 'falsy'];
	/** Ops whose operand is a list, entered comma-separated. */
	const LIST_OPS = ['in', 'not_in'];
	/** Ops whose operand must be numeric. */
	const NUMERIC_OPS = ['lt', 'gt'];

	const rejectOps: { value: RejectRule['op']; label: string }[] = [
		{ value: 'eq', label: 'is exactly' },
		{ value: 'neq', label: 'is anything other than' },
		{ value: 'in', label: 'is one of' },
		{ value: 'not_in', label: 'is none of' },
		{ value: 'lt', label: 'is less than' },
		{ value: 'gt', label: 'is greater than' },
		{ value: 'truthy', label: 'is answered at all' },
		{ value: 'falsy', label: 'is left blank' }
	];

	$: rejectNeedsValue = newQRejectOp !== '' && !NULLARY_OPS.includes(newQRejectOp);
	$: rejectValueInvalid =
		rejectNeedsValue &&
		(newQRejectValue.trim() === '' ||
			(NUMERIC_OPS.includes(newQRejectOp) && Number.isNaN(Number(newQRejectValue.trim()))));

	/** Build the stored `reject_if` union from the flat form state. */
	function buildRejectRule(): RejectRule | undefined {
		if (newQRejectOp === '') return undefined;
		const op = newQRejectOp;
		if (NULLARY_OPS.includes(op)) return { op } as RejectRule;
		const raw = newQRejectValue.trim();
		if (!raw) return undefined;
		if (LIST_OPS.includes(op)) {
			return {
				op,
				value: raw
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			} as RejectRule;
		}
		if (NUMERIC_OPS.includes(op)) {
			const n = Number(raw);
			return Number.isFinite(n) ? ({ op, value: n } as RejectRule) : undefined;
		}
		return { op, value: raw } as RejectRule;
	}

	function resetQuestionMeta() {
		newQTeamSlugs = [];
		newQRejectOp = '';
		newQRejectValue = '';
	}

	function toggleNewQTeam(slug: string) {
		newQTeamSlugs = newQTeamSlugs.includes(slug)
			? newQTeamSlugs.filter((s) => s !== slug)
			: [...newQTeamSlugs, slug];
	}

	/** One-line summary of a question's V1 metadata, for the collapsed list row. */
	function metaSummary(q: FormQuestion): string {
		const bits: string[] = [];
		const scope = q.team_scope;
		if (scope && scope !== 'shared' && scope.teams?.length) {
			const names = scope.teams.map((s) => teams.find((t) => t.slug === s)?.name ?? s);
			bits.push(names.join(' / '));
		}
		if (q.reject_if) {
			const op = rejectOps.find((o) => o.value === q.reject_if!.op)?.label ?? q.reject_if.op;
			const v = 'value' in q.reject_if ? ` ${JSON.stringify(q.reject_if.value)}` : '';
			bits.push(`auto-reject if ${op}${v}`);
		}
		if (q.blinded) bits.push('blinded');
		return bits.join(' · ');
	}

	$: slug = $page.params.slug;
	$: jobId = Number($page.params.job_id);

	const questionTypes = [
		{ value: 'input', label: 'Text Input' },
		{ value: 'input_dual', label: 'Dual Input (two fields)' },
		{ value: 'textarea', label: 'Text Area' },
		{ value: 'radio', label: 'Radio (single select)' },
		{ value: 'checkbox', label: 'Checkbox (multi select)' },
		{ value: 'checkbox_image', label: 'Checkbox with Image' },
		{ value: 'dropdown', label: 'Dropdown' },
		{ value: 'availability', label: 'Availability Grid' }
	];

	const iconOptions = [
		'fi-br-document',
		'fi-br-shield-trust',
		'fi-br-file-user',
		'fi-br-employees',
		'fi-br-calendar-clock',
		'fi-br-file-edit',
		'fi-br-thumbs-up-trust',
		'fi-br-paper-plane',
		'fi-br-star',
		'fi-br-briefcase',
		'fi-br-graduation-cap',
		'fi-br-settings',
		'fi-br-check',
		'fi-br-user',
		'fi-br-envelope'
	];

	function emptyQuestion(): FormQuestion {
		return {
			id: '',
			type: 'input',
			title: '',
			subtitle: '',
			options: [],
			required: false
		};
	}

	onMount(async () => {
		const { data: jobData } = await supabase
			.from('job_posting')
			.select('*')
			.eq('id', jobId)
			.single();

		if (!jobData) {
			goto(`/private/${slug}/settings/jobs`);
			return;
		}

		job = jobData;
		jobName = jobData.name;
		jobDescription = jobData.description || '';
		steps = jobData.questions?.steps || [];
		// Empty when migration 00015 isn't applied — the team-scope control then
		// hides itself and questions stay shared, which is the correct default.
		if (jobData.org_id) teams = await getTeams(jobData.org_id);
		loading = false;
	});

	async function saveAll() {
		if (!job) return;
		saving = true;
		saveMessage = '';

		try {
			await updateJobPosting(job.id, {
				name: jobName,
				description: jobDescription,
				questions: { steps } as any
			});
			saveMessage = 'Saved!';
			setTimeout(() => {
				saveMessage = '';
			}, 3000);
		} catch (err) {
			saveMessage = 'Error: ' + (err instanceof Error ? err.message : 'Unknown');
		} finally {
			saving = false;
		}
	}

	// Step management
	function addStep() {
		if (!newStepTitle.trim()) return;
		steps = [...steps, { title: newStepTitle, icon: newStepIcon, questions: [] }];
		newStepTitle = '';
		newStepIcon = 'fi-br-document';
		showAddStep = false;
	}

	function removeStep(index: number) {
		if (!confirm(`Remove step "${steps[index].title}" and all its questions?`)) return;
		steps = steps.filter((_, i) => i !== index);
	}

	function moveStep(index: number, direction: -1 | 1) {
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= steps.length) return;
		const newSteps = [...steps];
		[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
		steps = newSteps;
	}

	// Question management
	function addQuestion(stepIndex: number) {
		if (!newQ.title.trim() || !newQ.id.trim()) return;
		if (rejectValueInvalid) return;
		const q = { ...newQ };
		// Clean up options
		if (q.options) q.options = q.options.filter((o) => o.trim() !== '');

		// Fold the V1 metadata in. Omit each key entirely when unset so the
		// stored schema stays clean and `undefined` never lands in the JSON.
		if (newQTeamSlugs.length > 0) q.team_scope = { teams: [...newQTeamSlugs] };
		else delete q.team_scope;

		const rule = buildRejectRule();
		if (rule) q.reject_if = rule;
		else delete q.reject_if;

		if (!q.blinded) delete q.blinded;

		steps[stepIndex].questions = [...steps[stepIndex].questions, q];
		steps = [...steps];
		newQ = emptyQuestion();
		resetQuestionMeta();
		addingQuestionToStep = null;
	}

	function removeQuestion(stepIndex: number, qIndex: number) {
		steps[stepIndex].questions = steps[stepIndex].questions.filter((_, i) => i !== qIndex);
		steps = [...steps];
	}

	function moveQuestion(stepIndex: number, qIndex: number, direction: -1 | 1) {
		const newIndex = qIndex + direction;
		const qs = steps[stepIndex].questions;
		if (newIndex < 0 || newIndex >= qs.length) return;
		[qs[qIndex], qs[newIndex]] = [qs[newIndex], qs[qIndex]];
		steps[stepIndex].questions = [...qs];
		steps = [...steps];
	}

	// Options helpers for new question
	let optionsText = '';
	$: newQ.options = optionsText.split('\n').filter((o) => o.trim() !== '');

	function getTypeLabel(type: string) {
		return questionTypes.find((t) => t.value === type)?.label || type;
	}

	let showPreview = false;
	let previewStep = 0;
	$: previewSteps = [
		{ title: 'Personal Info', icon: 'fi-br-file-user', questions: [] as FormQuestion[] },
		...steps,
		{ title: 'Review & Submit', icon: 'fi-br-paper-plane', questions: [] as FormQuestion[] }
	];
	$: currentPreviewStep = previewSteps[previewStep] ?? null;
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<a href="/private/{slug}/settings/jobs" class="back-link">
					<i class="fi fi-br-arrow-left"></i> Job Postings
				</a>
				<h4 class="page-title">Edit: {jobName || 'Loading...'}</h4>
				<p class="page-subtitle">Job details and the steps of the application form.</p>
			</div>
			<div class="page-actions">
				{#if saveMessage}
					<span class="save-msg" class:error={saveMessage.startsWith('Error')}>{saveMessage}</span>
				{/if}
				<button
					class="btn btn-quaternary"
					on:click={() => {
						showPreview = true;
						previewStep = 0;
					}}
					disabled={loading}
				>
					<i class="fi fi-br-eye"></i> Preview
				</button>
				<button class="btn btn-tertiary" on:click={saveAll} disabled={saving}>
					{saving ? 'Saving...' : 'Save All Changes'}
				</button>
			</div>
		</div>

		{#if loading}
			<p class="muted">Loading...</p>
		{:else}
			<!-- Job Details -->
			<div class="panel section-card">
				<div class="panel-head">
					<h5 class="panel-title">Job Details</h5>
				</div>
				<div class="field">
					<label class="field-label">Position Name</label>
					<input type="text" class="form-control" bind:value={jobName} />
				</div>
				<div class="field">
					<label class="field-label">Description</label>
					<textarea class="form-control" bind:value={jobDescription} rows="2"></textarea>
				</div>
			</div>

			<!-- Form Steps -->
			<div class="section-header">
				<h5 class="panel-title">Application Form Steps</h5>
				<button class="btn btn-tertiary btn-sm" on:click={() => (showAddStep = !showAddStep)}>
					<i class="fi fi-br-plus"></i> Add Step
				</button>
			</div>

			<p class="field-hint section-hint">
				Each step becomes a page in the applicant's form. Personal info (name/email) and
				review/submit are added automatically.
			</p>

			{#if showAddStep}
				<div class="panel add-step-card">
					<div class="field">
						<label class="field-label">Step Title</label>
						<input
							type="text"
							class="form-control"
							bind:value={newStepTitle}
							placeholder="e.g. Verification"
						/>
					</div>
					<div class="field">
						<label class="field-label">Icon</label>
						<div class="icon-grid">
							{#each iconOptions as icon}
								<button
									class="icon-btn"
									class:icon-selected={newStepIcon === icon}
									on:click={() => (newStepIcon = icon)}
									title={icon}
								>
									<i class="fi {icon}"></i>
								</button>
							{/each}
						</div>
					</div>
					<div class="btn-row">
						<button class="btn btn-tertiary btn-sm" on:click={addStep}>Add Step</button>
						<button class="btn btn-quaternary btn-sm" on:click={() => (showAddStep = false)}
							>Cancel</button
						>
					</div>
				</div>
			{/if}

			{#if steps.length === 0}
				<div class="empty-state">
					<i class="fi fi-br-layers"></i>
					<div class="empty-title">No form steps yet</div>
					<p class="empty-hint">Add a step to start building the application form.</p>
				</div>
			{/if}

			{#each steps as step, stepIndex}
				<div class="step-card">
					<div class="step-header">
						<div class="step-title-line">
							<i class="fi {step.icon} step-icon"></i>
							<span class="step-title">Step {stepIndex + 1}: {step.title}</span>
							<span class="question-count"
								>{step.questions.length} question{step.questions.length !== 1 ? 's' : ''}</span
							>
						</div>
						<div class="step-actions">
							<button
								class="btn-icon"
								on:click={() => moveStep(stepIndex, -1)}
								disabled={stepIndex === 0}
								title="Move up"
								aria-label="Move step up"
							>
								<i class="fi fi-br-angle-up" aria-hidden="true"></i>
							</button>
							<button
								class="btn-icon"
								on:click={() => moveStep(stepIndex, 1)}
								disabled={stepIndex === steps.length - 1}
								title="Move down"
								aria-label="Move step down"
							>
								<i class="fi fi-br-angle-down" aria-hidden="true"></i>
							</button>
							<button
								class="btn-icon btn-icon-danger"
								on:click={() => removeStep(stepIndex)}
								title="Remove step"
								aria-label="Remove step"
							>
								<i class="fi fi-br-trash" aria-hidden="true"></i>
							</button>
						</div>
					</div>

					<!-- Questions in this step -->
					{#each step.questions as question, qIndex}
						<div class="question-row">
							<div class="question-info">
								<span class="question-title">{question.title}</span>
								<div class="question-meta">
									<span class="pill type-badge">{getTypeLabel(question.type)}</span>
									<span class="question-id">id: {question.id}</span>
									{#if question.required}
										<span class="pill pill-danger">Required</span>
									{/if}
									{#if question.options && question.options.length > 0}
										<span class="options-count">{question.options.length} options</span>
									{/if}
									{#if question.reject_if}
										<span class="pill pill-danger">Auto-reject</span>
									{/if}
									{#if question.team_scope && question.team_scope !== 'shared'}
										<span class="pill pill-warning">Team-scoped</span>
									{/if}
									{#if question.blinded}
										<span class="pill pill-info">Blinded</span>
									{/if}
								</div>
								{#if metaSummary(question)}
									<p class="meta-summary">{metaSummary(question)}</p>
								{/if}
							</div>
							<div class="question-actions">
								<button
									class="btn-icon"
									on:click={() => moveQuestion(stepIndex, qIndex, -1)}
									disabled={qIndex === 0}
									aria-label="Move question up"
								>
									<i class="fi fi-br-angle-up" aria-hidden="true"></i>
								</button>
								<button
									class="btn-icon"
									on:click={() => moveQuestion(stepIndex, qIndex, 1)}
									disabled={qIndex === step.questions.length - 1}
									aria-label="Move question down"
								>
									<i class="fi fi-br-angle-down" aria-hidden="true"></i>
								</button>
								<button
									class="btn-icon btn-icon-danger"
									on:click={() => removeQuestion(stepIndex, qIndex)}
									aria-label="Remove question"
								>
									<i class="fi fi-br-trash" aria-hidden="true"></i>
								</button>
							</div>
						</div>
					{/each}

					<!-- Add question to this step -->
					{#if addingQuestionToStep === stepIndex}
						<div class="add-question-form">
							<div class="field-row">
								<div class="field field-grow">
									<label class="field-label">Question ID</label>
									<input
										type="text"
										class="form-control"
										bind:value={newQ.id}
										placeholder="unique_id (no spaces)"
									/>
								</div>
								<div class="field field-grow">
									<label class="field-label">Type</label>
									<select class="form-control" bind:value={newQ.type}>
										{#each questionTypes as qt}
											<option value={qt.value}>{qt.label}</option>
										{/each}
									</select>
								</div>
							</div>
							<div class="field">
								<label class="field-label">Title</label>
								<input
									type="text"
									class="form-control"
									bind:value={newQ.title}
									placeholder="Question text shown to applicant"
								/>
							</div>
							<div class="field">
								<label class="field-label">Subtitle (optional)</label>
								<input
									type="text"
									class="form-control"
									bind:value={newQ.subtitle}
									placeholder="Helper text below title"
								/>
							</div>

							{#if ['radio', 'checkbox', 'checkbox_image', 'dropdown'].includes(newQ.type)}
								<div class="field">
									<label class="field-label">Options (one per line)</label>
									<textarea
										class="form-control"
										bind:value={optionsText}
										rows="4"
										placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
								</div>
							{/if}

							{#if newQ.type === 'input_dual'}
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label">Label 1</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.label1}
											placeholder="First"
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label">Label 2</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.label2}
											placeholder="Last"
										/>
									</div>
								</div>
							{/if}

							{#if newQ.type === 'checkbox_image'}
								<div class="field">
									<label class="field-label">Description</label>
									<textarea
										class="form-control"
										bind:value={newQ.description}
										rows="2"
										placeholder="Longer description text"></textarea>
								</div>
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label">Image URL</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.imageSrc}
											placeholder="/images/..."
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label">Image Alt Text</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.imageAlt}
											placeholder="Description of image"
										/>
									</div>
								</div>
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label">Link Name</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.linkName}
											placeholder="Read more"
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label">Link URL</label>
										<input
											type="text"
											class="form-control"
											bind:value={newQ.linkURL}
											placeholder="https://..."
										/>
									</div>
								</div>
							{/if}

							<div class="field">
								<label class="check-label">
									<input type="checkbox" bind:checked={newQ.required} />
									Required field
								</label>
							</div>

							<!-- V1 metadata: who sees this question, what disqualifies, what reviewers see -->
							<div class="meta-section">
								{#if teams.length > 0}
									<div class="field">
										<label class="field-label">Show this question to</label>
										<div class="scope-row">
											{#each teams as team (team.id)}
												<label
													class="scope-chip"
													class:scope-on={newQTeamSlugs.includes(team.slug)}
												>
													<input
														type="checkbox"
														checked={newQTeamSlugs.includes(team.slug)}
														on:change={() => toggleNewQTeam(team.slug)}
													/>
													{team.name}
												</label>
											{/each}
										</div>
										<p class="field-hint">
											{newQTeamSlugs.length === 0
												? 'No teams selected — shown to everyone.'
												: `Only applicants who pick ${newQTeamSlugs.length} selected team(s) will see this.`}
										</p>
									</div>
								{/if}

								<div class="field">
									<label class="field-label" for="reject-op"
										>Auto-reject the applicant if this answer…</label
									>
									<div class="reject-row">
										<select id="reject-op" class="form-control" bind:value={newQRejectOp}>
											<option value="">Never auto-reject</option>
											{#each rejectOps as op (op.value)}
												<option value={op.value}>{op.label}</option>
											{/each}
										</select>
										{#if rejectNeedsValue}
											<input
												type={NUMERIC_OPS.includes(newQRejectOp) ? 'number' : 'text'}
												class="form-control"
												bind:value={newQRejectValue}
												placeholder={LIST_OPS.includes(newQRejectOp)
													? 'Comma-separated values'
													: 'Value'}
											/>
										{/if}
									</div>
									{#if rejectValueInvalid}
										<p class="field-error">
											{NUMERIC_OPS.includes(newQRejectOp)
												? 'Enter a number.'
												: 'Enter a value to compare against.'}
										</p>
									{:else if newQRejectOp !== ''}
										<p class="field-hint">
											Applied automatically on submit. A blank answer never triggers auto-reject
											except with "is left blank".
										</p>
									{/if}
								</div>

								<div class="field">
									<label class="check-label">
										<input type="checkbox" bind:checked={newQ.blinded} />
										Hide this answer from blinded reviewers
									</label>
								</div>
							</div>

							<div class="btn-row">
								<button
									class="btn btn-tertiary btn-sm"
									disabled={rejectValueInvalid}
									on:click={() => addQuestion(stepIndex)}>Add Question</button
								>
								<button
									class="btn btn-quaternary btn-sm"
									on:click={() => {
										addingQuestionToStep = null;
										newQ = emptyQuestion();
										optionsText = '';
										resetQuestionMeta();
									}}>Cancel</button
								>
							</div>
						</div>
					{:else}
						<button
							class="add-question-btn"
							on:click={() => {
								addingQuestionToStep = stepIndex;
								newQ = emptyQuestion();
								optionsText = '';
							}}
						>
							<i class="fi fi-br-plus"></i> Add Question
						</button>
					{/if}
				</div>
			{/each}

			<!-- Save button at bottom too -->
			<div class="save-row">
				<button class="btn btn-tertiary" on:click={saveAll} disabled={saving}>
					{saving ? 'Saving...' : 'Save All Changes'}
				</button>
				{#if saveMessage}
					<span class="save-msg" class:error={saveMessage.startsWith('Error')}>{saveMessage}</span>
				{/if}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={6} />
</div>

{#if showPreview}
	<div
		class="modal-backdrop-luma"
		on:click={() => (showPreview = false)}
		on:keydown={(e) => e.key === 'Escape' && (showPreview = false)}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="modal-panel preview-modal" on:click|stopPropagation on:keydown|stopPropagation>
			<!-- Header -->
			<div class="preview-header">
				<div class="preview-header-left">
					<span class="preview-label">Form Preview</span>
					<span class="preview-job">{jobName}</span>
				</div>
				<button
					class="preview-close"
					on:click={() => (showPreview = false)}
					aria-label="Close preview">&times;</button
				>
			</div>

			<!-- Step sidebar -->
			<div class="preview-layout">
				<div class="preview-sidebar">
					{#each previewSteps as step, i}
						<button
							class="preview-step-btn"
							class:active={previewStep === i}
							on:click={() => (previewStep = i)}
						>
							<i class="fi {step.icon}"></i>
							<span>{step.title}</span>
						</button>
					{/each}
				</div>

				<!-- Step content -->
				<div class="preview-content">
					{#if currentPreviewStep}
						<h4 class="preview-step-title">{currentPreviewStep.title}</h4>

						{#if previewStep === 0}
							<!-- Personal info step mock -->
							<div class="card">
								<h5>First Name <span class="req-star">*</span></h5>
								<input type="text" class="form-control" placeholder="First name" disabled />
							</div>
							<div class="card">
								<h5>Last Name <span class="req-star">*</span></h5>
								<input type="text" class="form-control" placeholder="Last name" disabled />
							</div>
							<div class="card">
								<h5>Email Address <span class="req-star">*</span></h5>
								<input type="email" class="form-control" placeholder="you@example.com" disabled />
							</div>
						{:else if previewStep === previewSteps.length - 1}
							<!-- Review step mock -->
							<p class="muted">Applicants review all answers here before submitting.</p>
							<div class="card preview-dim">
								<h5>Personal Information</h5>
								<p class="muted">Name and email will appear here.</p>
							</div>
							{#each steps as step}
								<div class="card preview-dim">
									<h5>{step.title}</h5>
									{#each step.questions as q}
										<p class="subtle">{q.title}</p>
									{/each}
								</div>
							{/each}
						{:else if currentPreviewStep.questions.length === 0}
							<p class="muted">No questions in this step yet.</p>
						{:else}
							{#each currentPreviewStep.questions as question (question.id)}
								<QuestionRenderer {question} storagePrefix="__preview__" />
							{/each}
						{/if}

						<div class="preview-nav">
							<button
								class="btn btn-quaternary"
								disabled={previewStep === 0}
								on:click={() => previewStep--}
							>
								<i class="fi fi-br-arrow-left"></i> Back
							</button>
							<button
								class="btn btn-tertiary"
								disabled={previewStep === previewSteps.length - 1}
								on:click={() => previewStep++}
							>
								Next <i class="fi fi-br-arrow-right"></i>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../../../../styles/col.scss' as *;

	// Shared furniture (.page-head, .panel, .field/.field-label/.field-hint/
	// .field-error, .pill, .btn-icon, .empty-state, .muted/.subtle, .modal-*)
	// is global — src/styles/ui.scss. Only what's unique to the form builder
	// lives here.

	.save-msg {
		font-size: 13px;
		color: $success;
		font-weight: 600;
	}
	.save-msg.error {
		color: $danger;
	}

	.section-card {
		max-width: 600px;
		margin-bottom: 20px;
	}
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}
	// The one hint that introduces a whole section rather than a single field.
	.section-hint {
		margin-bottom: 15px;
	}

	.field-row {
		display: flex;
		gap: 12px;
	}
	.field-grow {
		flex: 1;
	}
	.check-label {
		display: flex !important;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		cursor: pointer;
	}
	.btn-row {
		display: flex;
		gap: 8px;
	}
	.save-row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-top: 20px;
	}

	// Icon grid
	.icon-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: 1px solid $border;
		border-radius: $radius-sm;
		background: $surface;
		cursor: pointer;
		font-size: 14px;
		color: $text-muted;
		transition: all 0.15s;
	}
	.icon-btn:hover {
		border-color: $yellow-primary;
		color: $dark-primary;
	}
	.icon-selected {
		border-color: $yellow-primary;
		background-color: rgba(255, 200, 0, 0.1);
		color: $dark-primary;
	}

	// Step cards
	.step-card {
		background-color: $surface;
		border-radius: $radius;
		padding: 16px 20px;
		margin-bottom: 12px;
		box-shadow: $shadow;
	}
	.step-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
	}
	.step-title-line {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.step-icon {
		font-size: 16px;
		color: $text-muted;
	}
	.step-title {
		font-weight: 700;
		font-size: 14px;
	}
	.question-count {
		font-size: 11px;
		color: $text-muted;
	}
	.step-actions {
		display: flex;
		gap: 4px;
	}

	// Question rows
	.question-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		margin-bottom: 4px;
		background-color: $light-secondary;
		border-radius: $radius-sm;
	}
	.question-info {
		flex: 1;
	}
	.question-title {
		font-size: 13px;
		font-weight: 600;
	}
	.question-meta {
		display: flex;
		gap: 8px;
		margin-top: 3px;
		align-items: center;
	}
	// Extends the shared `.pill`: the question TYPE reads as a solid dark chip so
	// it doesn't compete with the status-toned pills beside it.
	.type-badge {
		background-color: $dark-primary;
		color: $surface;
		text-transform: none;
	}
	.question-id {
		font-size: 10px;
		color: $text-muted;
		font-family: monospace;
	}
	.options-count {
		font-size: 10px;
		color: $text-muted;
	}

	/* V1 question metadata */
	.meta-summary {
		font-size: 11px;
		color: $text-muted;
		margin: 4px 0 0;
	}
	.meta-section {
		border-top: 1px solid $border;
		margin-top: 12px;
		padding-top: 12px;
	}
	.scope-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.scope-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		font-weight: 600;
		padding: 4px 10px;
		border: 1px solid $border;
		border-radius: $radius-pill;
		cursor: pointer;
	}
	.scope-on {
		border-color: $yellow-primary;
		background-color: rgba(255, 200, 0, 0.12);
	}
	.reject-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;

		select,
		input {
			max-width: 240px;
		}
	}
	.question-actions {
		display: flex;
		gap: 2px;
	}

	// Add question
	.add-question-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		margin-top: 8px;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		background: none;
		border: 1px dashed $border-strong;
		border-radius: $radius-sm;
		cursor: pointer;
		width: 100%;
		justify-content: center;
		transition: all 0.15s;
	}
	.add-question-btn:hover {
		border-color: $yellow-primary;
		color: $dark-primary;
	}

	.add-question-form {
		margin-top: 10px;
		padding: 15px;
		background-color: $light-secondary;
		border-radius: $radius-sm;
	}
	.add-step-card {
		max-width: 400px;
		margin-bottom: 15px;
	}

	/* Preview modal — sits on the shared `.modal-backdrop-luma` / `.modal-panel`
	   shell, but it is a full-bleed two-pane preview rather than a form dialog,
	   so it widens the panel and drops its padding. */
	.preview-modal {
		max-width: min(900px, 100%);
		max-height: calc(100vh - 48px);
		padding: 0;
		overflow: hidden;
		background: $light-secondary;
		display: flex;
		flex-direction: column;
	}
	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		background: $dark-primary;
		flex-shrink: 0;
	}
	.preview-header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.preview-label {
		font-size: 11px;
		font-weight: 700;
		color: $yellow-primary;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.preview-job {
		font-size: 14px;
		font-weight: 600;
		color: $surface;
	}
	.preview-close {
		background: none;
		border: none;
		color: $text-muted;
		font-size: 24px;
		cursor: pointer;
		line-height: 1;
		padding: 0 4px;
		&:hover {
			color: $surface;
		}
	}
	.preview-layout {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.preview-sidebar {
		width: 200px;
		flex-shrink: 0;
		background: $dark-primary;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-y: auto;
	}
	.preview-step-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		background: none;
		border: none;
		border-radius: $radius-sm;
		cursor: pointer;
		text-align: left;
		width: 100%;
		&:hover {
			background: $dark-secondary;
			color: $surface;
		}
		&.active {
			background: $dark-secondary;
			color: $surface;
		}
		i {
			font-size: 14px;
			flex-shrink: 0;
		}
	}
	.preview-content {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		background: $light-secondary;
	}
	.preview-step-title {
		margin-bottom: 16px;
	}
	.preview-dim {
		opacity: 0.6;
	}
	.preview-nav {
		display: flex;
		justify-content: space-between;
		margin-top: 20px;
		max-width: 500px;
	}
	.req-star {
		color: $danger;
	}
</style>
