<script lang="ts">
	import { page } from '$app/stores';

	/**
	 * Reached when an emailed link could not be redeemed and we had nowhere
	 * better to send the visitor. /auth/confirm now handles the common cases
	 * itself and bounces to the sign-in form with a fresh-link prompt, so this
	 * page is the backstop — but it still has to say what went wrong and offer
	 * a way out. It used to render the bare words "Login error" on a blank
	 * page, which tells someone holding a dead link nothing at all.
	 */
	$: reason = $page.url.searchParams.get('error');
</script>

<div class="login-screen">
	<div class="login">
		<div class="login-top">
			<h2>That link didn't work</h2>
			<p class="muted">
				Sign-in links can only be used once, and they expire after a while. Some email providers
				also open links automatically to scan them, which uses the link up before you get to it.
			</p>
			{#if reason}
				<p class="alert-soft alert-error">{reason}</p>
			{/if}
			<a href="/auth?mode=magic" class="btn btn-primary">Request a new link</a>
			<a href="/auth" class="muted small">Sign in with a password instead</a>
		</div>
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.login-screen {
		display: flex;
		background: $yellow-primary;
		background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
		justify-content: center;
		align-items: center;
		width: 100vw;
		height: 100vh;
	}
	.login {
		display: flex;
		flex-direction: column;
		justify-content: center;
		background-color: $dark-primary;
		border-radius: 10px;
		width: 40vw;
		padding: 30px;
	}
	.login-top {
		display: flex;
		flex-direction: column;
		text-align: center;
		align-items: center;
		gap: 15px;
	}
	.small {
		font-size: 13px;
	}
</style>
