<script lang="ts">
    import { onMount } from 'svelte';
    import { getApplicantData, addComment } from '$lib/utils/supabase'; // Import addComment
    import { page } from '$app/stores';

    let applicantData: any = null;
    export let id: number; // This will hold the role ID from the URL

    let commentsArray: {id: number, email: string; comment: string; decision: string }[] = []; // Define the correct type for commentsArray
    let newComment: string = ''; // Variable to hold the new comment input

    onMount(async () => {
        if (id) {
            try {
                applicantData = await getApplicantData(id);

                commentsArray = applicantData[0].comments.comments; // Directly assign the comments array
                console.log(applicantData);
                console.log(commentsArray);
            } catch (error) {
                console.error('Failed to load applicant data:', error);
            }
        }
    });

    const handleAddComment = async () => {
        if (newComment.trim() === '') return; // Prevent adding empty comments
        try {
            const email = applicantData[0].email; // Use applicant's email for the comment
            const decision = 'Pending'; // Default decision for new comments
            await addComment(id, newComment, email, decision); // Call the addComment function
            commentsArray.push({ id: Date.now(), email, comment: newComment, decision }); // Update local comments array
            newComment = ''; // Clear the input field
        } catch (error) {
            console.error('Failed to add comment:', error);
        }
    };
</script>

{#if applicantData}
    <div class="applicant-details p-4 border border-gray-300 rounded-lg bg-gray-100">
        <h2 class="text-xl font-semibold">Applicant Details</h2>
        <p><strong>Name:</strong> {applicantData[0].name}</p>
        <p><strong>Email:</strong> {applicantData[0].email}</p>
        <p><strong>Answers to Application Questions:</strong></p>
        <div class="recruit-info mt-2 bg-gray-200 p-2 rounded">
            <ul>
                {#each Object.entries(applicantData[0].recruitInfo) as [key, value]}
                    <li>{key}:<br><br>{value}</li><br>
                {/each}
            </ul>
        </div>
        <p class="mt-4"><strong>Comments:</strong></p>
        <div class="comments-info mt-2 bg-gray-200 p-2 rounded">
            <ul>
                {#each commentsArray as comment}
                    <li>
                        <strong>{comment.email}</strong>: {comment.comment} <br>
                        <em>Decision: {comment.decision}</em>
                    </li>
                {/each}
            </ul>
        </div>
        <div class="add-comment mt-4">
            <textarea bind:value={newComment} placeholder="Add a comment..." class="w-full h-16 border border-gray-300 rounded p-2"></textarea>
            <button on:click={handleAddComment} class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Add Comment</button>
        </div>
    </div>
{:else}
    <p>Loading applicant data...</p>
{/if}

<style>
    /* Additional styles can be added here if needed */
</style>
