<script lang="ts">
	/**
	 * Upload-or-paste image field for tenant images (team photos, job covers,
	 * question images). Uploads go to the org's own folder in `org-assets`; the
	 * parent receives the public URL through `onchange` and decides when to save.
	 * A URL can also be pasted, for images hosted elsewhere.
	 */
	import { uploadOrgImage, type AssetKind } from '$lib/utils/assets';

	let {
		orgId,
		kind,
		value = '',
		label = 'Image',
		compact = false,
		onchange = () => {}
	}: {
		orgId: number;
		kind: AssetKind;
		value?: string | null;
		label?: string;
		compact?: boolean;
		onchange?: (url: string | null) => void;
	} = $props();

	let uploading = $state(false);
	let error = $state('');
	let input: HTMLInputElement | undefined = $state();

	async function pick(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		error = '';
		try {
			onchange(await uploadOrgImage(orgId, kind, file));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		uploading = false;
		if (input) input.value = '';
	}
</script>

<div class="image-upload" class:compact>
	{#if !compact}<span class="field-label">{label}</span>{/if}
	<div class="row-inline">
		{#if value}
			<img src={value} alt="" class="thumb" />
		{:else}
			<span class="thumb thumb-empty" aria-hidden="true"><i class="fi fi-br-picture"></i></span>
		{/if}
		<div class="controls">
			<input
				class="form-control form-control-sm"
				value={value ?? ''}
				placeholder="Upload, or paste an image URL"
				aria-label="{label} URL"
				onchange={(e) => onchange((e.target as HTMLInputElement).value.trim() || null)}
			/>
			<div class="btns">
				<label class="btn btn-quaternary btn-sm upload-btn" class:disabled={uploading}>
					{uploading ? 'Uploading…' : 'Upload'}
					<input
						bind:this={input}
						type="file"
						accept="image/*"
						hidden
						disabled={uploading}
						onchange={pick}
					/>
				</label>
				{#if value}
					<button type="button" class="btn btn-quaternary btn-sm" onclick={() => onchange(null)}
						>Remove</button
					>
				{/if}
			</div>
		</div>
	</div>
	{#if error}<p class="field-error">{error}</p>{/if}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.image-upload {
		margin-bottom: 8px;
	}
	.row-inline {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.thumb {
		width: 56px;
		height: 56px;
		flex: none;
		object-fit: cover;
		border-radius: $radius-sm;
		border: 1px solid $border;
	}
	.compact .thumb {
		width: 40px;
		height: 40px;
	}
	.thumb-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: $text-subtle;
		background: $surface-muted;
	}
	.controls {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.btns {
		display: flex;
		gap: 6px;
	}
	.upload-btn {
		margin: 0;
		cursor: pointer;

		&.disabled {
			opacity: 0.6;
			pointer-events: none;
		}
	}
</style>
