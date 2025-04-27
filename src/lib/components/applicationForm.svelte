<script lang="ts">
    export let jobPosting: { 
        id: number; 
        created_at: string; 
        name: string; 
        owner: string; 
        questions: string; // Changed to string to reflect the new format
        scheduled: boolean; 
        metadata: object; 
        schedule: object; 
        active_flag: boolean; 
        description: string; 
    };
    
    let responses: { [key: string]: string } = {};
    let parsedQuestions: { question: string }[] = JSON.parse(jobPosting.questions); // Parse the questions JSON

</script>

<div class="application-form">
    <h2>{jobPosting.name}</h2>
    <p>{jobPosting.description}</p>
    
    {#if parsedQuestions.length > 0}
        {#each parsedQuestions as { question }}
            <div class="question">
                <label>{question}</label>
                <input type="text" bind:value={responses[question]} placeholder="Your answer here" />
            </div>
        {/each}
    {:else}
        <p>No questions available for this posting.</p>
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
</style>
