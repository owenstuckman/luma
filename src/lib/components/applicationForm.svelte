<script lang="ts">
    export let id: number; 

    import { onMount } from 'svelte';
    import { getRoleByID } from '$lib/utils/supabase'; 

    let dataForm: { name: string; description: string; owner: string; questions: object } | null = null;
    let questionsJson: string | null = null; 
    let questionsArray: string[] = [];

    onMount(async () => {
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

<div class="application-form">
    {#if dataForm}
        <h2>{dataForm.name}</h2>
        <p>{dataForm.description} - {dataForm.owner}</p>
        <p>{questionsJson}</p>
        <p>{questionsArray}</p>
        <p>{#each  as }
            
        {/each}

    {:else}
        <p>Loading job posting...</p>
    {/if}
</div>

<style>
    .application-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .question {
        display: flex;
        flex-direction: column;
    }
    label {
        font-weight: bold;
    }
    input {
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 0.5rem;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    button:hover {
        background-color: #0056b3;
    }
</style>
