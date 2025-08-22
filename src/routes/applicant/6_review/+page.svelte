<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
</script>

<div class="layout">
  <div class="content">
    <h4>Review Your Application</h4>

    <Footer backNav="/applicant/5_free_response" nextNav="/applicant/7_submit" nextText="Submit"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={5}/>
</div>