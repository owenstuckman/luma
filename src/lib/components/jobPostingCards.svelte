<script lang="ts">
    export let jobPostings: { 
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
</script>

<div class="job-posting-cards">
    {#each jobPostings as posting}
        <div class="card">
            <h2 class="title">{posting.name}</h2>
            <p class="description">{posting.description}</p>
            <a href={`/apply/role?id=${posting.id}`} class="apply-button">Apply Now</a>
        </div>
    {/each}
</div>

<style>
    .job-posting-cards {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .card {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 1rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .title {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
    }
    .description {
        margin-bottom: 0.5rem;
    }
    .company, .location {
        font-size: 0.9rem;
        color: #555;
    }
    .apply-button {
        display: inline-block;
        margin-top: 0.5rem;
        padding: 0.5rem 1rem;
        background-color: #007bff;
        color: white;
        text-decoration: none;
        border-radius: 4px;
    }
    .apply-button:hover {
        background-color: #0056b3;
    }
</style>
