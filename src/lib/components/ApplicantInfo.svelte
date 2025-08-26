<script lang="ts">
    export let recruitInfo: Record<string, any> | null = null;
</script>

{#if recruitInfo}
  <div class="applicant-details p-4 border border-gray-300 rounded-lg bg-gray-100">
    <h2 class="text-xl font-semibold text-black">Applicant Details</h2>

    <p class="mt-4"><strong>Answers to Application Questions:</strong></p>
    <div class="recruit-info mt-2 bg-gray-200 p-2 rounded">
      <ul>
        {#each Object.entries(recruitInfo) as [key, value]}
          <li>{key}:<br /><br />{value}</li><br />
        {/each}
      </ul>
    </div>

    <!-- Optional extension point for child components -->
    <slot />
  </div>
{:else}
  <p>Loading applicant data...</p>
{/if}