<script lang="ts">
	import {
		adminCreateOrganization,
		adminDeleteOrganization,
		adminUpdateOrganization,
		adminTransferOwnership,
		getPlatformSettings
	} from '$lib/utils/supabase';
	import OrgSettingsPanel from './OrgSettingsPanel.svelte';

	import type { Organization, PlatformSettings } from '$lib/types';

	let {
		organizations,
		platformSettings,
		currentUserId = '',
		onreload = () => {}
	}: {
		organizations: (Organization & { member_count?: number; applicant_count?: number })[];
		platformSettings: PlatformSettings;
		currentUserId?: string;
		onreload?: () => void;
	} = $props();

	// Which org's full settings panel is expanded. Org settings moved here from
	// `/private/[slug]/settings`, which no longer exists.
	let settingsOrgId = $state<number | null>(null);

	let newOrgName = $state('');
	let newOrgSlug = $state('');
	let newOrgOwnerEmail = $state('');
	let newOrgPrimaryColor = $state(platformSettings.default_primary_color || '#ffc800');
	let newOrgSecondaryColor = $state(platformSettings.default_secondary_color || '#0F1112');
	let orgCreateError = $state('');
	let orgCreateSuccess = $state('');
	let showCreateOrg = $state(false);

	let editingOrgId = $state<number | null>(null);
	let editOrgName = $state('');
	let editOrgSlug = $state('');
	let editOrgPrimary = $state('');
	let editOrgSecondary = $state('');
	let orgEditError = $state('');

	let deletingOrg = $state<
		(Organization & { member_count?: number; applicant_count?: number }) | null
	>(null);
	let deleteConfirmName = $state('');

	let transferOrgId = $state<number | null>(null);
	let transferEmail = $state('');
	let transferError = $state('');

	function autoSlug() {
		newOrgSlug = newOrgName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	async function createOrg() {
		orgCreateError = '';
		orgCreateSuccess = '';
		if (!newOrgName || !newOrgSlug || !newOrgOwnerEmail) {
			orgCreateError = 'All fields are required.';
			return;
		}
		try {
			await adminCreateOrganization(
				newOrgName,
				newOrgSlug,
				newOrgOwnerEmail,
				newOrgPrimaryColor,
				newOrgSecondaryColor
			);
			orgCreateSuccess = `Created "${newOrgName}" successfully.`;
			newOrgName = '';
			newOrgSlug = '';
			newOrgOwnerEmail = '';
			newOrgPrimaryColor = platformSettings.default_primary_color || '#ffc800';
			newOrgSecondaryColor = platformSettings.default_secondary_color || '#0F1112';
			showCreateOrg = false;
			onreload();
		} catch (e: any) {
			orgCreateError = e.message;
		}
	}

	function startEditOrg(org: Organization) {
		editingOrgId = org.id;
		editOrgName = org.name;
		editOrgSlug = org.slug;
		editOrgPrimary = org.primary_color;
		editOrgSecondary = org.secondary_color;
		orgEditError = '';
	}

	async function saveEditOrg() {
		orgEditError = '';
		if (!editingOrgId) return;
		try {
			await adminUpdateOrganization(editingOrgId, {
				name: editOrgName,
				slug: editOrgSlug,
				primary_color: editOrgPrimary,
				secondary_color: editOrgSecondary
			});
			editingOrgId = null;
			onreload();
		} catch (e: any) {
			orgEditError = e.message;
		}
	}

	async function confirmDeleteOrg() {
		if (!deletingOrg || deleteConfirmName !== deletingOrg.name) return;
		try {
			await adminDeleteOrganization(deletingOrg.id);
			deletingOrg = null;
			deleteConfirmName = '';
			onreload();
		} catch (e: any) {
			orgEditError = e.message;
		}
	}

	async function handleTransferOwnership() {
		transferError = '';
		if (!transferOrgId || !transferEmail) return;
		try {
			await adminTransferOwnership(transferOrgId, transferEmail);
			transferOrgId = null;
			transferEmail = '';
			onreload();
		} catch (e: any) {
			transferError = e.message;
		}
	}
</script>

<div style="margin-bottom: 20px;">
	<button class="btn btn-primary" onclick={() => (showCreateOrg = !showCreateOrg)}>
		{showCreateOrg ? 'Cancel' : '+ New Organization'}
	</button>
</div>

{#if orgCreateSuccess}
	<div class="alert-soft alert-success">{orgCreateSuccess}</div>
{/if}

{#if showCreateOrg}
	<div class="panel">
		<h6>Create Organization</h6>
		<div class="field">
			<label class="field-label">Name</label>
			<input
				class="form-control"
				bind:value={newOrgName}
				oninput={autoSlug}
				placeholder="My Organization"
			/>
		</div>
		<div class="field">
			<label class="field-label">Slug</label>
			<input class="form-control" bind:value={newOrgSlug} placeholder="my-organization" />
		</div>
		<div class="field">
			<label class="field-label">Owner Email</label>
			<input class="form-control" bind:value={newOrgOwnerEmail} placeholder="owner@example.com" />
		</div>
		<div class="field color-row">
			<div>
				<label class="field-label">Primary Color</label>
				<input type="color" bind:value={newOrgPrimaryColor} />
			</div>
			<div>
				<label class="field-label">Secondary Color</label>
				<input type="color" bind:value={newOrgSecondaryColor} />
			</div>
		</div>
		{#if orgCreateError}
			<p class="field-error">{orgCreateError}</p>
		{/if}
		<button class="btn btn-primary" onclick={createOrg}>Create</button>
	</div>
{/if}

{#each organizations as org}
	<div class="list-row org-expandable">
		{#if editingOrgId === org.id}
			<div class="edit-form">
				<div class="field">
					<label class="field-label">Name</label>
					<input class="form-control" bind:value={editOrgName} />
				</div>
				<div class="field">
					<label class="field-label">Slug</label>
					<input class="form-control" bind:value={editOrgSlug} />
				</div>
				<div class="field color-row">
					<div>
						<label class="field-label">Primary</label>
						<input type="color" bind:value={editOrgPrimary} />
					</div>
					<div>
						<label class="field-label">Secondary</label>
						<input type="color" bind:value={editOrgSecondary} />
					</div>
				</div>
				{#if orgEditError}
					<p class="field-error">{orgEditError}</p>
				{/if}
				<div class="btn-group">
					<button class="btn btn-primary btn-sm" onclick={saveEditOrg}>Save</button>
					<button class="btn btn-quaternary btn-sm" onclick={() => (editingOrgId = null)}
						>Cancel</button
					>
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
				<button
					class="btn btn-primary btn-sm"
					onclick={() => (settingsOrgId = settingsOrgId === org.id ? null : org.id)}
				>
					{settingsOrgId === org.id ? 'Close Settings' : 'Settings'}
				</button>
				<button class="btn btn-quaternary btn-sm" onclick={() => startEditOrg(org)}>Edit</button>
				<button
					class="btn btn-quaternary btn-sm"
					onclick={() => {
						transferOrgId = org.id;
						transferEmail = '';
						transferError = '';
					}}>Transfer</button
				>
				<button
					class="btn btn-danger btn-sm"
					onclick={() => {
						deletingOrg = org;
						deleteConfirmName = '';
					}}>Delete</button
				>
			</div>
		{/if}
	</div>

	{#if settingsOrgId === org.id}
		<div class="settings-drawer">
			<div class="settings-drawer-head">
				<h6>{org.name} — Settings</h6>
				<button class="btn btn-quaternary btn-sm" onclick={() => (settingsOrgId = null)}>
					Close
				</button>
			</div>
			<OrgSettingsPanel {org} {currentUserId} viewerIsPlatformAdmin={true} {onreload} />
		</div>
	{/if}
{/each}

{#if transferOrgId}
	<div
		class="modal-backdrop-luma"
		onclick={() => (transferOrgId = null)}
		onkeydown={(e) => e.key === 'Escape' && (transferOrgId = null)}
	>
		<div
			class="modal-panel modal-narrow"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<h6>Transfer Ownership</h6>
			<p class="muted" style="font-size: 13px;">
				The new owner must already have an account. The current owner will be demoted to admin.
			</p>
			<div class="field">
				<label class="field-label">New Owner Email</label>
				<input class="form-control" bind:value={transferEmail} placeholder="newowner@example.com" />
			</div>
			{#if transferError}
				<p class="field-error">{transferError}</p>
			{/if}
			<div class="btn-group">
				<button class="btn btn-primary btn-sm" onclick={handleTransferOwnership}>Transfer</button>
				<button class="btn btn-quaternary btn-sm" onclick={() => (transferOrgId = null)}
					>Cancel</button
				>
			</div>
		</div>
	</div>
{/if}

{#if deletingOrg}
	<div
		class="modal-backdrop-luma"
		onclick={() => (deletingOrg = null)}
		onkeydown={(e) => e.key === 'Escape' && (deletingOrg = null)}
	>
		<div
			class="modal-panel modal-narrow modal-danger"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<h6>Delete Organization</h6>
			<p style="font-size: 13px;">
				This will permanently delete <strong>{deletingOrg.name}</strong> and all associated data:
			</p>
			<ul class="danger-list">
				<li>{deletingOrg.member_count || 0} members</li>
				<li>{deletingOrg.applicant_count || 0} applicants</li>
			</ul>
			<div class="field">
				<label class="field-label">Type "<strong>{deletingOrg.name}</strong>" to confirm</label>
				<input class="form-control" bind:value={deleteConfirmName} placeholder={deletingOrg.name} />
			</div>
			<div class="btn-group">
				<button
					class="btn btn-danger btn-sm"
					disabled={deleteConfirmName !== deletingOrg.name}
					onclick={confirmDeleteOrg}>Delete Forever</button
				>
				<button class="btn btn-quaternary btn-sm" onclick={() => (deletingOrg = null)}
					>Cancel</button
				>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.settings-drawer {
		background-color: $surface;
		border: 1px solid $border;
		border-radius: $radius;
		padding: 18px;
		margin: -4px 0 14px;
	}
	.settings-drawer-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
	}
	.settings-drawer-head h6 {
		margin: 0;
		font-weight: 700;
	}

	.color-row {
		display: flex;
		gap: 20px;
	}

	// Extends the shared .list-row: an org row carries a wrapping action strip.
	.org-expandable {
		flex-wrap: wrap;
		padding: 12px 16px;
		margin-bottom: 8px;
	}
	.row-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.org-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.edit-form {
		width: 100%;
		padding: 8px 0;
	}
	.btn-group {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	// Extends the shared .modal-panel — these dialogs are narrower than the default.
	.modal-narrow {
		max-width: min(480px, 90vw);
	}
	.modal-danger {
		border: 2px solid $danger-border;
	}

	.danger-list {
		font-size: 13px;
		color: $danger;
	}

	.btn-danger {
		background-color: $danger-bg;
		color: $danger-fg;
		border: 1px solid $danger-border;
		&:hover {
			// One step darker than $danger-bg; no token exists for this hover tint.
			background-color: $danger-bg-strong;
		}
	}
</style>
