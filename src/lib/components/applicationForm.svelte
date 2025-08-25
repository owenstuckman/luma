<script lang="ts">
    export let id: number; 

    import { getRoleByID, sendApplication } from '$lib/utils/supabase'; 
    import { goto } from '$app/navigation'; // Import the goto function for navigation
    import { writable } from 'svelte/store'; // Import writable for snackbar

    export let dataForm: { name: string; description: string; owner: string; questions: object } | null = null; 
    export let questionsArray: string[] = [];
    let formData: { name: string; email: string; [key: string]: string } = { name: '', email: '' };
    let snackbarMessage = writable<string | null>(null); // Snackbar message store

    const handleSubmit = async () => {
        try {
            const applicationData = {
                name: formData.name,
                email: formData.email,
                recruitInfo: {} as { [key: string]: string }, 
                job: id,
            };

            questionsArray.forEach(question => {
                const answer = (document.getElementById(question) as HTMLInputElement).value;
                applicationData.recruitInfo[question] = answer; // Store question and answer as key-value pairs
            });

            await sendApplication(applicationData);
            console.log('Application submitted successfully');
            goto('/apply/success'); // Navigate to the success page on success
        } catch (error) {
            console.error('Failed to send application:', error);
            snackbarMessage.set('Failed to send application. Please try again.'); // Set snackbar message on error
        }
    };
</script>

<div class="application-form">
    {#if dataForm}

        <div class="text-xl grid place-items-center">
            <p>{dataForm.name}</p>
            <p>{dataForm.description}</p>
        </div>

        <div class="question pt-2 pb-2">
            <p>What is your name?</p>
            <input type="text" name="name" bind:value={formData.name} />
        </div>

        <div class="question pt-2 pb-2">
            <p>What is your email?</p>
            <input type="text" name="email" bind:value={formData.email} />
        </div>

        {#each questionsArray as question}
            <div class="question pt-2 pb-2">
                <p>{question}</p>
                <input type="text" id="{question}" name="{question}" />
            </div>
        {/each}

        <div class="flex items-center justify-center">
            <button onclick={handleSubmit}>Submit Application</button>
        </div>
    {:else}
        <p>Loading job posting...</p>
    {/if}

    {#if $snackbarMessage}
        <div class="snackbar">{ $snackbarMessage }</div>
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
    .snackbar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #333;
        color: white;
        padding: 1rem;
        border-radius: 4px;
        z-index: 1000;
    }
</style>
