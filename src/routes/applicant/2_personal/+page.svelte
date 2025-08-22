<script>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import InputDual from "$lib/components/card/InputDual.svelte";
  import Input from "$lib/components/card/Input.svelte";
  import Radio from "$lib/components/card/Radio.svelte";
  import Dropdown from "$lib/components/card/Dropdown.svelte";
</script>

<div class="layout">
  <div class="content">
    <h4>Let's Get to Know You</h4>

    <InputDual
      title="First and Last Name"
      placeholder1="First"
      placeholder2="Last"
      id1="firstName"
      id2="lastName"
    />

    <Input
      title="Virginia Tech Email"
      placeholder="Email"
      id="email"
    />

    <Radio
      title="Gender"
      options={["Male","Female"]}
      other="Other"
      name="gender"
    />

    <Dropdown
      title="Intended Major"
      placeholder="Select a major"
      options={[
        "Accounting/Business/Finance",
        "Advertising/Marketing",
        "Architecture",
        "Engineering: Aerospace",
        "Engineering: Biomedical",
        "Engineering: Biological Systems",
        "Engineering: Building Construction",
        "Engineering: Chemical",
        "Engineering: Civil",
        "Engineering: Computer",
        "Engineering: Computer Science",
        "Engineering: Electrical",
        "Engineering: Industrial and Systems",
        "Engineering: Material Science",
        "Engineering: Mechanical",
        "Engineering: Mining",
        "Engineering: Ocean",
        "Science: Biology",
        "Science: Chemistry",
        "Science: Geoscience",
        "Science: Mathematics",
        "Science: Neuroscience",
        "Science: Physics",
        "Science: Psychology",
        "Undecided",
        "Other"
        ]}
    />
    
    <Footer backNav="/applicant/1_verification" nextNav="/applicant/3_teams"/>
  </div>

  <Navbar/>

  <Sidebar currentStep={1}/>
</div>