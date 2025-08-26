<script lang="ts">
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import Warning from "$lib/components/applicant/Warning.svelte";
  import ApplicantInfo from "$lib/components/ApplicantInfo.svelte";

  import { onMount } from 'svelte';

  let warnings: string[] = [];
  let recruitInfo: Record<string, any> = [];

  onMount(() => {
    Object.entries(localStorage).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)){
        warnings.push(key);
      }
      recruitInfo[key] = value;
    });
    warnings = [...warnings];
  });
</script>

<div class="layout">
  <div class="content">
    <h4>Review Your Application</h4>
    <p>Ensure to review all the information you have provided before submitting. If you have no warnings below, feel free to continue or disregard warnings!</p>

    {#if warnings.length > 0}
      {#each warnings as key}
        <Warning message={`Warning: The value for ${key} is invalid or missing.`} />
      {/each}
    {:else}
      <p>No warnings to display.</p>
    {/if}

    <ApplicantInfo {recruitInfo} />

    <Footer backNav="/applicant/5_free_response" nextNav="/applicant/7_submit" nextText="Go To Submit"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={5}/>
</div>