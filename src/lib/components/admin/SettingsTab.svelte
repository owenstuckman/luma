<script lang="ts">
	import { updatePlatformSettings } from '$lib/utils/supabase';
	import type { PlatformSettings } from '$lib/types';

	let { platformSettings }: { platformSettings: PlatformSettings } = $props();

	let editSettings: PlatformSettings = $state({ ...platformSettings });
	let settingsLoading = $state(false);
	let settingsError = $state('');
	let settingsSuccess = $state('');

	$effect(() => {
		editSettings = { ...platformSettings };
	});

	async function saveSettings() {
		settingsLoading = true;
		settingsError = '';
		settingsSuccess = '';
		try {
			await updatePlatformSettings(editSettings);
			settingsSuccess = 'Settings saved successfully.';
		} catch (e: any) {
			settingsError = e.message;
		}
		settingsLoading = false;
	}
</script>

<div class="panel">
	<h6>Platform Branding</h6>
	<div class="field">
		<label class="field-label">Platform Name</label>
		<input class="form-control" bind:value={editSettings.platform_name} placeholder="LUMA" />
	</div>
	<div class="field color-row">
		<div>
			<label class="field-label">Default Primary Color</label>
			<input type="color" bind:value={editSettings.default_primary_color} />
		</div>
		<div>
			<label class="field-label">Default Secondary Color</label>
			<input type="color" bind:value={editSettings.default_secondary_color} />
		</div>
	</div>
</div>

<div class="panel">
	<h6>Maintenance Mode</h6>
	<p class="muted" style="font-size: 13px; margin-bottom: 12px;">
		When enabled, all public application forms will show a maintenance message instead.
	</p>
	<div class="maintenance-toggle">
		<label class="toggle-label">
			<input type="checkbox" bind:checked={editSettings.maintenance_mode} />
			<span class="toggle-text"
				>{editSettings.maintenance_mode ? 'Maintenance Mode ON' : 'Maintenance Mode OFF'}</span
			>
		</label>
	</div>
	{#if editSettings.maintenance_mode}
		<div class="field" style="margin-top: 12px;">
			<label class="field-label">Maintenance Message</label>
			<input
				class="form-control"
				bind:value={editSettings.maintenance_message}
				placeholder="Applications are currently closed. Please check back later."
			/>
		</div>
	{/if}
</div>

{#if settingsError}<p class="field-error">{settingsError}</p>{/if}
{#if settingsSuccess}<div class="alert-soft alert-success">{settingsSuccess}</div>{/if}

<button class="btn btn-primary" onclick={saveSettings} disabled={settingsLoading}>
	{settingsLoading ? 'Saving...' : 'Save Settings'}
</button>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.color-row {
		display: flex;
		gap: 20px;
	}
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.toggle-text {
		color: $text;
	}
</style>
