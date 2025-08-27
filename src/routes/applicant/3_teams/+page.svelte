<script lang='ts'>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import CheckboxImage from "$lib/components/card/CheckboxImage.svelte";

let isAstra: string[] = [];
let isJuvo: string[] = [];
let isInfi: string[] = [];
let isTerra: string[] = [];

const changeAstra = (newAstra: string) => {
  localStorage.setItem('Astra', newAstra);
}

const changeJuvo = (newJuvo: string) => {
  localStorage.setItem('Juvo', newJuvo);
}

const changeInfi = (newInfi: string) => {
  localStorage.setItem('Infi', newInfi)
}

const changeTerra = (newTerra: string) => {
  localStorage.setItem('Terra', newTerra);
}

</script>

<div class="layout">
  <div class="content">
    <h4>Which Teams Sound Interesting?</h4>
    <p>Select one or more that you would like to be considered for.</p>

    <CheckboxImage
      title="Astra"
      subtitle="NASA Micro-G NExT"
      description="Astra challenges students to design, build, and test a device related to space exploration. Astra has built devices such as a spacesuit cooling system, a lunar anchoring device, an autonomous rescue boat, and more!"
      linkName="Read more"
      linkURL="https://www.archimedesvt.org/design-teams"
      options={["I'm interested"]}
      imageSrc="/images/team/astra.jpg"
      imageAlt="Team Astra"
      name="AstraCard"
      bind:selected={isAstra}
      on:change={() => changeAstra(isAstra[0])}

    />

    <CheckboxImage
      title="Juvo"
      subtitle="RESNA Student Design Challenge"
      description="Juvo uses engineering to help the community. Freshmen are tasked with designing a solution for someone in the disabled community. In the past, Juvo has created solutions for accessibility in production, wheelchair disabilities, motor impairments, and more!"
      linkName="Read more"
      linkURL="https://www.archimedesvt.org/design-teams"
      options={["I'm interested"]}
      imageSrc="/images/team/juvo2.png"
      imageAlt="Team Juvo"
      name="JuvoCard"
      bind:selected={isJuvo}
      on:change={() => changeJuvo(isJuvo[0])}
    />

    <CheckboxImage
      title="Infinitum"
      subtitle="Microsoft Imagine Cup"
      description="Infinitum offers an exciting opportunity to develop and build hardware and software addressing real-world problems. Infinitum has tackled problems such as food recognition in fridges, restaurant food waste management, and more!"
      linkName="Read more"
      linkURL="https://www.archimedesvt.org/design-teams"
      options={["I'm interested"]}
      imageSrc="/images/team/infi.png"
      imageAlt="Team Infinitum"
      name="Infinitum Card"
      bind:selected={isInfi}
      on:change={() => changeInfi(isInfi[0])}
    />

    <CheckboxImage
      title="Terra"
      subtitle="ASME Student Design Competition"
      description="Terra provides students with the opportunity to design, build, drive, and compete a robot based on the season’s game manual and rules. Terra is Archimedes’ newest team, and strives to create a welcoming introduction to collegiate robotics!"
      linkName="Read more"
      linkURL="https://www.archimedesvt.org/design-teams"
      options={["I'm interested"]}
      imageSrc="/images/team/terra.png"
      imageAlt="Team Terra"
      name="TerraCard"
      bind:selected={isTerra}
      on:change={() => changeTerra(isTerra[0])}
    />

    <Footer backNav="/applicant/2_personal" nextNav="/applicant/4_availability"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={2}/>
</div>