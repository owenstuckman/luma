<script lang="ts">
    import { goto } from '$app/navigation'; // Import the goto function for navigation

    const goToHome = () => {
        goto('/'); // Navigate to the root directory
    };
</script>

<div class="success-page">
    <h1>Application Submitted Successfully!</h1>
    <p>Thank you for your application. We will review it and get back to you soon.</p>
    <button on:click={goToHome}>Go Back to Home</button>
</div>

<style>
    .success-page {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        text-align: center;
    }
    button {
        padding: 0.5rem 1rem;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 1rem;
    }
    button:hover {
        background-color: #0056b3;
    }
</style>
