<script lang="ts">
	import { addPlatformAdminByEmail, removePlatformAdminById } from '$lib/utils/supabase';
	import type { PlatformAdmin } from '$lib/types';

	let {
		platformAdmins,
		onreload = () => {}
	}: { platformAdmins: PlatformAdmin[]; onreload?: () => void } = $props();

	let newAdminEmail = $state('');
	let adminError = $state('');
	let adminSuccess = $state('');

	async function addAdmin() {
		adminError = '';
		adminSuccess = '';
		if (!newAdminEmail) return;
		try {
			await addPlatformAdminByEmail(newAdminEmail);
			adminSuccess = `Added ${newAdminEmail} as platform admin.`;
			newAdminEmail = '';
			onreload();
		} catch (e: any) {
			adminError = e.message;
		}
	}

	async function removeAdmin(admin: PlatformAdmin) {
		if (!confirm(`Remove ${admin.email} as platform admin?`)) return;
		try {
			await removePlatformAdminById(admin.user_id);
			onreload();
		} catch (e: any) {
			adminError = e.message;
		}
	}
</script>

<div class="panel" style="margin-bottom: 20px;">
	<h6>Add Platform Admin</h6>
	<div class="add-admin-form">
		<input
			class="form-control"
			bind:value={newAdminEmail}
			placeholder="user@example.com"
			onkeydown={(e) => e.key === 'Enter' && addAdmin()}
		/>
		<button class="btn btn-primary btn-sm" onclick={addAdmin}>Add Admin</button>
	</div>
	{#if adminError}<p class="field-error">{adminError}</p>{/if}
	{#if adminSuccess}<div class="alert-soft alert-success">{adminSuccess}</div>{/if}
</div>

<h5 class="section-title">Current Platform Admins</h5>
{#each platformAdmins as admin}
	<div class="list-row">
		<div class="row-left">
			<i class="fi fi-br-shield shield-icon" aria-hidden="true"></i>
			<div>
				<span class="row-name">{admin.email}</span>
				<span class="row-sub">Since {new Date(admin.created_at).toLocaleDateString()}</span>
			</div>
		</div>
		<div class="row-actions">
			<button class="btn btn-danger btn-sm" onclick={() => removeAdmin(admin)}>Remove</button>
		</div>
	</div>
{/each}
{#if platformAdmins.length === 0}
	<p class="muted">No platform admins found.</p>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.add-admin-form {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.row-actions {
		display: flex;
		gap: 6px;
	}
	.shield-icon {
		color: $yellow-primary;
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
