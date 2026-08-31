<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		supabase,
		getTeams,
		updateJobPosting,
		updateJobQuestions,
		getJobApplicantCount
	} from '$lib/utils/supabase';
	import { visibleSteps } from '$lib/utils/formSchema';
	import type { Team, RejectRule, TeamScope } from '$lib/types';
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

	// How many applications already exist for this posting. Drives the warnings
	// about orphaning collected answers — advisory only, never blocking.
	let applicantCount = 0;

	// Step editing (rename / re-icon) — one step open at a time.
	let editingStepIndex: number | null = null;

	// New step form
	let showAddStep = false;
	let newStepTitle = '';
	let newStepIcon = 'fi-br-document';

	// Question form. The same form serves "add" and "edit": `addingQuestionToStep`
	// is the step it is open on, `editingQuestionIndex` is null for a new question
	// and the index of the question being edited otherwise.
	let addingQuestionToStep: number | null = null;
	let editingQuestionIndex: number | null = null;
	/** The id the edited question had on open — compared to warn about orphaning. */
	let editingOriginalId = '';
	let newQ: FormQuestion = emptyQuestion();
	/** Stop auto-slugging the id from the title once it has been typed in. */
	let newQIdTouched = false;

	// --- V1 per-question metadata (team_scope / reject_if / blinded) ---
	// Held as flat UI state and folded into the question on save, because the
	// stored shapes are unions that are awkward to bind directly.
	let teams: Team[] = [];
	/** The three team_scope modes, as a single explicit choice. */
	let newQScopeMode: 'shared' | 'teams' | 'per_team' = 'shared';
	// --- Job-level team picker rules (schema.team_selection) ---
	// 0 = unlimited, which is also what an absent config means.
	let teamMax = 0;
	let teamRanked = false;
	let newQTeamSlugs: string[] = [];
	let newQRejectOp: '' | RejectRule['op'] = '';
	let newQRejectValue = '';
	let newQRejectList: string[] = [];

	/** Ops that need no operand — the rest read `newQRejectValue`/`newQRejectList`. */
	const NULLARY_OPS = ['truthy', 'falsy'];
	/** Ops whose operand is a list of values. */
	const LIST_OPS = ['in', 'not_in'];
	/** Ops whose operand must be numeric. */
	const NUMERIC_OPS = ['lt', 'gt'];
	/** Types whose answer comes from a fixed list — these must have options. */
	const CHOICE_TYPES = ['radio', 'checkbox', 'checkbox_image', 'dropdown'];

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

	/* ------------------------------------------------------------------ *
	 * team_scope helpers
	 *
	 * `TeamScope` is a three-branch union — 'shared' | { teams } | { per_team }.
	 * Everything that reads a scope goes through these so no call site has to
	 * assume `.teams` exists on every branch.
	 * ------------------------------------------------------------------ */

	function isPerTeamScope(scope: TeamScope | undefined): boolean {
		return !!scope && scope !== 'shared' && 'per_team' in scope && scope.per_team === true;
	}

	function scopeTeamSlugs(scope: TeamScope | undefined): string[] {
		if (!scope || scope === 'shared') return [];
		if ('teams' in scope && Array.isArray(scope.teams)) return scope.teams;
		return [];
	}

	function scopeModeOf(scope: TeamScope | undefined): 'shared' | 'teams' | 'per_team' {
		if (isPerTeamScope(scope)) return 'per_team';
		return scopeTeamSlugs(scope).length > 0 ? 'teams' : 'shared';
	}

	function teamName(slug: string): string {
		return teams.find((t) => t.slug === slug)?.name ?? slug;
	}

	/** Build the stored `team_scope` union from the flat form state. */
	function buildTeamScope(): TeamScope | undefined {
		// 'shared' serializes as ABSENT, matching the seeded schemas and keeping
		// no-op keys out of the stored JSON.
		if (newQScopeMode === 'shared') return undefined;
		if (newQScopeMode === 'per_team') return { per_team: true };
		if (newQTeamSlugs.length === 0) return undefined;
		return { teams: [...newQTeamSlugs] };
	}

	$: rejectNeedsValue = newQRejectOp !== '' && !NULLARY_OPS.includes(newQRejectOp);
	$: rejectIsList = newQRejectOp !== '' && LIST_OPS.includes(newQRejectOp);
	$: rejectIsNumeric = newQRejectOp !== '' && NUMERIC_OPS.includes(newQRejectOp);
	/** Choice questions offer their OWN options as the operand, not free text. */
	$: rejectFromOptions =
		CHOICE_TYPES.includes(newQ.type) && (newQ.options?.length ?? 0) > 0 && !rejectIsNumeric;
	$: rejectValueInvalid =
		rejectNeedsValue &&
		(rejectIsList
			? newQRejectList.length === 0
			: newQRejectValue.trim() === '' ||
				(rejectIsNumeric && !Number.isFinite(Number(newQRejectValue.trim()))));

	/** Build the stored `reject_if` union from the flat form state. */
	function buildRejectRule(): RejectRule | undefined {
		if (newQRejectOp === '') return undefined;
		const op = newQRejectOp;
		if (NULLARY_OPS.includes(op)) return { op } as RejectRule;
		if (LIST_OPS.includes(op)) {
			if (newQRejectList.length === 0) return undefined;
			return { op, value: [...newQRejectList] } as RejectRule;
		}
		const raw = newQRejectValue.trim();
		if (!raw) return undefined;
		if (NUMERIC_OPS.includes(op)) {
			const n = Number(raw);
			return Number.isFinite(n) ? ({ op, value: n } as RejectRule) : undefined;
		}
		return { op, value: raw } as RejectRule;
	}

	function toggleRejectListValue(value: string) {
		newQRejectList = newQRejectList.includes(value)
			? newQRejectList.filter((v) => v !== value)
			: [...newQRejectList, value];
	}

	function resetQuestionMeta() {
		newQScopeMode = 'shared';
		newQTeamSlugs = [];
		newQRejectOp = '';
		newQRejectValue = '';
		newQRejectList = [];
	}

	function toggleNewQTeam(slug: string) {
		newQTeamSlugs = newQTeamSlugs.includes(slug)
			? newQTeamSlugs.filter((s) => s !== slug)
			: [...newQTeamSlugs, slug];
	}

	/* ------------------------------------------------------------------ *
	 * Question ids
	 *
	 * The id is the key the answer is stored under, so a duplicate silently
	 * overwrites another question's answer. Non-empty, unique and key-safe are
	 * all enforced inline, and again in validateSchema() before any save.
	 * ------------------------------------------------------------------ */

	const ID_PATTERN = /^[A-Za-z0-9_]+$/;

	function slugifyId(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 48);
	}

	function onNewQTitleInput() {
		if (!newQIdTouched) newQ.id = slugifyId(newQ.title);
	}

	/** Every id in the schema except the question currently being edited. */
	$: takenIds = steps.flatMap((s, si) =>
		s.questions
			.filter((_, qi) => !(si === addingQuestionToStep && qi === editingQuestionIndex))
			.map((q) => q.id)
	);

	$: newQIdError = (() => {
		const v = newQ.id.trim();
		if (!v) return 'An id is required — it is the key this answer is stored under.';
		if (!ID_PATTERN.test(v)) return 'Letters, numbers and underscores only (no spaces or colons).';
		if (takenIds.includes(v)) return `"${v}" is already used by another question in this form.`;
		return '';
	})();

	$: newQTitleError = newQ.title.trim() ? '' : 'A title is required.';
	$: newQOptionsError =
		CHOICE_TYPES.includes(newQ.type) && (newQ.options?.length ?? 0) === 0
			? 'Add at least one option, one per line.'
			: '';
	$: newQScopeError =
		newQScopeMode === 'teams' && newQTeamSlugs.length === 0
			? 'Pick at least one team, or switch back to Shared.'
			: '';
	$: newQInvalid = Boolean(
		newQIdError || newQTitleError || newQOptionsError || newQScopeError || rejectValueInvalid
	);

	/** Renaming a key on a posting that already has answers orphans them. */
	$: idOrphanWarning =
		editingQuestionIndex !== null &&
		applicantCount > 0 &&
		newQ.id.trim() !== '' &&
		newQ.id.trim() !== editingOriginalId;

	/** Live `{team}` interpolation so per-team copy can be proof-read in place. */
	$: perTeamPreview =
		newQScopeMode === 'per_team'
			? teams.map((t) => ({
					name: t.name,
					title: (newQ.title || '').replace(/\{team\}/g, t.name),
					subtitle: (newQ.subtitle || '').replace(/\{team\}/g, t.name)
				}))
			: [];

	/** One-line summary of a question's V1 metadata, for the collapsed list row. */
	function metaSummary(q: FormQuestion): string {
		const bits: string[] = [];
		if (isPerTeamScope(q.team_scope)) {
			bits.push('asked once per selected team');
		} else {
			const slugs = scopeTeamSlugs(q.team_scope);
			if (slugs.length > 0) bits.push(slugs.map(teamName).join(' / '));
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
		teamMax = jobData.questions?.team_selection?.max ?? 0;
		teamRanked = jobData.questions?.team_selection?.ranked === true;
		// Empty when migration 00015 isn't applied — the team-scope control then
		// hides itself and questions stay shared, which is the correct default.
		if (jobData.org_id) teams = await getTeams(jobData.org_id);
		applicantCount = await getJobApplicantCount(jobId);
		loading = false;
	});

	/**
	 * Structural checks that must hold before anything is written. These are the
	 * failures that are silent at runtime rather than loud: a duplicate id
	 * overwrites an answer, an option-less dropdown renders an unanswerable
	 * question, an untitled step renders a blank page.
	 */
	function validateSchema(): string[] {
		const problems: string[] = [];
		const seen = new Map<string, string>();

		steps.forEach((step, si) => {
			if (!step.title.trim()) problems.push(`Step ${si + 1} needs a title.`);

			step.questions.forEach((q) => {
				const where = `Step ${si + 1} · "${q.title || q.id || 'untitled question'}"`;
				const id = (q.id ?? '').trim();

				if (!id) problems.push(`${where}: missing a question id.`);
				else if (!ID_PATTERN.test(id))
					problems.push(`${where}: id "${id}" may only contain letters, numbers and underscores.`);
				else if (seen.has(id))
					problems.push(`${where}: id "${id}" is already used by ${seen.get(id)}.`);
				else seen.set(id, where);

				if (!q.title.trim()) problems.push(`${where}: missing a title.`);
				if (CHOICE_TYPES.includes(q.type) && (q.options?.length ?? 0) === 0)
					problems.push(`${where}: a ${q.type} question needs at least one option.`);
			});
		});

		return problems;
	}

	let schemaProblems: string[] = [];

	async function saveAll() {
		if (!job) return;

		schemaProblems = validateSchema();
		if (schemaProblems.length > 0) {
			saveMessage = 'Error: fix the problems listed below.';
			return;
		}

		saving = true;
		saveMessage = '';

		try {
			await updateJobPosting(job.id, {
				name: jobName,
				description: jobDescription
			});
			// The schema is written on its own so a stale tab can't clobber a rename
			// made elsewhere — see updateJobQuestions in src/lib/utils/supabase.ts.
			// Omit `team_selection` entirely when it is at its defaults, so a job
			// that never cared about team limits keeps a clean schema.
			await updateJobQuestions(job.id, {
				steps,
				...(teamMax > 0 || teamRanked
					? {
							team_selection: {
								min: 1,
								...(teamMax > 0 ? { max: teamMax } : {}),
								ranked: teamRanked
							}
						}
					: {})
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
		const count = steps[index].questions.length;
		const extra =
			applicantCount > 0 && count > 0
				? `\n\n${applicantCount} application(s) already exist. Their answers to these ${count} question(s) stay in the database but stop being shown against this form.`
				: '';
		if (!confirm(`Remove step "${steps[index].title}" and all its questions?${extra}`)) return;
		steps = steps.filter((_, i) => i !== index);
		if (editingStepIndex === index) editingStepIndex = null;
		if (addingQuestionToStep === index) closeQuestionForm();
	}

	function moveStep(index: number, direction: -1 | 1) {
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= steps.length) return;
		const newSteps = [...steps];
		[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
		steps = newSteps;
		// Indices just moved; close anything anchored to one.
		editingStepIndex = null;
		closeQuestionForm();
	}

	function setStepIcon(index: number, icon: string) {
		steps[index].icon = icon;
		steps = [...steps];
	}

	// Question management
	function openAddQuestion(stepIndex: number) {
		addingQuestionToStep = stepIndex;
		editingQuestionIndex = null;
		editingOriginalId = '';
		newQ = emptyQuestion();
		newQIdTouched = false;
		optionsText = '';
		resetQuestionMeta();
	}

	function openEditQuestion(stepIndex: number, qIndex: number) {
		const q = steps[stepIndex].questions[qIndex];
		addingQuestionToStep = stepIndex;
		editingQuestionIndex = qIndex;
		editingOriginalId = q.id;
		newQ = { ...q, options: [...(q.options ?? [])] };
		newQIdTouched = true;
		optionsText = (q.options ?? []).join('\n');

		newQScopeMode = scopeModeOf(q.team_scope);
		newQTeamSlugs = scopeTeamSlugs(q.team_scope);
		newQRejectOp = q.reject_if?.op ?? '';
		newQRejectList =
			q.reject_if && 'value' in q.reject_if && Array.isArray(q.reject_if.value)
				? q.reject_if.value.map(String)
				: [];
		newQRejectValue =
			q.reject_if && 'value' in q.reject_if && !Array.isArray(q.reject_if.value)
				? String(q.reject_if.value)
				: '';
	}

	function closeQuestionForm() {
		addingQuestionToStep = null;
		editingQuestionIndex = null;
		editingOriginalId = '';
		newQ = emptyQuestion();
		newQIdTouched = false;
		optionsText = '';
		resetQuestionMeta();
	}

	function saveQuestion(stepIndex: number) {
		if (newQInvalid) return;

		const q: FormQuestion = { ...newQ, id: newQ.id.trim(), title: newQ.title.trim() };

		// Drop keys that don't apply, so the stored schema stays clean and
		// `undefined` never lands in the JSON.
		if (q.options) q.options = q.options.filter((o) => o.trim() !== '');
		if (!CHOICE_TYPES.includes(q.type)) delete q.options;
		if (!q.subtitle?.trim()) delete q.subtitle;
		if (!q.placeholder?.trim()) delete q.placeholder;
		if (!q.required) delete q.required;
		if (!q.maxLength) delete q.maxLength;
		if (!q.maxWords) delete q.maxWords;

		const scope = buildTeamScope();
		if (scope) q.team_scope = scope;
		else delete q.team_scope;

		const rule = buildRejectRule();
		if (rule) q.reject_if = rule;
		else delete q.reject_if;

		if (!q.blinded) delete q.blinded;

		if (editingQuestionIndex !== null) {
			steps[stepIndex].questions[editingQuestionIndex] = q;
		} else {
			steps[stepIndex].questions = [...steps[stepIndex].questions, q];
		}
		steps = [...steps];
		closeQuestionForm();
	}

	function removeQuestion(stepIndex: number, qIndex: number) {
		const q = steps[stepIndex].questions[qIndex];
		if (applicantCount > 0) {
			if (
				!confirm(
					`Remove "${q.title}"?\n\n${applicantCount} application(s) already answered this form. The answers stored under "${q.id}" are orphaned — they stay in the database but stop being shown.`
				)
			)
				return;
		}
		steps[stepIndex].questions = steps[stepIndex].questions.filter((_, i) => i !== qIndex);
		steps = [...steps];
		if (addingQuestionToStep === stepIndex) closeQuestionForm();
	}

	function moveQuestion(stepIndex: number, qIndex: number, direction: -1 | 1) {
		const newIndex = qIndex + direction;
		const qs = steps[stepIndex].questions;
		if (newIndex < 0 || newIndex >= qs.length) return;
		[qs[qIndex], qs[newIndex]] = [qs[newIndex], qs[qIndex]];
		steps[stepIndex].questions = [...qs];
		steps = [...steps];
		if (addingQuestionToStep === stepIndex) closeQuestionForm();
	}

	// Options helpers for the question form
	let optionsText = '';
	$: newQ.options = optionsText.split('\n').filter((o) => o.trim() !== '');

	function getTypeLabel(type: string) {
		return questionTypes.find((t) => t.value === type)?.label || type;
	}

	let showPreview = false;
	let previewStep = 0;

	// Preview as an applicant who selected EVERY team: that is the only view that
	// shows both team-scoped questions and every copy of a per-team question.
	$: allTeamSlugs = teams.map((t) => t.slug);
	// Expanded one step at a time so a step with no questions yet still appears
	// in the builder's preview (visibleSteps drops empty steps for applicants).
	$: expandedSteps = steps.map(
		(s) => visibleSteps({ steps: [s] }, allTeamSlugs, teams)[0] ?? { ...s, questions: [] }
	);
	$: previewSteps = [
		{ title: 'Personal Info', icon: 'fi-br-file-user', questions: [] as FormQuestion[] },
		...expandedSteps,
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
			{#if applicantCount > 0}
				<div class="alert-soft alert-warning live-warning">
					<strong
						>{applicantCount} application{applicantCount === 1 ? '' : 's'} already submitted.</strong
					>
					You can still edit this form, but answers are stored under each question's
					<strong>id</strong>. Renaming or deleting a question orphans the answers already collected
					under the old id — they stay in the database and stop appearing against this question.
					Adding questions and editing wording is always safe.
				</div>
			{/if}

			<!-- Job Details -->
			<div class="panel section-card">
				<div class="panel-head">
					<h5 class="panel-title">Job Details</h5>
				</div>
				<div class="field">
					<label class="field-label" for="job-name">Position Name</label>
					<input id="job-name" type="text" class="form-control" bind:value={jobName} />
				</div>
				<div class="field">
					<label class="field-label" for="job-desc">Description</label>
					<textarea id="job-desc" class="form-control" bind:value={jobDescription} rows="2"
					></textarea>
				</div>

				{#if teams.length > 0}
					<div class="field">
						<label class="field-label" for="job-team-max">Teams an applicant may pick</label>
						<input
							id="job-team-max"
							type="number"
							min="0"
							max={teams.length}
							class="form-control team-max-input"
							bind:value={teamMax}
						/>
						<p class="field-hint">
							0 means no limit. Each team picked is still submitted as its own separate application.
						</p>
					</div>
					<div class="field">
						<label class="field-label toggle-label">
							<input type="checkbox" bind:checked={teamRanked} />
							Ask applicants to rank their choices
						</label>
						<p class="field-hint">
							Applicants order the teams they picked; the position is stored on each application as
							its rank. Advisory only — it never affects review.
						</p>
					</div>
				{/if}
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
						<label class="field-label" for="new-step-title">Step Title</label>
						<input
							id="new-step-title"
							type="text"
							class="form-control"
							bind:value={newStepTitle}
							placeholder="e.g. Verification"
						/>
					</div>
					<div class="field">
						<span class="field-label">Icon</span>
						<div class="icon-grid">
							{#each iconOptions as icon (icon)}
								<button
									class="icon-btn"
									class:icon-selected={newStepIcon === icon}
									on:click={() => (newStepIcon = icon)}
									title={icon}
									aria-label={icon}
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
							<span class="step-title">Step {stepIndex + 1}: {step.title || '(untitled)'}</span>
							<span class="question-count"
								>{step.questions.length} question{step.questions.length !== 1 ? 's' : ''}</span
							>
						</div>
						<div class="step-actions">
							<button
								class="btn-icon"
								on:click={() =>
									(editingStepIndex = editingStepIndex === stepIndex ? null : stepIndex)}
								title="Rename step"
								aria-label="Rename step"
							>
								<i class="fi fi-br-file-edit" aria-hidden="true"></i>
							</button>
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

					{#if editingStepIndex === stepIndex}
						<div class="step-edit">
							<div class="field">
								<label class="field-label" for="step-title-{stepIndex}">Step title</label>
								<input
									id="step-title-{stepIndex}"
									type="text"
									class="form-control"
									bind:value={step.title}
									on:input={() => (steps = [...steps])}
								/>
								{#if !step.title.trim()}
									<p class="field-error">A step needs a title.</p>
								{/if}
							</div>
							<div class="field">
								<span class="field-label">Icon</span>
								<div class="icon-grid">
									{#each iconOptions as icon (icon)}
										<button
											class="icon-btn"
											class:icon-selected={step.icon === icon}
											on:click={() => setStepIcon(stepIndex, icon)}
											title={icon}
											aria-label={icon}
										>
											<i class="fi {icon}"></i>
										</button>
									{/each}
								</div>
							</div>
							<button class="btn btn-quaternary btn-sm" on:click={() => (editingStepIndex = null)}
								>Done</button
							>
						</div>
					{/if}

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
									{#if isPerTeamScope(question.team_scope)}
										<span class="pill pill-warning">Per team</span>
									{:else if scopeTeamSlugs(question.team_scope).length > 0}
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
									on:click={() => openEditQuestion(stepIndex, qIndex)}
									title="Edit question"
									aria-label="Edit question"
								>
									<i class="fi fi-br-file-edit" aria-hidden="true"></i>
								</button>
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

					<!-- Add / edit a question in this step -->
					{#if addingQuestionToStep === stepIndex}
						<div class="add-question-form">
							<div class="form-heading">
								{editingQuestionIndex !== null ? 'Edit question' : 'New question'}
							</div>

							<div class="field">
								<label class="field-label" for="q-title">Title</label>
								<input
									id="q-title"
									type="text"
									class="form-control"
									bind:value={newQ.title}
									on:input={onNewQTitleInput}
									placeholder="Question text shown to applicant"
								/>
								{#if newQTitleError}
									<p class="field-error">{newQTitleError}</p>
								{/if}
							</div>

							<div class="field-row">
								<div class="field field-grow">
									<label class="field-label" for="q-id">Question ID</label>
									<input
										id="q-id"
										type="text"
										class="form-control mono-input"
										bind:value={newQ.id}
										on:input={() => (newQIdTouched = true)}
										placeholder="unique_key"
									/>
									{#if newQIdError}
										<p class="field-error">{newQIdError}</p>
									{:else}
										<p class="field-hint">
											The key this answer is stored under. Auto-filled from the title; edit it
											freely, but it must be unique across the whole form.
										</p>
									{/if}
								</div>
								<div class="field field-grow">
									<label class="field-label" for="q-type">Type</label>
									<select id="q-type" class="form-control" bind:value={newQ.type}>
										{#each questionTypes as qt (qt.value)}
											<option value={qt.value}>{qt.label}</option>
										{/each}
									</select>
								</div>
							</div>

							{#if idOrphanWarning}
								<div class="alert-soft alert-warning inline-alert">
									Changing this id from <code>{editingOriginalId}</code> to
									<code>{newQ.id.trim()}</code>
									orphans the answers {applicantCount} applicant{applicantCount === 1 ? '' : 's'}
									already gave under the old id.
								</div>
							{/if}

							<div class="field">
								<label class="field-label" for="q-subtitle">Subtitle (optional)</label>
								<input
									id="q-subtitle"
									type="text"
									class="form-control"
									bind:value={newQ.subtitle}
									placeholder="Helper text below title"
								/>
							</div>

							<div class="field-row">
								<div class="field field-grow">
									<label class="field-label" for="q-placeholder">Placeholder (optional)</label>
									<input
										id="q-placeholder"
										type="text"
										class="form-control"
										bind:value={newQ.placeholder}
									/>
								</div>
								<div class="field maxlen-field">
									<label class="field-label" for="q-maxlength">Max length (optional)</label>
									<input
										id="q-maxlength"
										type="number"
										min="1"
										class="form-control"
										bind:value={newQ.maxLength}
									/>
								</div>
								<div class="field maxlen-field">
									<label class="field-label" for="q-maxwords">Max words (optional)</label>
									<input
										id="q-maxwords"
										type="number"
										min="1"
										class="form-control"
										bind:value={newQ.maxWords}
									/>
									<p class="field-hint">
										Applicants see a live counter and can't submit while over.
									</p>
								</div>
							</div>

							{#if CHOICE_TYPES.includes(newQ.type)}
								<div class="field">
									<label class="field-label" for="q-options">Options (one per line)</label>
									<textarea
										id="q-options"
										class="form-control"
										bind:value={optionsText}
										rows="4"
										placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
									{#if newQOptionsError}
										<p class="field-error">{newQOptionsError}</p>
									{/if}
								</div>
							{/if}

							{#if newQ.type === 'input_dual'}
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label" for="q-label1">Label 1</label>
										<input
											id="q-label1"
											type="text"
											class="form-control"
											bind:value={newQ.label1}
											placeholder="First"
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label" for="q-label2">Label 2</label>
										<input
											id="q-label2"
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
									<label class="field-label" for="q-description">Description</label>
									<textarea
										id="q-description"
										class="form-control"
										bind:value={newQ.description}
										rows="2"
										placeholder="Longer description text"></textarea>
								</div>
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label" for="q-image">Image URL</label>
										<input
											id="q-image"
											type="text"
											class="form-control"
											bind:value={newQ.imageSrc}
											placeholder="/images/..."
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label" for="q-image-alt">Image Alt Text</label>
										<input
											id="q-image-alt"
											type="text"
											class="form-control"
											bind:value={newQ.imageAlt}
											placeholder="Description of image"
										/>
									</div>
								</div>
								<div class="field-row">
									<div class="field field-grow">
										<label class="field-label" for="q-link-name">Link Name</label>
										<input
											id="q-link-name"
											type="text"
											class="form-control"
											bind:value={newQ.linkName}
											placeholder="Read more"
										/>
									</div>
									<div class="field field-grow">
										<label class="field-label" for="q-link-url">Link URL</label>
										<input
											id="q-link-url"
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
										<span class="field-label">Who sees this question</span>
										<div class="scope-row">
											<label class="chip" class:chip-selected={newQScopeMode === 'shared'}>
												<input type="radio" bind:group={newQScopeMode} value="shared" />
												Shared
											</label>
											<label class="chip" class:chip-selected={newQScopeMode === 'teams'}>
												<input type="radio" bind:group={newQScopeMode} value="teams" />
												Specific teams
											</label>
											<label class="chip" class:chip-selected={newQScopeMode === 'per_team'}>
												<input type="radio" bind:group={newQScopeMode} value="per_team" />
												Once per team
											</label>
										</div>

										{#if newQScopeMode === 'shared'}
											<p class="field-hint">
												Everyone who applies answers this once, whatever teams they picked.
											</p>
										{:else if newQScopeMode === 'teams'}
											<div class="scope-row scope-teams">
												{#each teams as team (team.id)}
													<label
														class="chip"
														class:chip-selected={newQTeamSlugs.includes(team.slug)}
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
											{#if newQScopeError}
												<p class="field-error">{newQScopeError}</p>
											{:else}
												<p class="field-hint">
													Shown only to applicants who picked at least one of these teams, and asked
													once no matter how many of them they picked.
												</p>
											{/if}
										{:else}
											<p class="field-hint">
												Asked <strong>separately for each team</strong> the applicant selects — an
												applicant who picks two teams answers it twice, once per team, and each
												answer belongs to that team's own application. Write
												<code>&#123;team&#125;</code> in the title, subtitle or placeholder and it is
												replaced with that team's name.
											</p>
											{#if perTeamPreview.length > 0}
												<div class="per-team-preview">
													<p class="hint">An applicant who picked every team would see:</p>
													{#each perTeamPreview as row (row.name)}
														<div class="per-team-row">
															<span class="pill pill-neutral">{row.name}</span>
															<div>
																<div class="per-team-title">
																	{row.title || '(no title yet)'}
																</div>
																{#if row.subtitle}
																	<div class="subtle">{row.subtitle}</div>
																{/if}
															</div>
														</div>
													{/each}
												</div>
											{/if}
										{/if}
									</div>
								{/if}

								<div class="field">
									<label class="field-label" for="reject-op"
										>Auto-reject this application if the answer…</label
									>
									<div class="reject-row">
										<select id="reject-op" class="form-control" bind:value={newQRejectOp}>
											<option value="">Never auto-reject</option>
											{#each rejectOps as op (op.value)}
												<option value={op.value}>{op.label}</option>
											{/each}
										</select>
										{#if rejectNeedsValue && !rejectIsList}
											{#if rejectFromOptions}
												<select class="form-control" bind:value={newQRejectValue}>
													<option value="">Choose an option…</option>
													{#each newQ.options ?? [] as opt (opt)}
														<option value={opt}>{opt}</option>
													{/each}
												</select>
											{:else if rejectIsNumeric}
												<input type="number" class="form-control" bind:value={newQRejectValue} />
											{:else}
												<input
													type="text"
													class="form-control"
													bind:value={newQRejectValue}
													placeholder="Value"
												/>
											{/if}
										{/if}
									</div>

									{#if rejectIsList}
										{#if rejectFromOptions}
											<div class="scope-row reject-values">
												{#each newQ.options ?? [] as opt (opt)}
													<label class="chip" class:chip-selected={newQRejectList.includes(opt)}>
														<input
															type="checkbox"
															checked={newQRejectList.includes(opt)}
															on:change={() => toggleRejectListValue(opt)}
														/>
														{opt}
													</label>
												{/each}
											</div>
										{:else}
											<input
												type="text"
												class="form-control reject-values"
												value={newQRejectList.join(', ')}
												on:input={(e) =>
													(newQRejectList = e.currentTarget.value
														.split(',')
														.map((s) => s.trim())
														.filter(Boolean))}
												placeholder="Comma-separated values"
											/>
										{/if}
									{/if}

									{#if rejectValueInvalid}
										<p class="field-error">
											{rejectIsList
												? 'Choose at least one value.'
												: rejectIsNumeric
													? 'Enter a number.'
													: 'Enter a value to compare against.'}
										</p>
									{/if}

									{#if newQRejectOp !== ''}
										<div class="alert-soft alert-error inline-alert">
											<strong>Destructive and silent.</strong> When this rule matches, the
											application is denied automatically on submit — no reviewer sees it, and no
											email is sent unless one is enabled in settings. It denies
											<strong>only this team's application</strong>, not the candidate: someone who
											applied to two teams keeps the other application, which stays pending. A blank
											answer never triggers a rule except “is left blank”.
										</div>
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
									disabled={newQInvalid}
									on:click={() => saveQuestion(stepIndex)}
								>
									{editingQuestionIndex !== null ? 'Apply Changes' : 'Add Question'}
								</button>
								<button class="btn btn-quaternary btn-sm" on:click={closeQuestionForm}
									>Cancel</button
								>
							</div>
						</div>
					{:else}
						<button class="add-question-btn" on:click={() => openAddQuestion(stepIndex)}>
							<i class="fi fi-br-plus"></i> Add Question
						</button>
					{/if}
				</div>
			{/each}

			{#if schemaProblems.length > 0}
				<div class="alert-soft alert-error schema-problems">
					<strong>This form can't be saved yet:</strong>
					<ul>
						{#each schemaProblems as problem, pi (pi)}
							<li>{problem}</li>
						{/each}
					</ul>
				</div>
			{/if}

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

						{#if teams.length > 0 && previewStep !== 0 && previewStep !== previewSteps.length - 1}
							<p class="hint preview-note">
								Previewing as an applicant who selected every team, so team-scoped questions and
								every copy of a per-team question are shown.
							</p>
						{/if}

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
							{#each expandedSteps as step}
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

	.team-max-input {
		max-width: 120px;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	// Shared furniture (.page-head, .panel, .field/.field-label/.field-hint/
	// .field-error, .pill, .chip, .alert-soft, .btn-icon, .empty-state,
	// .muted/.subtle/.hint, .modal-*) is global — src/styles/ui.scss. Only what's
	// unique to the form builder lives here.

	.save-msg {
		font-size: 13px;
		color: $success;
		font-weight: 600;
	}
	.save-msg.error {
		color: $danger;
	}

	// A shared alert used as a page banner / inline field note.
	.live-warning {
		max-width: 760px;
		margin-bottom: 16px;
		font-size: 12px;
	}
	.inline-alert {
		margin: 8px 0 0;
		font-size: 12px;

		code {
			font-size: 11px;
		}
	}
	.schema-problems {
		max-width: 760px;
		margin-top: 16px;
		font-size: 12px;

		ul {
			margin: 6px 0 0;
			padding-left: 18px;
		}
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
		flex-wrap: wrap;
	}
	.field-grow {
		flex: 1;
		min-width: 180px;
	}
	.maxlen-field {
		width: 150px;
	}
	.mono-input {
		font-family: monospace;
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
	.step-edit {
		padding: 12px 14px;
		margin-bottom: 10px;
		background-color: $light-secondary;
		border-radius: $radius-sm;
		max-width: 460px;
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
		flex-wrap: wrap;
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
	.scope-teams {
		margin-top: 8px;
	}
	.per-team-preview {
		margin-top: 8px;
		padding: 10px 12px;
		background-color: $surface;
		border: 1px solid $border;
		border-radius: $radius-sm;
		max-width: 520px;
	}
	.per-team-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 8px;
	}
	.per-team-title {
		font-size: 13px;
		font-weight: 600;
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
	.reject-values {
		margin-top: 8px;
		max-width: 460px;
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
	.form-heading {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: $text-muted;
		margin-bottom: 10px;
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
	.preview-note {
		margin-bottom: 12px;
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
