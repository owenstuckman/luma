<script lang="ts">
	import { enhance, applyAction } from '$app/forms';

	import { capture, EVENTS } from '$lib/analytics/posthog';

	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let submitting = false;

	$: invite = data.invite;
	$: signedIn = Boolean(data.userEmail);
	$: authHref = `/auth?redirect=${encodeURIComponent(`/invite/${data.token}`)}`;

	const REASON_COPY: Record<string, string> = {
		not_found: "This invite link isn't valid. Double-check the URL, or ask for a new one.",
		revoked: 'This invite was revoked by an organization admin.',
		expired: 'This invite has expired. Ask an admin to send you a fresh link.',
		used_up: 'This invite has already been used.'
	};

	const ROLE_COPY: Record<string, string> = {
		owner: 'an owner',
		admin: 'an admin',
		recruiter: 'a recruiter',
		viewer: 'a viewer'
	};
</script>

<svelte:head>
	<title>{invite.valid ? `Join ${invite.org_name} · LUMA` : 'Invite · LUMA'}</title>
</svelte:head>

<div class="invite-screen">
	<div class="invite-card">
		{#if !invite.valid}
			<i class="fi fi-br-cross-circle invite-icon invite-icon-bad"></i>
			<h2>Invite unavailable</h2>
			<p class="invite-desc">{REASON_COPY[invite.reason ?? 'not_found']}</p>
			<a href="/"><button type="button" class="btn btn-primary">Back to LUMA</button></a>
		{:else}
			{#if invite.logo_url}
				<img src={invite.logo_url} alt="{invite.org_name} logo" class="invite-logo" />
			{:else}
				<i class="fi fi-br-users-alt invite-icon"></i>
			{/if}

			<h2>Join {invite.org_name}</h2>
			<p class="invite-desc">
				You've been invited to join <strong>{invite.org_name}</strong> on LUMA as
				{ROLE_COPY[invite.role ?? 'recruiter'] ?? `a ${invite.role}`}.
			</p>

			{#if signedIn}
				<p class="invite-as">Signed in as {data.userEmail}</p>

				{#if form?.error}
					<p class="alert-soft alert-error">{form.error}</p>
				{/if}

				<form
					method="POST"
					action="?/accept"
					use:enhance={() => {
						submitting = true;
						return async ({ result, update }) => {
							// A successful accept ends in a redirect to the dashboard, so
							// this is the last moment we can record it client-side.
							if (result.type === 'redirect') {
								capture(EVENTS.INVITE_ACCEPTED, { org_slug: invite.org_slug, role: invite.role });
								await applyAction(result);
							} else {
								await update();
							}
							submitting = false;
						};
					}}
				>
					<button type="submit" class="btn btn-primary" disabled={submitting}>
						{submitting ? 'Joining…' : `Join ${invite.org_name}`}
					</button>
				</form>

				<a class="invite-link" href={authHref}>Use a different account</a>
			{:else}
				<p class="invite-desc invite-sub">
					{#if invite.requires_email}
						Sign in — or create an account with the address this invite was sent to — and you'll be
						added automatically.
					{:else}
						Sign in or create an account, and you'll be added automatically.
					{/if}
				</p>
				<a href={authHref}>
					<button type="button" class="btn btn-primary">Sign in or sign up</button>
				</a>
			{/if}

			{#if invite.expires_at}
				<p class="invite-expiry">
					Expires {new Date(invite.expires_at).toLocaleDateString(undefined, {
						month: 'long',
						day: 'numeric',
						year: 'numeric'
					})}
				</p>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.invite-screen {
		display: flex;
		background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
		justify-content: center;
		align-items: center;
		width: 100vw;
		min-height: 100vh;
		padding: 20px;
	}
	.invite-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 14px;
		background-color: $dark-primary;
		border-radius: 10px;
		width: min(440px, 100%);
		padding: 40px 30px;
		color: white;
	}
	.invite-icon {
		font-size: 40px;
		color: $yellow-primary;
	}
	.invite-icon-bad {
		color: $danger;
	}
	.invite-logo {
		max-height: 64px;
		max-width: 180px;
		object-fit: contain;
	}
	h2 {
		margin: 0;
	}
	.invite-desc {
		color: $text-muted;
		font-size: 14px;
		margin: 0;
	}
	.invite-sub {
		font-size: 13px;
	}
	.invite-as {
		color: white;
		font-size: 13px;
		margin: 0;
	}
	.invite-expiry {
		color: $text-muted;
		font-size: 11px;
		margin: 6px 0 0;
	}
	.invite-link {
		color: $text-muted;
		font-size: 12px;
		text-decoration: underline;
		&:hover {
			color: white;
		}
	}
</style>
