<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import { capture, EVENTS, setOrgGroup } from '$lib/analytics/posthog';

	let orgName = '';
	let orgSlug = '';
	let error = '';
	let submitting = false;
	let isAuthenticated = false;
	let loading = true;
	let slugAvailable: boolean | null = null;
	let checkingSlug = false;
	let slugCheckTimer: ReturnType<typeof setTimeout> | null = null;

	$: orgSlug = orgName
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();

	// Debounced slug availability check
	$: if (orgSlug.length >= 2) {
		slugAvailable = null;
		if (slugCheckTimer) clearTimeout(slugCheckTimer);
		slugCheckTimer = setTimeout(() => checkSlugAvailability(orgSlug), 400);
	} else {
		slugAvailable = null;
	}

	async function checkSlugAvailability(slug: string) {
		checkingSlug = true;
		const { data } = await supabase
			.from('organizations')
			.select('id')
			.eq('slug', slug)
			.maybeSingle();
		// Only update if slug hasn't changed since we started
		if (orgSlug === slug) {
			slugAvailable = !data;
			checkingSlug = false;
		}
	}

	onMount(async () => {
		const { data } = await supabase.auth.getUser();
		if (!data?.user) {
			goto('/auth?redirect=/register');
			return;
		}
		isAuthenticated = true;
		loading = false;
	});

	async function handleCreate() {
		if (!orgName.trim() || !orgSlug.trim()) {
			error = 'Please enter an organization name.';
			return;
		}
		if (slugAvailable === false) {
			error = 'This URL slug is already taken. Please choose a different name.';
			return;
		}
		submitting = true;
		error = '';

		const { data: userData } = await supabase.auth.getUser();
		if (!userData?.user) {
			error = 'Not authenticated.';
			submitting = false;
			return;
		}

		// One transaction (migration 00030). This used to be two separate client
		// inserts, so a failure between them left an org with no owner row — a
		// slug taken forever by an org nobody could administer. The RPC also
		// enforces the slug format and the reserved-word list server-side.
		const { data: result, error: rpcError } = await supabase.rpc('register_organization', {
			org_name: orgName,
			org_slug: orgSlug
		});

		if (rpcError) {
			error = rpcError.message;
			submitting = false;
			return;
		}
		if (result?.error) {
			error = result.error;
			submitting = false;
			return;
		}

		setOrgGroup(result.org_id, orgName);
		capture(EVENTS.ORG_CREATED, { org_id: result.org_id, org_slug: result.slug });

		goto(`/private/${result.slug}/dashboard`);
	}
</script>

{#if loading}
	<div class="register-screen">
		<div class="register-card">
			<h2 style="color: white;">Loading...</h2>
		</div>
	</div>
{:else}
	<div class="register-screen">
		<div class="register-card">
			<h2 style="color: white;">Create Organization</h2>
			<p class="muted register-desc">Set up your organization to start receiving applications.</p>

			<div class="field">
				<label class="field-label">Organization Name</label>
				<input
					type="text"
					class="form-control input-dark"
					placeholder="Acme Recruiting"
					bind:value={orgName}
				/>
			</div>

			<div class="field">
				<label class="field-label">URL Slug</label>
				<div class="slug-preview">
					<span class="slug-prefix">/apply/</span>
					<input type="text" class="form-control input-dark slug-input" bind:value={orgSlug} />
				</div>
				{#if orgSlug.length >= 2}
					<div class="slug-status">
						{#if checkingSlug}
							<span class="field-hint">Checking availability...</span>
						{:else if slugAvailable === true}
							<span class="slug-ok">&#10003; Slug is available</span>
						{:else if slugAvailable === false}
							<span class="field-error">&#10007; Slug is already taken</span>
						{/if}
					</div>
				{/if}
			</div>

			{#if error}
				<p class="alert-soft alert-error">{error}</p>
			{/if}

			<div style="display: flex; gap: 10px; margin-top: 20px;">
				<a href="/private">
					<button type="button" class="btn btn-primary">Back</button>
				</a>
				<button
					class="btn btn-primary"
					on:click={handleCreate}
					disabled={submitting || slugAvailable === false}
				>
					{submitting ? 'Creating...' : 'Create'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../styles/col.scss' as *;

	.register-screen {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
	}
	.register-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		background-color: $dark-primary;
		border-radius: 10px;
		padding: 40px;
		width: 400px;
	}
	// `.field` / `.field-label` / `.field-hint` / `.field-error` come from ui.scss.
	.register-desc {
		margin-bottom: 15px;
	}
	.slug-preview {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.slug-prefix {
		color: $light-tertiary;
		font-size: 13px;
		font-family: monospace;
		white-space: nowrap;
	}
	.slug-status {
		margin-top: 4px;
	}
	.slug-input {
		font-family: monospace;
	}
	// ui.scss has `.field-error` but no positive counterpart.
	.slug-ok {
		font-size: 11px;
		color: $success;
	}
	.input-dark {
		background-color: $dark-primary;
		border-color: $light-tertiary;
		color: white;
	}
	.input-dark:focus,
	.input-dark:active {
		background-color: $dark-primary;
		box-shadow: none;
		border-color: $yellow-primary;
		color: white;
	}
</style>
