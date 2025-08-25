<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";


  import { onMount } from 'svelte';

  onMount(() => {
    localStorage.clear();
    console.log('Cleared localstorage!')
  });


</script>

<div class="layout">
  <div class="content">
    <h4>Submit Your Application!</h4>
    <button>Submit!</button>
    <Footer backNav="/applicant/6_review"></Footer>

  </div>

  <Navbar/>

  <Sidebar currentStep={6}/>
</div>