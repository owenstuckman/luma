<script lang="ts">
    import { onMount } from 'svelte';
    import { getApplicantData } from '$lib/utils/supabase';
    import { page } from '$app/stores';

    let applicantData: any = null;
    export let id: number; // This will hold the role ID from the URL

    onMount(async () => {
        if (id) {
            try {
                applicantData = await getApplicantData(id);
                console.log(applicantData);
            } catch (error) {
                console.error('Failed to load applicant data:', error);
            }
        }
    });
</script>

{#if applicantData}
    <div class="applicant-details">
        <h2>Applicant Details</h2>
        <p><strong>Name:</strong> {applicantData[0].name}</p>
        <p><strong>Email:</strong> {applicantData[0].email}</p>
        <div class="recruit-info">
        </div>
    </div>
{:else}
    <p>Loading applicant data...</p>
{/if}

<style>
    .applicant-details {
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 8px;
        background-color: #f9f9f9;
    }
    h2 {
        margin-bottom: 1rem;
    }
</style>
