<script lang="ts">
  import { updatePlatformSettings } from '$lib/utils/supabase';
  import type { PlatformSettings } from '$lib/types';

  let { platformSettings }: { platformSettings: PlatformSettings } = $props();

  let editSettings: PlatformSettings = $state({ ...platformSettings });
  let settingsLoading = false;
  let settingsError = '';
  let settingsSuccess = '';

  $: editSettings = { ...platformSettings };

  async function saveSettings() {
    settingsLoading = true; settingsError = ''; settingsSuccess = '';
    try {
      await updatePlatformSettings(editSettings);
      settingsSuccess = 'Settings saved successfully.';
    } catch (e: any) { settingsError = e.message; }
    settingsLoading = false;
  }
</script>

<div class="form-card">
  <h6>Platform Branding</h6>
  <div class="form-row">
    <label>Platform Name</label>
    <input class="form-control" bind:value={editSettings.platform_name} placeholder="LUMA" />
  </div>
  <div class="form-row color-row">
    <div>
      <label>Default Primary Color</label>
      <input type="color" bind:value={editSettings.default_primary_color} />
    </div>
    <div>
      <label>Default Secondary Color</label>
      <input type="color" bind:value={editSettings.default_secondary_color} />
    </div>
  </div>
</div>

<div class="form-card">
  <h6>Maintenance Mode</h6>
  <p class="muted" style="font-size: 13px; margin-bottom: 12px;">
    When enabled, all public application forms will show a maintenance message instead.
  </p>
  <div class="maintenance-toggle">
    <label class="toggle-label">
      <input type="checkbox" bind:checked={editSettings.maintenance_mode} />
      <span class="toggle-text">{editSettings.maintenance_mode ? 'Maintenance Mode ON' : 'Maintenance Mode OFF'}</span>
    </label>
  </div>
  {#if editSettings.maintenance_mode}
    <div class="form-row" style="margin-top: 12px;">
      <label>Maintenance Message</label>
      <input class="form-control" bind:value={editSettings.maintenance_message}
        placeholder="Applications are currently closed. Please check back later." />
    </div>
  {/if}
</div>

{#if settingsError}<p class="error-text">{settingsError}</p>{/if}
{#if settingsSuccess}<div class="alert-success">{settingsSuccess}</div>{/if}

<button class="btn btn-primary" on:click={saveSettings} disabled={settingsLoading}>
  {settingsLoading ? 'Saving...' : 'Save Settings'}
</button>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .form-card {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05);
    margin-bottom: 20px;
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
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
  .toggle-text { color: $dark-primary; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
</style>
