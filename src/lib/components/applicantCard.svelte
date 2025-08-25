<script lang="ts">
    import { onMount } from 'svelte';
    import { getAllApplicants } from '$lib/utils/supabase';
    import { goto } from '$app/navigation';

    let applicants: { id: number; name: string; created_at: string }[] = [];
    let searchQuery: string = ''; // New variable for search input

    onMount(async () => {
        try {
            applicants = await getAllApplicants();
        } catch (error) {
            console.error('Failed to load applicants:', error);
        }
    });

    const navigateToReview = (id: number) => {
        goto(`/private/recruiter/review/candidate?id=${id}`);
    };

    // Computed property to filter applicants based on search query
    $: filteredApplicants = applicants.filter(applicant => 
        applicant.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
</script>

<div class="mb-4">
    <input 
        type="text" 
        placeholder="Search by name..." 
        bind:value={searchQuery} 
        class="w-full border border-gray-300 rounded p-2"
    />
</div>

<div class="grid grid-cols-3 gap-4">
    {#each filteredApplicants as applicant}
        <div class="border border-gray-300 rounded-lg p-4 shadow cursor-pointer" on:click={() => navigateToReview(applicant.id)}>
            <h2 class="text-sm mb-2 text-black">{applicant.name}</h2>
            <p class="text-sm text-gray-600">Submitted at: {new Date(applicant.created_at).toLocaleString()}</p>
        </div>
    {/each}
</div>
