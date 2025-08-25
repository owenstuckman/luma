<script lang='ts'>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import Radio from "$lib/components/card/Radio.svelte";
  import Checkbox from "$lib/components/card/Checkbox.svelte";
	import { Value } from "sass";

  let freshmenVal: string = localStorage.getItem('isFreshmen') || "";  
  let freshmenArr: string[] = freshmenVal.split(",")

  const handleFreshmanChange = (freshmanNew: string[]) => {
    localStorage.setItem('isFreshmen', freshmanNew[0]);
    freshmenArr = freshmanNew;
    freshmenVal = freshmenArr[0];
    console.log(freshmenVal);
    console.log('test');
  };

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
    />

    <Radio
      title="What is your US citizenship status?"
      subtitle="If not a US citizen or green card holder, you will be ineligible to apply for Astra per competition requirements."
      options={["US Citizen","Legal Permanent Resident with Green Card","Not a US Citizen"]}
      name="citizenship"
    />

    <Footer nextNav="/applicant/2_personal"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={0}/>
</div>