<script lang="ts">
    import { onMount } from 'svelte';
    import { getAllApplicants } from '$lib/utils/supabase';
    import { goto } from '$app/navigation';

    let applicants: { id: number; name: string; created_at: string }[] = [];

    onMount(async () => {
        try {
            applicants = await getAllApplicants();
        } catch (error) {
            console.error('Failed to load applicants:', error);
        }
    });

    const navigateToReview = (id: number) => {
        goto(`/private/review/candidate?id=${id}`);
    };
</script>

<div class="applicant-cards">
    {#each applicants as applicant}
        <div class="card" on:click={() => navigateToReview(applicant.id)}>
            <h2 class="applicant-name">{applicant.name}</h2>
            <p class="submission-time">Submitted at: {new Date(applicant.created_at).toLocaleString()}</p>
        </div>
    {/each}
</div>

<style>
    .applicant-cards {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .card {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 1rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        cursor: pointer;
    }
    .applicant-name {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
    }
    .submission-time {
        font-size: 0.9rem;
        color: #555;
    }
</style>
