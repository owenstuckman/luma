<script lang="ts">
    import JobPostingCards from '$lib/components/jobPostingCards.svelte';
    import { onMount } from 'svelte';
    import { getActiveRoles } from '$lib/utils/supabase';

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
        description: string; // Ensure description is included
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
                description: posting.description // Added description to the mapping
            }));
        } catch (error) {
            console.error('Failed to load job postings:', error);
        }
    });
</script>

<h1 class="text-center text-3xl pt-10 pb-10">Available Roles</h1>
<JobPostingCards {jobPostings} />


