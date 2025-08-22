<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
</script>

<div class="layout">
  <div class="content">
    <h4>Application Submitted!</h4>
  </div>

  <Navbar/>

  <Sidebar currentStep={6}/>
</div>