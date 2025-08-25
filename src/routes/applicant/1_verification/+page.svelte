<script lang='ts'>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import Radio from "$lib/components/card/Radio.svelte";
  import Checkbox from "$lib/components/card/Checkbox.svelte";

  let freshmenVal: string = localStorage.getItem('isFreshmen') || "";  
  let freshmenArr: string[] = freshmenVal.split(",")
  const handleFreshmanChange = (freshmanNew: string[]) => {
    localStorage.setItem('isFreshmen', freshmanNew[0]);
  };

  let isEighteen : string = localStorage.getItem('isEighteen') || "";
  const handleEighteenChange = (eighteenNew: string) => {
    localStorage.setItem('isEighteen', eighteenNew);
  }

  let isCitizen : string = localStorage.getItem('isCitizen') || "";
  const handleCitizen = (citizenNew: string) => {
    localStorage.setItem('isCitizen', citizenNew);
  }

</script>

<div class="layout">
  <div class="content">
    <h4>Let's Verify a Few Things</h4>

    <Checkbox
      title="Archimedes only accepts first-year (freshmen) students enrolled at Virginia Tech."
      options={["I understand that my application will be denied if I am not a first-year student."]}
      name="verifyFreshman"
      bind:selected={freshmenArr}
      on:change={() => handleFreshmanChange(freshmenArr)}
    />

    <Radio
      title="Will you be over the age of 18 after October 31, 2025?"
      subtitle="If no, you will be ineligible to apply for Infinitum per competition requirements."
      options={["Yes","No"]}
      name="verifyAge"
      bind:selected={isEighteen}
      on:change={() => handleEighteenChange(isEighteen)}
    />

    <Radio
      title="What is your US citizenship status?"
      subtitle="If not a US citizen or green card holder, you will be ineligible to apply for Astra per competition requirements."
      options={["US Citizen","Legal Permanent Resident with Green Card","Not a US Citizen"]}
      name="citizenship"
      bind:selected={isCitizen}
      on:change={() => handleCitizen(isCitizen)}
    />

    <Footer nextNav="/applicant/2_personal"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={0}/>
</div>