<script lang="ts">
	import { page } from '$app/stores';

	// Note there is no 'signup' mode: signing up posts from the login form via
	// `formaction="?/signup"`. A 'signup' member used to exist and the bottom
	// button set it, which rendered a completely blank form — the if-chain below
	// has no branch for it.
	type AuthMode = 'login' | 'forgot' | 'magic';

	// Seeded from the URL so a server-side rejection can send the person back to
	// the form they were actually using. Without this, a signup refused for a weak
	// password bounced them to the LOGIN form still showing a password error,
	// which reads as "your password is wrong" rather than "pick a better one".
	const MODES: AuthMode[] = ['login', 'forgot', 'magic'];
	const initialMode = $page.url.searchParams.get('mode') as AuthMode | null;
	let mode: AuthMode = initialMode && MODES.includes(initialMode) ? initialMode : 'login';
	let statusMessage = '';
	let statusError = false;

	// Redirect param — used to send user to /register after login
	$: redirectTo = $page.url.searchParams.get('redirect') || '';

	// Check URL params for status messages (e.g. after password reset email sent)
	$: {
		const msg = $page.url.searchParams.get('message');
		const err = $page.url.searchParams.get('error');
		if (msg) {
			statusMessage = msg;
			statusError = false;
		}
		if (err) {
			statusMessage = err;
			statusError = true;
		}
	}
</script>

<div class="login-screen">
	<form method="POST" action="?/login" class="login">
		{#if redirectTo}
			<input type="hidden" name="redirect" value={redirectTo} />
		{/if}
		<div class="login-top">
			{#if mode === 'login'}
				<h2>Recruiter Login</h2>
				<label>
					Email
					<input
						name="email"
						type="email"
						class="form-control input-dark"
						placeholder="Email"
						required
					/>
				</label>
				<label>
					Password
					<input
						name="password"
						type="password"
						class="form-control input-dark"
						placeholder="Password"
						required
					/>
				</label>
				{#if statusMessage}
					<p
						class="status-msg alert-soft"
						class:alert-success={!statusError}
						class:alert-error={statusError}
					>
						{statusMessage}
					</p>
				{/if}
				<div style="display: flex; gap: 10px; margin-top: 8px;">
					<a href="/">
						<button type="button" class="btn btn-primary">Back</button>
					</a>
					<button type="submit" class="btn btn-primary">Login</button>
					<button formaction="?/signup" class="btn btn-primary">Sign up</button>
				</div>
				<div class="auth-links">
					<button type="button" class="link-btn" on:click={() => (mode = 'forgot')}
						>Forgot password?</button
					>
					<button type="button" class="link-btn" on:click={() => (mode = 'magic')}
						>Sign in with magic link</button
					>
				</div>
			{:else if mode === 'forgot'}
				<h2>Reset Password</h2>
				<p class="muted auth-desc">Enter your email and we'll send you a password reset link.</p>
				<label>
					Email
					<input
						name="email"
						type="email"
						class="form-control input-dark"
						placeholder="Email"
						required
					/>
				</label>
				{#if statusMessage}
					<p
						class="status-msg alert-soft"
						class:alert-success={!statusError}
						class:alert-error={statusError}
					>
						{statusMessage}
					</p>
				{/if}
				<div style="display: flex; gap: 10px; margin-top: 8px;">
					<button
						type="button"
						class="btn btn-primary"
						on:click={() => {
							mode = 'login';
							statusMessage = '';
						}}>Back</button
					>
					<button formaction="?/resetPassword" class="btn btn-primary">Send Reset Link</button>
				</div>
			{:else if mode === 'magic'}
				<h2>Magic Link</h2>
				<p class="muted auth-desc">Enter your email and we'll send you a one-time sign-in link.</p>
				<label>
					Email
					<input
						name="email"
						type="email"
						class="form-control input-dark"
						placeholder="Email"
						required
					/>
				</label>
				{#if statusMessage}
					<p
						class="status-msg alert-soft"
						class:alert-success={!statusError}
						class:alert-error={statusError}
					>
						{statusMessage}
					</p>
				{/if}
				<div style="display: flex; gap: 10px; margin-top: 8px;">
					<button
						type="button"
						class="btn btn-primary"
						on:click={() => {
							mode = 'login';
							statusMessage = '';
						}}>Back</button
					>
					<button formaction="?/magicLink" class="btn btn-primary">Send Magic Link</button>
				</div>
			{/if}
		</div>
		<div class="login-bottom">
			<p style="color: white; margin-bottom: -2px; margin-top: 50px;">
				Don't have an account?&nbsp;
			</p>
			<button
				formaction="?/signup"
				class="link-btn"
				style="color: white; text-decoration: underline;">Sign up</button
			>
		</div>
	</form>
</div>

<style lang="scss">
	@use '../../styles/col.scss' as *;

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
		justify-content: space-between;
		background-color: $dark-primary;
		border-radius: 10px;
		width: 40vw;
		padding: 30px;
		overflow-y: auto;
	}
	.login-top {
		display: flex;
		flex-direction: column;
		text-align: center;
		justify-items: center;
		align-items: center;
		gap: 15px;
	}
	.login-bottom {
		display: flex;
		justify-content: center;
		align-items: end;
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

	.auth-links {
		display: flex;
		gap: 20px;
		margin-top: 12px;
	}
	.link-btn {
		background: none;
		border: none;
		color: $light-tertiary;
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
		&:hover {
			color: white;
		}
	}
	// Colour and size come from the shared `.muted` / `.alert-soft` classes;
	// only the measure and centring are local to this dark card.
	.auth-desc {
		max-width: 300px;
		text-align: center;
	}
	.status-msg {
		max-width: 300px;
		text-align: center;
	}
</style>
