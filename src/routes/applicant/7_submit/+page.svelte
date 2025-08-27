<script lang="ts">
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";

  import { sendApplicationFall2025 } from "$lib/utils/supabase";
  import { goto } from '$app/navigation'; // Import the goto function for navigation

  let errorMessage: string = "";

  async function submitApplication() {
    try {
      const firstName = localStorage.getItem('firstName') || '';
      const lastName = localStorage.getItem('lastName') || ''; // Fixed typo in key
      const email = localStorage.getItem('email') || '';
      const recruitInfo: Record<string, string> = {}; // Use Record for type declaration

      // Collect all relevant keys and values from localStorage
      Object.entries(localStorage).forEach(([key, value]) => {
        if (!['firstName', 'lastName', 'email'].includes(key)) { // Fixed key casing
          recruitInfo[key] = value; // Store key-value pairs in recruitInfo
        }
      });

      const job = 1; // hardcoded the id 

      await sendApplicationFall2025(`${firstName} ${lastName}`, email, recruitInfo, job); 
      console.log('Application submitted successfully');

      goto('/applicant/success'); // Navigate to the success page

      localStorage.clear();
      console.log('Cleared localstorage!');
    } catch (error) {
      console.error('Failed to send application:', error);
      errorMessage = error as string;
      errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setTimeout(() => { errorMessage = ""; }, 10000); // Clear the error message after 5 seconds
    }
  }
</script>

<div class="layout">
  <div class="content">
    <h4>Submit Your Application!</h4>

    <div class="flex items-center justify-center mt-4">
      <button on:click={submitApplication} type="button" class="btn btn-tertiary">
        Submit Application
      </button>
    </div>

    <Footer backNav="/applicant/6_review" />
  </div>

  {#if errorMessage}
    <div style="color: red; margin-top: 1rem;">
      {errorMessage}
    </div>
  {/if}
  <Navbar />

  <Sidebar currentStep={6} />
</div>