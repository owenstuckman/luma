<script>
    let { data } = $props()
    let { colors } = $derived(data)
</script>

<div class="flex flex-col items-center justify-center h-screen">
  <h1 class="text-3xl font-bold mb-4">Welcome to LUMA!</h1>
  <ul class="list-disc list-inside mb-4">
    {#each colors as color}
      <li class="text-lg">{color.name}</li>
    {/each} 
  </ul>

  <img src="image.png" alt="A descriptive alt text for the image" class="w-200" />
<button class="mt-4 px-4 py-2 bg-yellow-500 text-white rounded" on:click={() => window.location.href='/form'}>
  Go to Form Page
</button>

</div>
