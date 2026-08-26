<script lang="ts">
	/**
	 * An org configuring itself: branding, logo, email, members, invite links.
	 *
	 * The body is `OrgSettingsPanel`, the same component the platform admin panel
	 * mounts at /admin → Orgs → Settings. Sharing it means the self-serve and
	 * superuser surfaces can't drift apart.
	 *
	 * This page deliberately separates its three failure states. The version this
	 * replaced collapsed all of them into "You need admin access", so a failed org
	 * lookup or an unreadable session was reported as a permissions problem —
	 * which is exactly the bug that sent us looking in the wrong place.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	import { supabase, isPlatformAdmin } from '$lib/utils/supabase';
	import OrgSettingsPanel from '$lib/components/admin/OrgSettingsPanel.svelte';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';

	import type { Organization } from '$lib/types';

	type LoadState = 'loading' | 'ready' | 'no-session' | 'no-org' | 'not-admin' | 'failed';

	let state: LoadState = 'loading';
	let failureDetail = '';
	let org: Organization | null = null;
	let currentUserId = '';
	let viewerIsPlatformAdmin = false;
	let role = '';

	$: slug = $page.params.slug;

	onMount(async () => {
		try {
			const { data: userData, error: userError } = await supabase.auth.getUser();
			if (userError || !userData?.user) {
				state = 'no-session';
				return;
			}
			currentUserId = userData.user.id;

			const { data: orgData, error: orgError } = await supabase
				.from('organizations')
				.select('*')
				.eq('slug', slug)
				.maybeSingle();

			if (orgError) {
				state = 'failed';
				failureDetail = orgError.message;
				return;
			}
			if (!orgData) {
				state = 'no-org';
				return;
			}
			org = orgData;

			const { data: memberData, error: memberError } = await supabase
				.from('org_members')
				.select('role')
				.eq('org_id', orgData.id)
				.eq('user_id', userData.user.id)
				.maybeSingle();

			if (memberError) {
				state = 'failed';
				failureDetail = memberError.message;
				return;
			}

			viewerIsPlatformAdmin = await isPlatformAdmin();
			role = memberData?.role ?? (viewerIsPlatformAdmin ? 'owner' : '');

			state = role === 'admin' || role === 'owner' ? 'ready' : 'not-admin';
		} catch (err) {
			state = 'failed';
			failureDetail = err instanceof Error ? err.message : String(err);
		}
	});
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<h4 class="page-title">Settings</h4>
				<p class="page-subtitle">
					Branding, email, members and invite links for this organization.
				</p>
			</div>
		</div>

		{#if state === 'loading'}
			<p class="muted">Loading settings…</p>
		{:else if state === 'ready' && org}
			<OrgSettingsPanel {org} {currentUserId} {viewerIsPlatformAdmin} />
		{:else if state === 'not-admin'}
			<div class="alert-soft alert-warning state-msg">
				Your role in this organization is <strong>{role || 'none'}</strong>. Only admins and owners
				can change settings — ask an admin to make the change, or to raise your role.
			</div>
		{:else if state === 'no-session'}
			<div class="alert-soft alert-info state-msg">
				We couldn't read your sign-in session. This isn't a permissions problem —
				<a href="/auth?redirect={encodeURIComponent(`/private/${slug}/settings`)}">sign in again</a>
				and it should resolve.
			</div>
		{:else if state === 'no-org'}
			<div class="alert-soft state-msg">
				No organization exists at <code>/{slug}</code>. Check the URL.
			</div>
		{:else}
			<div class="alert-soft alert-error state-msg">
				Couldn't load settings.{failureDetail ? ` ${failureDetail}` : ''}
			</div>
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={6} />
</div>

<style lang="scss">
	@use '../../../../styles/col.scss' as *;

	// `.layout` and `.content-left` are global (src/styles/luma.scss) — don't redefine.
	// `.alert-soft` and its tones are global too (src/styles/ui.scss); this only
	// caps the measure so the four distinct load states stay readable.
	.state-msg {
		max-width: 520px;
	}
	.state-msg a {
		color: $dark-primary;
		text-decoration: underline;
	}
</style>
