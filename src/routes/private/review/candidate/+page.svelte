<script lang="ts">
    import { onMount } from 'svelte';
	import ReviewApplicationForm from '$lib/components/reviewApplicationForm.svelte';
    import { getApplicantData } from '$lib/utils/supabase';

    let id: number;
    let applicantData: any = null;
    let commentsArray: {id: number, email: string; comment: string; decision: string }[] = []; 

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        id = Number(urlParams.get('id'));

        if (id) {
            try {
                applicantData = await getApplicantData(id);
                commentsArray = applicantData[0].comments.comments; // Directly assign the comments array
            } catch (error) {
                console.error('Failed to load applicant data:', error);
            }
        }
    });
</script>

    <ReviewApplicationForm {id} {applicantData}/>
