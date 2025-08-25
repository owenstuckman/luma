<script lang="ts">
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import AvailabilityGrid from "$lib/components/applicant/AvailabilityGrid.svelte";

  let ranges: string[] = [];
  
  const onChange = (event: CustomEvent) => {
    ranges = event.detail.ranges;
    localStorage.setItem('availability', JSON.stringify(ranges)); // Store as JSON string
  }; // send to API/Supabase

</script>

<div class="layout">
  <div class="content">
    <h4>Select Your Availability</h4>

    <AvailabilityGrid 
      stepMinutes={15} 
      startDate="2025-09-11" 
      endDate="2025-09-15" 
      dayStart="10:00" 
      dayEnd="17:00" 
      on:change={onChange} 
    />

    <Footer backNav="/applicant/3_teams" nextNav="/applicant/5_free_response"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={3}/>
</div>