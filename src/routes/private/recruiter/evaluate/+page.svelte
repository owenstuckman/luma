<script>
	import Sidebar from "$lib/components/recruiter/Sidebar.svelte";
  import Navbar from "$lib/components/recruiter/Navbar.svelte";
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Evaluate Interviewees</h4>
  </div>

  <Navbar/>
  <Sidebar currentStep={5}/>

</div>