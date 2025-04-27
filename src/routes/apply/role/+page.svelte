<script lang="ts">
    import { onMount } from 'svelte';
    import { getRoleByID } from '$lib/utils/supabase';
    import ApplicationForm from '$lib/components/applicationForm.svelte'; // Import the ApplicationForm component

    let roleId: number | null = null; // This will hold the role ID from the URL
    let jobPosting: { 
        id: number; 
        created_at: string; 
        name: string; 
        owner: string; 
        questions: string; 
        scheduled: boolean; 
        metadata: object; 
        schedule: object; 
        active_flag: boolean; 
        description: string; 
    } | null = null;

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        roleId = Number(urlParams.get('id'));

        if (roleId) {
            try {
                const data = await getRoleByID(roleId);
                jobPosting = data[0]; // Assuming the data returns an array
            } catch (error) {
                console.error('Failed to load job posting:', error);
            }
        }
    });
</script>

{#if jobPosting}
    <ApplicationForm {jobPosting} /> <!-- Use the ApplicationForm component to display the form -->
{:else}
    <p>Error with retrieveing job posting . . . </p>
{/if}
