<script lang="ts">
  import { addPlatformAdminByEmail, removePlatformAdminById } from '$lib/utils/supabase';
  import type { PlatformAdmin } from '$lib/types';

  let { platformAdmins, onreload = () => {} }: { platformAdmins: PlatformAdmin[]; onreload?: () => void } = $props();

  let newAdminEmail = '';
  let adminError = '';
  let adminSuccess = '';

  async function addAdmin() {
    adminError = ''; adminSuccess = '';
    if (!newAdminEmail) return;
    try {
      await addPlatformAdminByEmail(newAdminEmail);
      adminSuccess = `Added ${newAdminEmail} as platform admin.`;
      newAdminEmail = '';
      onreload();
    } catch (e: any) { adminError = e.message; }
  }

  async function removeAdmin(admin: PlatformAdmin) {
    if (!confirm(`Remove ${admin.email} as platform admin?`)) return;
    try { await removePlatformAdminById(admin.user_id); onreload(); }
    catch (e: any) { adminError = e.message; }
  }
</script>

<div class="form-card" style="margin-bottom: 20px;">
  <h6>Add Platform Admin</h6>
  <div class="add-admin-form">
    <input class="form-control" bind:value={newAdminEmail} placeholder="user@example.com"
      on:keydown={(e) => e.key === 'Enter' && addAdmin()} />
    <button class="btn btn-primary btn-sm" on:click={addAdmin}>Add Admin</button>
  </div>
  {#if adminError}<p class="error-text">{adminError}</p>{/if}
  {#if adminSuccess}<div class="alert-success">{adminSuccess}</div>{/if}
</div>

<h5 class="section-title">Current Platform Admins</h5>
{#each platformAdmins as admin}
  <div class="list-row">
    <div class="row-left">
      <i class="fi fi-br-shield" style="color: #ffc800;" aria-hidden="true"></i>
      <div>
        <span class="row-name">{admin.email}</span>
        <span class="row-sub">Since {new Date(admin.created_at).toLocaleDateString()}</span>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn btn-danger btn-sm" on:click={() => removeAdmin(admin)}>Remove</button>
    </div>
  </div>
{/each}
{#if platformAdmins.length === 0}
  <p class="muted">No platform admins found.</p>
{/if}

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .form-card {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05);
    margin-bottom: 20px;
  }
  .add-admin-form {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .list-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: white;
    border-radius: 8px;
    margin-bottom: 8px;
    box-shadow: 0 0 8px rgba(0,0,0,0.04);
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .row-actions { display: flex; gap: 6px; }
  .section-title { font-size: 13px; font-weight: 700; color: $light-tertiary; text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 8px; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-top: 8px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
