<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import { updateJobPosting } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
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
    { value: 'availability', label: 'Availability Grid' },
  ];

  const iconOptions = [
    'fi-br-document', 'fi-br-shield-trust', 'fi-br-file-user', 'fi-br-employees',
    'fi-br-calendar-clock', 'fi-br-file-edit', 'fi-br-thumbs-up-trust',
    'fi-br-paper-plane', 'fi-br-star', 'fi-br-briefcase', 'fi-br-graduation-cap',
    'fi-br-settings', 'fi-br-check', 'fi-br-user', 'fi-br-envelope',
  ];

  function emptyQuestion(): FormQuestion {
    return {
      id: '',
      type: 'input',
      title: '',
      subtitle: '',
      options: [],
      required: false,
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
        questions: { steps } as any,
      });
      saveMessage = 'Saved!';
      setTimeout(() => { saveMessage = ''; }, 3000);
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
    const q = { ...newQ };
    // Clean up options
    if (q.options) q.options = q.options.filter(o => o.trim() !== '');
    steps[stepIndex].questions = [...steps[stepIndex].questions, q];
    steps = [...steps];
    newQ = emptyQuestion();
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
  $: newQ.options = optionsText.split('\n').filter(o => o.trim() !== '');

  function getTypeLabel(type: string) {
    return questionTypes.find(t => t.value === type)?.label || type;
  }
</script>

<div class="layout">
  <div class="content-left">
    <div class="page-header">
      <div>
        <a href="/private/{slug}/settings/jobs" class="back-link">
          <i class="fi fi-br-arrow-left"></i> Job Postings
        </a>
        <h4 style="text-align: left; margin-top: 10px;">Edit: {jobName || 'Loading...'}</h4>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        {#if saveMessage}
          <span class="save-msg" class:error={saveMessage.startsWith('Error')}>{saveMessage}</span>
        {/if}
        <button class="btn btn-tertiary" on:click={saveAll} disabled={saving}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>

    {#if loading}
      <p style="color: #878fa1;">Loading...</p>
    {:else}
      <!-- Job Details -->
      <div class="card section-card">
        <h5>Job Details</h5>
        <div class="field">
          <label>Position Name</label>
          <input type="text" class="form-control" bind:value={jobName} />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea class="form-control" bind:value={jobDescription} rows="2"></textarea>
        </div>
      </div>

      <!-- Form Steps -->
      <div class="section-header">
        <h5 style="margin: 0;">Application Form Steps</h5>
        <button class="btn btn-tertiary btn-sm" on:click={() => showAddStep = !showAddStep}>
          <i class="fi fi-br-plus"></i> Add Step
        </button>
      </div>

      <p class="hint">
        Each step becomes a page in the applicant's form. Personal info (name/email) and review/submit are added automatically.
      </p>

      {#if showAddStep}
        <div class="card add-step-card">
          <div class="field">
            <label>Step Title</label>
            <input type="text" class="form-control" bind:value={newStepTitle} placeholder="e.g. Verification" />
          </div>
          <div class="field">
            <label>Icon</label>
            <div class="icon-grid">
              {#each iconOptions as icon}
                <button
                  class="icon-btn"
                  class:icon-selected={newStepIcon === icon}
                  on:click={() => newStepIcon = icon}
                  title={icon}
                >
                  <i class="fi {icon}"></i>
                </button>
              {/each}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-tertiary btn-sm" on:click={addStep}>Add Step</button>
            <button class="btn btn-quaternary btn-sm" on:click={() => showAddStep = false}>Cancel</button>
          </div>
        </div>
      {/if}

      {#if steps.length === 0}
        <div class="empty-steps">
          <p style="color: #878fa1;">No form steps yet. Add a step to start building the application form.</p>
        </div>
      {/if}

      {#each steps as step, stepIndex}
        <div class="step-card">
          <div class="step-header">
            <div class="step-title-line">
              <i class="fi {step.icon}" style="font-size: 16px; color: #878fa1;"></i>
              <span class="step-title">Step {stepIndex + 1}: {step.title}</span>
              <span class="question-count">{step.questions.length} question{step.questions.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="step-actions">
              <button class="icon-action" on:click={() => moveStep(stepIndex, -1)} disabled={stepIndex === 0} title="Move up">
                <i class="fi fi-br-angle-up"></i>
              </button>
              <button class="icon-action" on:click={() => moveStep(stepIndex, 1)} disabled={stepIndex === steps.length - 1} title="Move down">
                <i class="fi fi-br-angle-down"></i>
              </button>
              <button class="icon-action danger" on:click={() => removeStep(stepIndex)} title="Remove step">
                <i class="fi fi-br-trash"></i>
              </button>
            </div>
          </div>

          <!-- Questions in this step -->
          {#each step.questions as question, qIndex}
            <div class="question-row">
              <div class="question-info">
                <span class="question-title">{question.title}</span>
                <div class="question-meta">
                  <span class="type-badge">{getTypeLabel(question.type)}</span>
                  <span class="question-id">id: {question.id}</span>
                  {#if question.required}
                    <span class="required-badge">Required</span>
                  {/if}
                  {#if question.options && question.options.length > 0}
                    <span class="options-count">{question.options.length} options</span>
                  {/if}
                </div>
              </div>
              <div class="question-actions">
                <button class="icon-action" on:click={() => moveQuestion(stepIndex, qIndex, -1)} disabled={qIndex === 0}>
                  <i class="fi fi-br-angle-up"></i>
                </button>
                <button class="icon-action" on:click={() => moveQuestion(stepIndex, qIndex, 1)} disabled={qIndex === step.questions.length - 1}>
                  <i class="fi fi-br-angle-down"></i>
                </button>
                <button class="icon-action danger" on:click={() => removeQuestion(stepIndex, qIndex)}>
                  <i class="fi fi-br-trash"></i>
                </button>
              </div>
            </div>
          {/each}

          <!-- Add question to this step -->
          {#if addingQuestionToStep === stepIndex}
            <div class="add-question-form">
              <div class="field-row">
                <div class="field" style="flex: 1;">
                  <label>Question ID</label>
                  <input type="text" class="form-control" bind:value={newQ.id} placeholder="unique_id (no spaces)" />
                </div>
                <div class="field" style="flex: 1;">
                  <label>Type</label>
                  <select class="form-control" bind:value={newQ.type}>
                    {#each questionTypes as qt}
                      <option value={qt.value}>{qt.label}</option>
                    {/each}
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Title</label>
                <input type="text" class="form-control" bind:value={newQ.title} placeholder="Question text shown to applicant" />
              </div>
              <div class="field">
                <label>Subtitle (optional)</label>
                <input type="text" class="form-control" bind:value={newQ.subtitle} placeholder="Helper text below title" />
              </div>

              {#if ['radio', 'checkbox', 'checkbox_image', 'dropdown'].includes(newQ.type)}
                <div class="field">
                  <label>Options (one per line)</label>
                  <textarea class="form-control" bind:value={optionsText} rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
                </div>
              {/if}

              {#if newQ.type === 'input_dual'}
                <div class="field-row">
                  <div class="field" style="flex: 1;">
                    <label>Label 1</label>
                    <input type="text" class="form-control" bind:value={newQ.label1} placeholder="First" />
                  </div>
                  <div class="field" style="flex: 1;">
                    <label>Label 2</label>
                    <input type="text" class="form-control" bind:value={newQ.label2} placeholder="Last" />
                  </div>
                </div>
              {/if}

              {#if newQ.type === 'checkbox_image'}
                <div class="field">
                  <label>Description</label>
                  <textarea class="form-control" bind:value={newQ.description} rows="2" placeholder="Longer description text"></textarea>
                </div>
                <div class="field-row">
                  <div class="field" style="flex: 1;">
                    <label>Image URL</label>
                    <input type="text" class="form-control" bind:value={newQ.imageSrc} placeholder="/images/..." />
                  </div>
                  <div class="field" style="flex: 1;">
                    <label>Image Alt Text</label>
                    <input type="text" class="form-control" bind:value={newQ.imageAlt} placeholder="Description of image" />
                  </div>
                </div>
                <div class="field-row">
                  <div class="field" style="flex: 1;">
                    <label>Link Name</label>
                    <input type="text" class="form-control" bind:value={newQ.linkName} placeholder="Read more" />
                  </div>
                  <div class="field" style="flex: 1;">
                    <label>Link URL</label>
                    <input type="text" class="form-control" bind:value={newQ.linkURL} placeholder="https://..." />
                  </div>
                </div>
              {/if}

              <div class="field">
                <label class="check-label">
                  <input type="checkbox" bind:checked={newQ.required} />
                  Required field
                </label>
              </div>

              <div style="display: flex; gap: 8px;">
                <button class="btn btn-tertiary btn-sm" on:click={() => addQuestion(stepIndex)}>Add Question</button>
                <button class="btn btn-quaternary btn-sm" on:click={() => { addingQuestionToStep = null; newQ = emptyQuestion(); optionsText = ''; }}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="add-question-btn" on:click={() => { addingQuestionToStep = stepIndex; newQ = emptyQuestion(); optionsText = ''; }}>
              <i class="fi fi-br-plus"></i> Add Question
            </button>
          {/if}
        </div>
      {/each}

      <!-- Save button at bottom too -->
      <div style="margin-top: 20px; display: flex; gap: 8px; align-items: center;">
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

<style lang="scss">
  @use '../../../../../../styles/col.scss' as *;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 15px;
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: $light-tertiary;
    font-size: 13px;
    font-weight: 600;
  }
  .back-link:hover { color: $dark-primary; }

  .save-msg {
    font-size: 13px;
    color: #22c55e;
    font-weight: 600;
  }
  .save-msg.error { color: #ef4444; }

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
  .hint {
    font-size: 12px;
    color: $light-tertiary;
    margin-bottom: 15px;
  }

  .field { margin-bottom: 10px; }
  .field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-bottom: 4px;
  }
  .field-row {
    display: flex;
    gap: 12px;
  }
  .check-label {
    display: flex !important;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-sm {
    font-size: 11px !important;
    padding: 4px 12px !important;
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
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 14px;
    color: $light-tertiary;
    transition: all 0.15s;
  }
  .icon-btn:hover { border-color: $yellow-primary; color: $dark-primary; }
  .icon-selected {
    border-color: $yellow-primary;
    background-color: rgba(255, 200, 0, 0.1);
    color: $dark-primary;
  }

  // Step cards
  .step-card {
    background-color: white;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 12px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.06);
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
  .step-title {
    font-weight: 700;
    font-size: 14px;
  }
  .question-count {
    font-size: 11px;
    color: $light-tertiary;
  }
  .step-actions {
    display: flex;
    gap: 4px;
  }
  .icon-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: $light-tertiary;
    cursor: pointer;
    font-size: 12px;
  }
  .icon-action:hover { background-color: $light-secondary; color: $dark-primary; }
  .icon-action:disabled { opacity: 0.3; cursor: default; }
  .icon-action.danger:hover { background-color: #fef2f2; color: #ef4444; }

  // Question rows
  .question-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 4px;
    background-color: $light-secondary;
    border-radius: 6px;
  }
  .question-info { flex: 1; }
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
  .type-badge {
    font-size: 10px;
    font-weight: 600;
    background-color: $dark-primary;
    color: white;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .question-id {
    font-size: 10px;
    color: $light-tertiary;
    font-family: monospace;
  }
  .required-badge {
    font-size: 10px;
    font-weight: 600;
    color: #ef4444;
  }
  .options-count {
    font-size: 10px;
    color: $light-tertiary;
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
    color: $light-tertiary;
    background: none;
    border: 1px dashed #d1d5db;
    border-radius: 6px;
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
    border-radius: 6px;
  }
  .add-step-card {
    max-width: 400px;
    margin-bottom: 15px;
  }

  .empty-steps {
    text-align: center;
    padding: 40px;
  }
</style>
