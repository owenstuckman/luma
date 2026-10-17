<script lang="ts">
	/**
	 * Instance setup dashboard — where `npm run setup` lands you (`/admin/?tab=setup`).
	 *
	 * The terminal handles what has to happen before the app can run (database,
	 * auth, keys, migrations, the first platform admin). Everything after that is
	 * configured in the app, and this tab is the map: what this deployment runs on,
	 * what still needs attention, and links to where each remaining setting lives.
	 *
	 * `instance` is computed server-side and holds no secrets — keys are reported
	 * only as present or absent.
	 */
	import type { InstanceStatus } from '$lib/types/instance';
	import type { Organization, PlatformAdmin } from '$lib/types';

	type Tab = 'orgs' | 'settings' | 'admins';

	let {
		instance,
		organizations,
		platformAdmins,
		onselectTab = () => {}
	}: {
		instance: InstanceStatus | null;
		organizations: Organization[];
		platformAdmins: PlatformAdmin[];
		onselectTab?: (tab: Tab) => void;
	} = $props();

	type Tone = 'success' | 'warning' | 'neutral' | 'info';
	interface Check {
		label: string;
		value: string;
		tone: Tone;
		status: string;
		hint?: string;
	}

	const checks = $derived.by((): Check[] => {
		if (!instance) return [];
		const s = instance.schema;
		return [
			{
				label: 'Database',
				value: `${instance.database.label}${instance.database.host ? ` · ${instance.database.host}` : ''}`,
				tone: 'success',
				status: 'Connected'
			},
			{
				label: 'Schema',
				value: s.latestInRepo ? `Repo migrations through ${s.latestInRepo}` : 'No migrations found',
				tone: s.upToDate ? 'success' : 'warning',
				status: s.upToDate ? 'Up to date' : 'Behind',
				hint: s.upToDate
					? undefined
					: `The database looks applied through ${s.appliedThrough ?? 'nothing recent'}. Run \`npm run setup\` and choose "Apply migrations", or \`supabase db push\`.`
			},
			{
				label: 'Auth',
				value: instance.auth.label,
				tone: instance.appUrl ? 'success' : 'warning',
				status: instance.appUrl ? 'Configured' : 'Needs app URL',
				hint: instance.appUrl
					? undefined
					: 'Set PUBLIC_APP_URL in .env so auth emails link back to this deployment.'
			},
			{
				label: 'Hosting',
				value: instance.adapter === 'node' ? 'Node server (self-hosted / Docker)' : 'Vercel',
				tone: 'neutral',
				status: instance.adapter
			},
			{
				label: 'Service role key',
				value: 'Server-only; used by the email webhook',
				tone: instance.serviceRoleKey ? 'success' : 'neutral',
				status: instance.serviceRoleKey ? 'Present' : 'Not set (optional)'
			},
			{
				label: 'Email (Resend)',
				value: 'Edge Function secrets — not visible to the app',
				tone: 'info',
				status: 'Check in Supabase',
				hint: 'supabase secrets set RESEND_API_KEY=re_... LUMA_FROM_EMAIL="Org <noreply@yourdomain>" — without the key, sends run in dry-run mode.'
			},
			{
				label: 'Analytics',
				value: instance.analytics.enabled ? `PostHog · ${instance.analytics.host}` : 'PostHog',
				tone: instance.analytics.enabled ? 'success' : 'neutral',
				status: instance.analytics.enabled ? 'On' : 'Off (optional)'
			},
			{
				label: 'Platform admins',
				value: platformAdmins.map((a) => a.email).join(', ') || '—',
				tone: platformAdmins.length ? 'success' : 'warning',
				status: String(platformAdmins.length)
			},
			{
				label: 'Organizations',
				value: organizations.length ? `${organizations.length} configured` : 'None yet',
				tone: organizations.length ? 'success' : 'warning',
				status: String(organizations.length)
			}
		];
	});

	const redirectUrls = $derived(
		instance?.appUrl
			? ['', '/auth/confirm', '/auth/reset', '/invite/*'].map(
					(p) => instance!.appUrl!.replace(/\/$/, '') + p
				)
			: []
	);
</script>

{#if !instance}
	<div class="alert-soft alert-warning">Couldn't read this deployment's status.</div>
{:else}
	<div class="panel">
		<div class="panel-head"><span class="panel-title">This deployment</span></div>
		<div class="check-list">
			{#each checks as c (c.label)}
				<div class="check-row">
					<div class="check-main">
						<span class="check-label">{c.label}</span>
						<span class="check-value">{c.value}</span>
						{#if c.hint}<span class="check-hint">{c.hint}</span>{/if}
					</div>
					<span class="pill pill-{c.tone}">{c.status}</span>
				</div>
			{/each}
		</div>
		<p class="hint foot">
			Database, auth, keys and hosting are set from the terminal with <code>npm run setup</code> — re-run
			it any time; it keeps values you don't change.
		</p>
	</div>

	{#if redirectUrls.length}
		<div class="panel">
			<div class="panel-head"><span class="panel-title">Supabase Auth URLs</span></div>
			<p class="hint">
				Add these under Authentication → URL Configuration (Site URL first, then redirect URLs).
			</p>
			<ul class="url-list">
				{#each redirectUrls as u (u)}<li><code>{u}</code></li>{/each}
			</ul>
		</div>
	{/if}

	<div class="panel">
		<div class="panel-head"><span class="panel-title">Configure</span></div>
		<div class="next-list">
			<div class="next-row">
				<div>
					<span class="check-label">Platform branding &amp; maintenance mode</span>
					<span class="check-value"
						>Platform name, default colors, closing applications site-wide.</span
					>
				</div>
				<button class="btn btn-tertiary btn-sm" onclick={() => onselectTab('settings')}
					>Platform</button
				>
			</div>
			<div class="next-row">
				<div>
					<span class="check-label">Organizations</span>
					<span class="check-value"
						>Each org's teams, recruiting rules, interview forms, members and branding.</span
					>
				</div>
				{#if organizations.length}
					<button class="btn btn-tertiary btn-sm" onclick={() => onselectTab('orgs')}
						>Organizations</button
					>
				{:else}
					<a class="btn btn-primary btn-sm" href="/register">Create first org</a>
				{/if}
			</div>
			<div class="next-row">
				<div>
					<span class="check-label">Platform admins</span>
					<span class="check-value">Who can open this panel.</span>
				</div>
				<button class="btn btn-tertiary btn-sm" onclick={() => onselectTab('admins')}>Admins</button
				>
			</div>
		</div>

		{#if organizations.length}
			<div class="org-links">
				{#each organizations as org (org.id)}
					<div class="org-link-row">
						<span class="row-name">{org.name}</span>
						<span class="org-link-actions">
							<a href="/private/{org.slug}/settings">Settings</a>
							<a href="/private/{org.slug}/settings/jobs">Job postings</a>
							<a href="/apply/{org.slug}">Public apply page</a>
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.check-list,
	.next-list {
		display: flex;
		flex-direction: column;
	}
	.check-row,
	.next-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid $border-faint;

		&:last-child {
			border-bottom: none;
		}
	}
	.check-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.check-label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: $text;
	}
	.check-value {
		display: block;
		font-size: 12px;
		color: $text-muted;
		word-break: break-word;
	}
	.check-hint {
		font-size: 12px;
		color: $warning-fg;
	}
	.foot {
		margin: 10px 0 0;
	}
	.url-list {
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 12px;
	}
	.org-links {
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid $border;
	}
	.org-link-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 6px 0;
		font-size: 13px;
	}
	.org-link-actions {
		display: flex;
		gap: 12px;
		font-size: 12px;
	}
</style>
