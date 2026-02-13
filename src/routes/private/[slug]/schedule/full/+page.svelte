<script>
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Full Schedule</h4>
    <p style="color: #878fa1;">All interviews across interviewers will appear here.</p>
  </div>

  <Navbar />
  <Sidebar currentStep={3} collapse="uncollapse" />
</div>
