<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation'; // Import the goto function for navigation

    onMount(() => {
        goto('/private/recruiter'); // Navigate to the recruiter page on mount
    });
</script>
