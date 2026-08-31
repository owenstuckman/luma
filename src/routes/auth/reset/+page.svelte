<script lang="ts">
	import { page } from '$app/stores';
	import { MIN_PASSWORD_LENGTH } from '$lib/utils/password';

	export let data: { hasSession: boolean };

	let errorMsg = '';
	$: {
		const err = $page.url.searchParams.get('error');
		if (err) errorMsg = err;
	}
</script>

<div class="login-screen">
	{#if !data.hasSession}
		<div class="login">
			<div class="login-top">
				<h2>This link has expired</h2>
				<p class="muted">
					Password reset links can only be used once, and they stop working after a while. Request a
					new one and it will arrive in a moment.
				</p>
				{#if errorMsg}
					<p class="alert-soft alert-error">{errorMsg}</p>
				{/if}
				<a href="/auth" class="btn btn-primary">Back to sign in</a>
			</div>
		</div>
	{:else}
		<form method="POST" action="/auth?/updatePassword" class="login">
			<div class="login-top">
				<h2>Set New Password</h2>
				<p class="muted">Enter your new password below.</p>
				<label>
					New Password
					<input
						name="password"
						type="password"
						class="form-control input-dark"
						placeholder="New password"
						required
						minlength={MIN_PASSWORD_LENGTH}
					/>
				</label>
				<label>
					Confirm Password
					<input
						name="passwordConfirm"
						type="password"
						class="form-control input-dark"
						placeholder="Repeat new password"
						required
						minlength={MIN_PASSWORD_LENGTH}
					/>
				</label>
				<p class="muted hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
				{#if errorMsg}
					<p class="alert-soft alert-error">{errorMsg}</p>
				{/if}
				<div style="display: flex; gap: 10px; margin-top: 8px;">
					<button type="submit" class="btn btn-primary">Update Password</button>
				</div>
			</div>
		</form>
	{/if}
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
	.hint {
		font-size: 12px;
		margin: 0;
	}
	.input-dark {
		background-color: $dark-primary;
		border-color: $light-tertiary;
		width: 75%;
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
