<script lang="ts">
    import { addComment, getCurrentUserEmail } from '$lib/utils/supabase';

    export let applicantData: {
        id: number;
        created_at: string;
        name: string;
        email: string;
        metadata: object;
        recruitInfo: object;
        comments: object;
        pass_screen: boolean;
        accepted_role: boolean;
        job: number;
    }[] | null = null;
    export let id: number;

    export let commentsArray: {id: number, email: string; comment: string; decision: string }[] = []; 
    let newComment: string = '';
    let newStatus: string = 'Pending'; // New status variable

    const handleAddComment = async () => {
        if (newComment.trim() === '' || !applicantData || !commentsArray) return; // Check if applicantData and commentsArray are not null
        try {
            const email = (await getCurrentUserEmail()) as string; 
            let newID = commentsArray.length > 0 ? commentsArray[commentsArray.length - 1].id + 1 : 1; // Ensure newID is set correctly
            await addComment(id, newID, newComment, email, newStatus); // Submit newStatus instead of hardcoded 'Pending'
            commentsArray.push({ id: newID, email: email, comment: newComment, decision: newStatus }); // Use newStatus
            newComment = '';
            newStatus = 'Pending'; // Reset status after submission
            commentsArray = [...commentsArray]; // Trigger reactivity
        } catch (error) {
            console.error('Failed to add comment:', error);
        }
    };
</script>

{#if applicantData && applicantData.length > 0} <!-- Check if applicantData is not empty -->
    <div class="applicant-details p-4 border border-gray-300 rounded-lg bg-gray-100 text-black">
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
            {#if commentsArray && commentsArray.length > 0} <!-- Check if commentsArray is not empty -->
                <ul>
                    {#each commentsArray as comment}
                        <li>
                            <strong>{comment.email}</strong>: {comment.comment} <br>
                            <em>Decision: {comment.decision}</em>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p>No comments available.</p> <!-- Message when there are no comments -->
            {/if}
        </div>
        <div class="add-comment mt-4">
            <textarea bind:value={newComment} placeholder="Add a comment..." class="w-full h-16 border border-gray-300 rounded p-2"></textarea>
            <select bind:value={newStatus} class="mt-2 border border-gray-300 rounded p-2">
                <option value="Pending">pending</option>
                <option value="Approved">accepted</option>
                <option value="Rejected">denied</option>
            </select>
            <button on:click={handleAddComment} class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Add Comment</button>
        </div>
    </div>
{:else}
    <p>Loading applicant data...</p>
{/if}

<style>

</style>
