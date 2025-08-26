<script lang="ts">
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import InputArea from "$lib/components/card/InputArea.svelte";

  let groupProjects: string = localStorage.getItem("What are some of your past group projects? How did you function in a team setting?") || "";
  let valuableMember: string = localStorage.getItem("What would make you a valuable member to one of our design teams?") || "";
  let extraContext: string = localStorage.getItem("Is there anything else we should know or consider?") || "";
  let absenceExcuse: string = localStorage.getItem("The email associated with this application is not in our interest meeting attendance records. Please provide a brief reason for your absence.") || "";

  const changeGroupProjects = (newProjects: string) => {
    localStorage.setItem("What are some of your past group projects? How did you function in a team setting?", newProjects);
  }

  const changeValuableMember = (newMember: string) => {
    localStorage.setItem("What would make you a valuable member to one of our design teams?", newMember);
  }

  const changeContext = (newContext: string) => {
    localStorage.setItem("Is there anything else we should know or consider?", newContext);
  }

  const changeAbsence = (newAbsense: string) => {
    localStorage.setItem("The email associated with this application is not in our interest meeting attendance records. Please provide a brief reason for your absence.", absenceExcuse);
  }
</script>

<div class="layout">
  <div class="content">
    <h4>Free Response</h4>

    <InputArea
      title="What are some of your past group projects? How did you function in a team setting?"
      subtitle="Maximum 250 words"
      id="frq1"
      bind:value={groupProjects}
      on:change={() => changeGroupProjects(groupProjects)}
    />

    <InputArea
      title="What would make you a valuable member to one of our design teams?"
      subtitle="Maximum 250 words"
      id="frq2"
      bind:value={valuableMember}
      on:change={() => changeValuableMember(valuableMember)}
    />

    <InputArea
      title="Is there anything else we should know or consider?"
      subtitle="Optional: Maximum 100 words"
      id="frq3"
      bind:value={extraContext}
      on:change={() => changeContext(extraContext)}
    />

    <InputArea
      title="The email associated with this application is not in our interest meeting attendance records. Please provide a brief reason for your absence."
      subtitle="Optional: Maximum 50 words"
      id="frq4"
      bind:value={absenceExcuse}
      on:change={() => changeAbsence(absenceExcuse)}
    />

    <Footer backNav="/applicant/4_availability" nextNav="/applicant/6_review"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={4}/>
</div>