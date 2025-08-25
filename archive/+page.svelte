<script lang="ts">
    import { onMount } from 'svelte';
    import JobPostingCards from '$lib/components/jobPostingCards.svelte';
    import { getActiveRoles } from '$lib/utils/supabase';
    import type { PageData } from '../src/routes/private/$types'; // Import the correct type for props
    import BackButton from '$lib/components/backButton.svelte';

    export let data: PageData; // Declare the data prop
    const user = data.user; // Access user directly from data

    let jobPostings: { 
        id: number; 
        created_at: string; 
        name: string; 
        owner: string; 
        questions: object; 
        scheduled: boolean; 
        metadata: object; 
        schedule: object; 
        active_flag: boolean; 
        description: string; 
    }[] = [];

    onMount(async () => {
        try {
            const activeRoles = await getActiveRoles();
            jobPostings = activeRoles.map(posting => ({
                id: posting.id,
                created_at: posting.created_at,
                name: posting.name,
                owner: posting.owner,
                questions: posting.questions,
                scheduled: posting.scheduled,
                metadata: posting.metadata,
                schedule: posting.schedule,
                active_flag: posting.active_flag,
                description: posting.description 
            }));
        } catch (error) {
            console.error('Failed to load job postings:', error);
        }
    });
</script>

<BackButton></BackButton>
<h1>Private page for user: {user?.email}</h1>
<h1 class="text-center text-3xl pt-10 pb-10">Available Roles to Manage</h1>
<JobPostingCards {jobPostings} linkBase="/private/review" />
