<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import InputArea from "$lib/components/card/InputArea.svelte";
</script>

<div class="layout">
  <div class="content">
    <h4>Free Response</h4>

    <InputArea
      title="What are some of your past group projects? How did you function in a team setting?"
      subtitle="Maximum 250 words"
      id="frq1"
    />

    <InputArea
      title="What would make you a valuable member to one of our design teams?"
      subtitle="Maximum 250 words"
      id="frq2"
    />

    <InputArea
      title="Is there anything else we should know or consider?"
      subtitle="Optional: Maximum 100 words"
      id="frq2"
    />

    <InputArea
      title="The email associated with this application is not in our interest meeting attendance records. Please provide a brief reason for your absence."
      subtitle="Optional: Maximum 50 words"
      id="frq2"
    />

    <Footer backNav="/applicant/4_availability" nextNav="/applicant/6_review"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={4}/>
</div>