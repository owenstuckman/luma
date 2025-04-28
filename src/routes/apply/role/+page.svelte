<script lang="ts">
    import { onMount } from 'svelte';
    import ApplicationForm from '$lib/components/applicationForm.svelte'; // Import the ApplicationForm component

    let id: number; // This will hold the role ID from the URL

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        id = Number(urlParams.get('id'));
    });
</script>

<ApplicationForm {id} /> <!-- Use the ApplicationForm component to display the form -->
