<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
</script>

<div class="layout">
  <div class="content">
    <h4>Select Your Availability</h4>

    <p>sorry owen i had no idea how to code this but good luck</p>

    <Footer backNav="/applicant/3_teams" nextNav="/applicant/5_free_response"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={3}/>
</div>