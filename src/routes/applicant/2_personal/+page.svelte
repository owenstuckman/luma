<script lang='ts'>
  import Sidebar from "$lib/components/applicant/Sidebar.svelte";
  import Navbar from "$lib/components/applicant/Navbar.svelte";
  import Footer from "$lib/components/applicant/Footer.svelte";
  import InputDual from "$lib/components/card/InputDual.svelte";
  import Input from "$lib/components/card/Input.svelte";
  import Radio from "$lib/components/card/Radio.svelte";
  import Dropdown from "$lib/components/card/Dropdown.svelte";

  let firstName: string = localStorage.getItem('firstName') || "";
  const changeFirstName = (newFirstName: string) => {
    localStorage.setItem('firstName', newFirstName);
  };

  let lastName: string = localStorage.getItem('lastName') || "";
  const changeLastName = (newLastName: string) => {
    localStorage.setItem('lastName', newLastName);
  };

  let email: string = localStorage.getItem('email') || "";
  const changeEmail = (newEmail: string) => {
    localStorage.setItem('email', newEmail);
  };

  let gender: string = localStorage.getItem('gender') || "";
  const changeGender = (newGender: string) => {
    localStorage.setItem('gender', newGender);
  };

  let major: string = localStorage.getItem('major') || "";
  const changeMajor = (newMajor: string) => {
    localStorage.setItem('major', newMajor);
  };
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
      bind:selected={firstName}
      on:change={() => changeFirstName(firstName)}
      bind:selected2={lastName}
      on:change={() => changeLastName(lastName)}
    />

    <Input
      title="Virginia Tech Email"
      placeholder="Email"
      id="email"
      bind:value={email}
      on:change={() => changeEmail(email)}
    />

    <Radio
      title="Gender"
      options={["Male", "Female"]}
      other="Other"
      name="gender"
      bind:selected={gender}
      on:change={() => changeGender(gender)}
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
      bind:selected={major}
      on:change={() => changeMajor(major)}
    />

    <Footer backNav="/applicant/1_verification" nextNav="/applicant/3_teams" />
  </div>

  <Navbar />

  <Sidebar currentStep={1} />
</div>