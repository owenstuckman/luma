<script lang="ts">
  import {
    adminCreateOrganization, adminDeleteOrganization, adminUpdateOrganization,
    adminTransferOwnership, getPlatformSettings
  } from '$lib/utils/supabase';
  import type { Organization, PlatformSettings } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let organizations: (Organization & { member_count?: number; applicant_count?: number })[];
  export let platformSettings: PlatformSettings;

  const dispatch = createEventDispatcher<{ reload: void }>();

  let newOrgName = '';
  let newOrgSlug = '';
  let newOrgOwnerEmail = '';
  let newOrgPrimaryColor = platformSettings.default_primary_color || '#ffc800';
  let newOrgSecondaryColor = platformSettings.default_secondary_color || '#0F1112';
  let orgCreateError = '';
  let orgCreateSuccess = '';
  let showCreateOrg = false;

  let editingOrgId: number | null = null;
  let editOrgName = '';
  let editOrgSlug = '';
  let editOrgPrimary = '';
  let editOrgSecondary = '';
  let orgEditError = '';

  let deletingOrg: (Organization & { member_count?: number; applicant_count?: number }) | null = null;
  let deleteConfirmName = '';

  let transferOrgId: number | null = null;
  let transferEmail = '';
  let transferError = '';

  function autoSlug() {
    newOrgSlug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function createOrg() {
    orgCreateError = ''; orgCreateSuccess = '';
    if (!newOrgName || !newOrgSlug || !newOrgOwnerEmail) { orgCreateError = 'All fields are required.'; return; }
    try {
      await adminCreateOrganization(newOrgName, newOrgSlug, newOrgOwnerEmail, newOrgPrimaryColor, newOrgSecondaryColor);
      orgCreateSuccess = `Created "${newOrgName}" successfully.`;
      newOrgName = ''; newOrgSlug = ''; newOrgOwnerEmail = '';
      newOrgPrimaryColor = platformSettings.default_primary_color || '#ffc800';
      newOrgSecondaryColor = platformSettings.default_secondary_color || '#0F1112';
      showCreateOrg = false;
      dispatch('reload');
    } catch (e: any) { orgCreateError = e.message; }
  }

  function startEditOrg(org: Organization) {
    editingOrgId = org.id; editOrgName = org.name; editOrgSlug = org.slug;
    editOrgPrimary = org.primary_color; editOrgSecondary = org.secondary_color; orgEditError = '';
  }

  async function saveEditOrg() {
    orgEditError = '';
    if (!editingOrgId) return;
    try {
      await adminUpdateOrganization(editingOrgId, { name: editOrgName, slug: editOrgSlug, primary_color: editOrgPrimary, secondary_color: editOrgSecondary });
      editingOrgId = null;
      dispatch('reload');
    } catch (e: any) { orgEditError = e.message; }
  }

  async function confirmDeleteOrg() {
    if (!deletingOrg || deleteConfirmName !== deletingOrg.name) return;
    try {
      await adminDeleteOrganization(deletingOrg.id);
      deletingOrg = null; deleteConfirmName = '';
      dispatch('reload');
    } catch (e: any) { orgEditError = e.message; }
  }

  async function handleTransferOwnership() {
    transferError = '';
    if (!transferOrgId || !transferEmail) return;
    try {
      await adminTransferOwnership(transferOrgId, transferEmail);
      transferOrgId = null; transferEmail = '';
      dispatch('reload');
    } catch (e: any) { transferError = e.message; }
  }
</script>

<div style="margin-bottom: 20px;">
  <button class="btn btn-primary" on:click={() => showCreateOrg = !showCreateOrg}>
    {showCreateOrg ? 'Cancel' : '+ New Organization'}
  </button>
</div>

{#if orgCreateSuccess}
  <div class="alert-success">{orgCreateSuccess}</div>
{/if}

{#if showCreateOrg}
  <div class="form-card">
    <h6>Create Organization</h6>
    <div class="form-row">
      <label>Name</label>
      <input class="form-control" bind:value={newOrgName} on:input={autoSlug} placeholder="My Organization" />
    </div>
    <div class="form-row">
      <label>Slug</label>
      <input class="form-control" bind:value={newOrgSlug} placeholder="my-organization" />
    </div>
    <div class="form-row">
      <label>Owner Email</label>
      <input class="form-control" bind:value={newOrgOwnerEmail} placeholder="owner@example.com" />
    </div>
    <div class="form-row color-row">
      <div>
        <label>Primary Color</label>
        <input type="color" bind:value={newOrgPrimaryColor} />
      </div>
      <div>
        <label>Secondary Color</label>
        <input type="color" bind:value={newOrgSecondaryColor} />
      </div>
    </div>
    {#if orgCreateError}
      <p class="error-text">{orgCreateError}</p>
    {/if}
    <button class="btn btn-primary" on:click={createOrg}>Create</button>
  </div>
{/if}

{#each organizations as org}
  <div class="list-row org-expandable">
    {#if editingOrgId === org.id}
      <div class="edit-form">
        <div class="form-row">
          <label>Name</label>
          <input class="form-control" bind:value={editOrgName} />
        </div>
        <div class="form-row">
          <label>Slug</label>
          <input class="form-control" bind:value={editOrgSlug} />
        </div>
        <div class="form-row color-row">
          <div>
            <label>Primary</label>
            <input type="color" bind:value={editOrgPrimary} />
          </div>
          <div>
            <label>Secondary</label>
            <input type="color" bind:value={editOrgSecondary} />
          </div>
        </div>
        {#if orgEditError}
          <p class="error-text">{orgEditError}</p>
        {/if}
        <div class="btn-group">
          <button class="btn btn-primary btn-sm" on:click={saveEditOrg}>Save</button>
          <button class="btn btn-quaternary btn-sm" on:click={() => editingOrgId = null}>Cancel</button>
        </div>
      </div>
    {:else}
      <div class="row-left">
        <span class="org-dot" style="background-color: {org.primary_color};"></span>
        <div>
          <span class="row-name">{org.name}</span>
          <span class="row-sub">/apply/{org.slug}</span>
        </div>
      </div>
      <div class="row-stats">
        <span>{org.member_count || 0} members</span>
        <span>{org.applicant_count || 0} applicants</span>
      </div>
      <div class="row-actions">
        <a href="/private/{org.slug}/dashboard" class="btn btn-quaternary btn-sm">Dashboard</a>
        <button class="btn btn-quaternary btn-sm" on:click={() => startEditOrg(org)}>Edit</button>
        <button class="btn btn-quaternary btn-sm" on:click={() => { transferOrgId = org.id; transferEmail = ''; transferError = ''; }}>Transfer</button>
        <button class="btn btn-danger btn-sm" on:click={() => { deletingOrg = org; deleteConfirmName = ''; }}>Delete</button>
      </div>
    {/if}
  </div>
{/each}

{#if transferOrgId}
  <div class="modal-overlay" on:click={() => transferOrgId = null} on:keydown={(e) => e.key === 'Escape' && (transferOrgId = null)}>
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
      <h6>Transfer Ownership</h6>
      <p class="muted" style="font-size: 13px;">The new owner must already have an account. The current owner will be demoted to admin.</p>
      <div class="form-row">
        <label>New Owner Email</label>
        <input class="form-control" bind:value={transferEmail} placeholder="newowner@example.com" />
      </div>
      {#if transferError}
        <p class="error-text">{transferError}</p>
      {/if}
      <div class="btn-group">
        <button class="btn btn-primary btn-sm" on:click={handleTransferOwnership}>Transfer</button>
        <button class="btn btn-quaternary btn-sm" on:click={() => transferOrgId = null}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if deletingOrg}
  <div class="modal-overlay" on:click={() => deletingOrg = null} on:keydown={(e) => e.key === 'Escape' && (deletingOrg = null)}>
    <div class="modal-content modal-danger" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
      <h6>Delete Organization</h6>
      <p style="font-size: 13px;">This will permanently delete <strong>{deletingOrg.name}</strong> and all associated data:</p>
      <ul style="font-size: 13px; color: #ef4444;">
        <li>{deletingOrg.member_count || 0} members</li>
        <li>{deletingOrg.applicant_count || 0} applicants</li>
      </ul>
      <div class="form-row">
        <label>Type "<strong>{deletingOrg.name}</strong>" to confirm</label>
        <input class="form-control" bind:value={deleteConfirmName} placeholder={deletingOrg.name} />
      </div>
      <div class="btn-group">
        <button class="btn btn-danger btn-sm" disabled={deleteConfirmName !== deletingOrg.name} on:click={confirmDeleteOrg}>Delete Forever</button>
        <button class="btn btn-quaternary btn-sm" on:click={() => deletingOrg = null}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .form-card {
    background: white; border-radius: 8px; padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05); margin-bottom: 20px;
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .color-row { display: flex; gap: 20px; }
  .list-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: white; border-radius: 8px;
    margin-bottom: 8px; box-shadow: 0 0 8px rgba(0,0,0,0.04);
    flex-wrap: wrap; gap: 8px;
  }
  .row-left { display: flex; align-items: center; gap: 12px; }
  .row-stats { display: flex; gap: 12px; font-size: 12px; color: $light-tertiary; }
  .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .org-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .edit-form { width: 100%; padding: 8px 0; }
  .btn-group { display: flex; gap: 8px; margin-top: 8px; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-content {
    background: white; border-radius: 10px; padding: 24px;
    width: min(480px, 90vw); box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  }
  .modal-danger { border: 2px solid #fca5a5; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
