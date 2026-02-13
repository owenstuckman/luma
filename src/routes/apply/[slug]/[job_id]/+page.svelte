<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import { sendApplication } from '$lib/utils/supabase';
  import type { Organization, JobPosting, FormStep } from '$lib/types';
  import QuestionRenderer from '$lib/components/QuestionRenderer.svelte';

  let org: Organization | null = null;
  let job: JobPosting | null = null;
  let steps: FormStep[] = [];
  let currentStep = 0;
  let loading = true;
  let error = '';
  let submitting = false;
  let submitError = '';

  // Name/email are always collected (step 0 is auto-generated)
  let firstName = '';
  let lastName = '';
  let email = '';

  $: totalSteps = steps.length + 2; // +1 for personal info, +1 for review/submit
  $: isFirstStep = currentStep === 0;
  $: isLastStep = currentStep === totalSteps - 1;
  $: isReviewStep = currentStep === totalSteps - 1;
  $: currentFormStep = currentStep > 0 && currentStep < totalSteps - 1 ? steps[currentStep - 1] : null;
  $: storagePrefix = job ? `job_${job.id}` : '';

  onMount(async () => {
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
    steps = jobData.questions?.steps || [];

    // Load personal info from localStorage
    firstName = localStorage.getItem(`${storagePrefix}_firstName`) || '';
    lastName = localStorage.getItem(`${storagePrefix}_lastName`) || '';
    email = localStorage.getItem(`${storagePrefix}_email`) || '';

    // Check URL for step param
    const stepParam = $page.url.searchParams.get('step');
    if (stepParam) currentStep = Number(stepParam);

    loading = false;
  });

  function nextStep() {
    if (currentStep === 0) {
      localStorage.setItem(`${storagePrefix}_firstName`, firstName);
      localStorage.setItem(`${storagePrefix}_lastName`, lastName);
      localStorage.setItem(`${storagePrefix}_email`, email);
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
      const recruitInfo: Record<string, string> = {};

      // Collect all question answers from localStorage
      for (const step of steps) {
        for (const q of step.questions) {
          const key = `${storagePrefix}_${q.id}`;
          if (q.type === 'input_dual') {
            const v1 = localStorage.getItem(`${key}_1`) || '';
            const v2 = localStorage.getItem(`${key}_2`) || '';
            recruitInfo[q.id] = `${v1} | ${v2}`;
          } else {
            recruitInfo[q.id] = localStorage.getItem(key) || '';
          }
        }
      }

      await sendApplication({
        name: `${firstName} ${lastName}`,
        email,
        recruitInfo,
        job: job.id,
        org_id: org.id,
      });

      // Clear localStorage for this application
      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith(storagePrefix));
      keysToRemove.forEach(k => localStorage.removeItem(k));

      goto(`/apply/${org!.slug}/${job!.id}/success`);
    } catch (err) {
      submitError = err instanceof Error ? err.message : 'An unknown error occurred.';
      setTimeout(() => { submitError = ''; }, 10000);
    } finally {
      submitting = false;
    }
  }

  // Sidebar step labels
  $: sidebarSteps = [
    { title: 'Personal Info', icon: 'fi-br-file-user' },
    ...steps.map(s => ({ title: s.title, icon: s.icon })),
    { title: 'Review & Submit', icon: 'fi-br-paper-plane' },
  ];
</script>

{#if loading}
  <div class="loading-screen"><p>Loading application...</p></div>
{:else if error}
  <div class="loading-screen">
    <div class="error-card">
      <h2 style="color: white;">{error}</h2>
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
              <img src={org.logo_url} alt="{org.name}" style="height: 30px; width: auto;" />
            {:else}
              <img src="/images/ui/logo_white.png" alt="LUMA" style="height: 30px; width: auto;" />
            {/if}
          </a>
        </div>
        <div class="navbar-year">
          <button class="btn btn-secondary" type="button"
            on:click={() => {
              const keys = Object.keys(localStorage).filter(k => k.startsWith(storagePrefix));
              keys.forEach(k => localStorage.removeItem(k));
              firstName = ''; lastName = ''; email = '';
              currentStep = 0;
            }}>
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

    <!-- Content -->
    <div class="content">
      {#if currentStep === 0}
        <!-- Personal Info (always required) -->
        <h4>Personal Information</h4>
        <div class="card">
          <h5>First Name</h5>
          <input type="text" class="form-control" bind:value={firstName} placeholder="First name" />
        </div>
        <div class="card">
          <h5>Last Name</h5>
          <input type="text" class="form-control" bind:value={lastName} placeholder="Last name" />
        </div>
        <div class="card">
          <h5>Email Address</h5>
          <input type="email" class="form-control" bind:value={email} placeholder="you@example.com" />
        </div>
      {:else if isReviewStep}
        <!-- Review & Submit -->
        <h4>Review & Submit</h4>
        <div class="card">
          <h5>Your Information</h5>
          <p><strong>Name:</strong> {firstName} {lastName}</p>
          <p><strong>Email:</strong> {email}</p>
        </div>

        {#if submitError}
          <div style="color: red; margin-top: 1rem;">{submitError}</div>
        {/if}

        <button
          on:click={submitApplication}
          class="btn btn-tertiary"
          style="margin-top: 20px; padding: 10px 40px;"
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Application'}
        </button>
      {:else if currentFormStep}
        <!-- Dynamic question step -->
        <h4>{currentFormStep.title}</h4>
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
  .navbar-left { display: flex; }
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
  .navbar-right { display: flex; }

  .sidebar {
    grid-area: sidebar;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 5px;
    background-color: $dark-primary;
  }
  .step-sidebar {
    display: flex;
    margin-top: 5px;
    margin-bottom: 5px;
    padding-left: 10px;
    height: 35px;
    width: 195px;
    font-weight: 600;
    align-items: center;
    justify-content: start;
    background-color: transparent;
    border: none;
    font-size: 12px;
    color: white;
  }
  .step-sidebar i {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-right: 15px;
  }
  .step-selected .step-sidebar {
    background-color: $dark-secondary;
    border-radius: 5px;
  }
  .step-disabled .step-sidebar {
    color: $light-tertiary;
  }

  .footer-nav {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 500px;
    margin-top: 20px;
    padding: 10px 0;
  }
</style>
