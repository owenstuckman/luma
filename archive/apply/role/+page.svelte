<script lang="ts">
    import { onMount } from 'svelte';
    import ApplicationForm from '$lib/components/applicationForm.svelte'; 
    import { getRoleByID } from '$lib/utils/supabase';

    let id: number; // This will hold the role ID from the URL
    let dataForm: { name: string; description: string; owner: string; questions: object } | null = null;
    let questionsJson: string | null = null;
    let questionsArray: string[] = [];

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        id = Number(urlParams.get('id'));

        if (id) {
            try {
                const data = await getRoleByID(id);
                dataForm = data[0]; 
                console.log(dataForm);
                if (dataForm) {
                    questionsJson = JSON.stringify(dataForm.questions); 
                    questionsArray = JSON.parse(questionsJson).questions;
                } else {
                    console.error('No data found for the given ID.');
                }
            } catch (error) {
                console.error('Failed to load job posting:', error);
            }
        }

    });
</script>

<ApplicationForm {id} {dataForm} {questionsArray} /> 
