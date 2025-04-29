<script lang="ts">
    import { onMount } from 'svelte';
	import ReviewApplicationForm from '$lib/components/reviewApplicationForm.svelte';

    let id: number;

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        id = Number(urlParams.get('id'));
    });
</script>

    <ReviewApplicationForm {id} />
