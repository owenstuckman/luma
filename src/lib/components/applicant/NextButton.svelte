<script lang='ts'>
    export let nextNav = "";
    export let backNav = "";
    export let nextText = "Next";
    export let localStorageKeys: string[] = []; // Keys for local storage
    export let data: any[] = []; // Data to be stored in local storage

    const handleNext = () => {
        if (localStorageKeys.length > 0 && data.length > 0) {
            localStorageKeys.forEach((key, index) => {
                if (data[index]) {
                    localStorage.setItem(key, JSON.stringify(data[index]));
                    console.log(data[index]);
                }
            });
        }
    };
</script>

<div class="footer-buttons">
    {#if backNav}<a href={backNav}><button class="btn btn-tertiary">Back</button></a>{/if}
    {#if nextNav}<a href={nextNav} on:click={handleNext}><button class="btn btn-tertiary">{nextText}</button></a>{/if}
</div>

<style lang="scss">
    @use '../../../styles/col.scss' as *;

    .footer-buttons {
        display: flex;
        width: 100%;
        margin-top: 15px;
        gap: 10px;
        justify-content: center;
    }
</style>