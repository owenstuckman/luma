<script lang="ts">
	/**
	 * Editor for `organizations.settings.interview_forms` — the question bank the
	 * evaluate page prompts interviewers with, and the prompts they score.
	 *
	 * Text is edited raw, with `{org}` left as a placeholder, so renaming the org
	 * keeps the forms reading correctly. Existing ids/keys are never edited: stored
	 * evaluations are keyed by them. New entries get a fresh generated key.
	 */
	import {
		readInterviewForms,
		DEFAULT_INTERVIEW_FORMS,
		RATING_SCALE,
		type InterviewForms
	} from '$lib/utils/interviewForms';
	import { saveOrgSettingsSection } from '$lib/utils/orgConfig';
	import type { Organization } from '$lib/types';

	let { org }: { org: Organization } = $props();

	const clone = (f: InterviewForms): InterviewForms => JSON.parse(JSON.stringify(f));

	let forms = $state<InterviewForms>(clone(readInterviewForms(org.settings?.interview_forms)));
	let open = $state(false);
	let saving = $state(false);
	let message = $state('');
	let failed = $state(false);

	type ListKey = 'success_questions' | 'failure_questions';
	type PromptKey = 'individual_ratings' | 'group_ratings';

	const UNIVERSALS: ['universal_1' | 'universal_2', string][] = [
		['universal_1', 'Opening question'],
		['universal_2', 'Second universal question']
	];
	const QUESTION_LISTS: [ListKey, string][] = [
		['success_questions', 'Success questions'],
		['failure_questions', 'Failure / reflection questions']
	];
	const PROMPT_LISTS: [PromptKey, string][] = [
		['individual_ratings', 'Individual interview — scored prompts'],
		['group_ratings', 'Group interview — scored prompts']
	];

	/** A key not used by any entry in the list. */
	function freshKey(prefix: string, taken: string[]): string {
		let n = taken.length + 1;
		while (taken.includes(`${prefix}_${n}`)) n++;
		return `${prefix}_${n}`;
	}

	function addQuestion(list: ListKey) {
		const prefix = list === 'success_questions' ? 's_custom' : 'f_custom';
		forms[list] = [
			...forms[list],
			{
				id: freshKey(
					prefix,
					forms[list].map((q) => q.id)
				),
				text: ''
			}
		];
	}
	function addPrompt(list: PromptKey) {
		const prefix = list === 'individual_ratings' ? 'ind_custom' : 'grp_custom';
		forms[list] = [
			...forms[list],
			{
				key: freshKey(
					prefix,
					forms[list].map((p) => p.key)
				),
				label: ''
			}
		];
	}
	function removeAt<K extends ListKey | PromptKey>(list: K, index: number) {
		forms[list] = forms[list].filter((_, i) => i !== index) as InterviewForms[K];
	}

	async function save() {
		saving = true;
		message = '';
		failed = false;
		const cleaned: InterviewForms = {
			...forms,
			success_questions: forms.success_questions.filter((q) => q.text.trim()),
			failure_questions: forms.failure_questions.filter((q) => q.text.trim()),
			individual_ratings: forms.individual_ratings.filter((p) => p.label.trim()),
			group_ratings: forms.group_ratings.filter((p) => p.label.trim())
		};
		if (!cleaned.individual_ratings.length || !cleaned.group_ratings.length) {
			failed = true;
			message = 'Each form needs at least one scored prompt.';
			saving = false;
			return;
		}
		try {
			await saveOrgSettingsSection(org.id, 'interview_forms', cleaned);
			forms = clone(cleaned);
			message = 'Interview forms saved.';
			setTimeout(() => (message = ''), 3000);
		} catch (e) {
			failed = true;
			message = 'Failed to save: ' + (e instanceof Error ? e.message : String(e));
		}
		saving = false;
	}

	function resetToDefaults() {
		forms = clone(DEFAULT_INTERVIEW_FORMS);
		message = 'Defaults loaded — save to apply.';
		failed = false;
	}
</script>

<div class="card">
	<div class="card-head">
		<h5>Interview Forms</h5>
		<button class="btn btn-quaternary btn-sm" onclick={() => (open = !open)}>
			{open ? 'Hide' : 'Edit'}
		</button>
	</div>
	<p class="card-hint">
		The questions interviewers are prompted with and the prompts they score on the
		{RATING_SCALE.join(' / ')} scale. Use <code>{'{org}'}</code> for the organization's name.
	</p>

	{#if open}
		<span class="group-label">Individual interview</span>
		{#each UNIVERSALS as [key, label] (key)}
			<div class="field">
				<label class="field-label" for="if-{key}">{label}</label>
				<div class="inline">
					<input id="if-{key}" class="form-control form-control-sm" bind:value={forms[key].text} />
					<input
						class="form-control form-control-sm time"
						bind:value={forms[key].time}
						placeholder="time"
						aria-label="{label} time box"
					/>
				</div>
			</div>
		{/each}

		{#each QUESTION_LISTS as [list, label] (list)}
			<div class="field">
				<span class="field-label">{label}</span>
				{#each forms[list] as q, i (q.id)}
					<div class="inline">
						<input class="form-control form-control-sm" bind:value={q.text} />
						<button
							class="btn-icon btn-icon-danger"
							aria-label="Remove question"
							onclick={() => removeAt(list, i)}><i class="fi fi-br-cross-small"></i></button
						>
					</div>
				{/each}
				<button class="btn btn-quaternary btn-sm add" onclick={() => addQuestion(list)}
					>+ Add question</button
				>
			</div>
		{/each}

		{#each PROMPT_LISTS as [list, label] (list)}
			<span class="group-label">{label}</span>
			{#each forms[list] as p, i (p.key)}
				<div class="inline">
					<input class="form-control form-control-sm" bind:value={p.label} />
					<button
						class="btn-icon btn-icon-danger"
						aria-label="Remove prompt"
						onclick={() => removeAt(list, i)}><i class="fi fi-br-cross-small"></i></button
					>
				</div>
			{/each}
			<button class="btn btn-quaternary btn-sm add" onclick={() => addPrompt(list)}
				>+ Add prompt</button
			>
		{/each}

		<p class="field-hint">
			Removing a scored prompt hides it from new evaluations and averages; scores already given
			under it stay stored.
		</p>

		<div class="save-row">
			<button class="btn btn-tertiary" onclick={save} disabled={saving}>
				{saving ? 'Saving...' : 'Save Interview Forms'}
			</button>
			<button class="btn btn-quaternary btn-sm" onclick={resetToDefaults}>Reset to defaults</button>
		</div>
	{/if}
	{#if message}
		<p class={failed ? 'field-error' : 'ok-msg'}>{message}</p>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
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
	.inline {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-bottom: 4px;
	}
	.time {
		width: 80px;
		flex: none;
	}
	.add {
		margin-top: 2px;
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
		margin: 8px 0 0;
	}
</style>
