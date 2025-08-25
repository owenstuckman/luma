<script>
	import Sidebar from "$lib/components/recruiter/Sidebar.svelte";
  import Navbar from "$lib/components/recruiter/Navbar.svelte";

  import ApplicantCard from '$lib/components/applicantCard.svelte';
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Review Applications</h4>
    <ApplicantCard />
  </div>

  <Navbar/>
  <Sidebar currentStep={1}/>

</div>