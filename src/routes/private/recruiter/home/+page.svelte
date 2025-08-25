<script lang="ts">
	import Sidebar from "$lib/components/recruiter/Sidebar.svelte";
  import Navbar from "$lib/components/recruiter/Navbar.svelte";
  import type { PageData } from './$types'; // Import the correct type for props

  export let data: PageData; // Declare the data prop
  const user = data.user; // Access user directly from data
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Hello,  {user?.email}</h4>

    <p>Utilize the navbar to the left to navigate around luma.</p>
  </div>

  <Navbar/>

  <Sidebar currentStep={0}/>
</div>