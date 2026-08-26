<script lang="ts">
	/**
	 * Per-organization settings. Mounted in two places, deliberately:
	 *
	 *   1. `/private/[slug]/settings` — an org's own admins/owners configuring
	 *      themselves (branding, members, invites).
	 *   2. `/admin` → Orgs → Settings — a platform admin doing it for any org.
	 *
	 * One component rather than two so the two surfaces can't drift. Every write
	 * here is RLS-gated anyway (`has_org_role(org_id, 'admin')`), so mounting it
	 * on the org page grants nothing a non-admin could act on.
	 *
	 * The org is handed in as a prop — the caller already loaded it, so this
	 * component never resolves an org from a slug. That sidesteps the failure mode
	 * the old settings page had, where a failed org OR member lookup both fell
	 * through to "You need admin access", reporting a data problem as a
	 * permissions one.
	 *
	 * `viewerIsPlatformAdmin` unlocks the platform-admin grant/revoke controls on
	 * each member row. Those are cross-org superuser rights, so they stay hidden
	 * from ordinary org admins — `add_platform_admin_by_email` enforces the same
	 * rule server-side regardless.
	 */
	import {
		supabase,
		getOrgMembersWithEmail,
		inviteMemberByEmail,
		removeMember,
		updateMemberRole,
		updateMemberMetadata,
		getPlatformAdmins,
		addPlatformAdminByEmail,
		removePlatformAdminById
	} from '$lib/utils/supabase';
	import {
		createOrgInvite,
		getOrgInvites,
		revokeOrgInvite,
		getInviteRedemptions,
		redemptionsByInvite,
		inviteUrl,
		inviteStatus
	} from '$lib/utils/invites';
	import { capture, EVENTS } from '$lib/analytics/posthog';

	import type { InviteRedemption, Organization, OrgInvite, OrgMember } from '$lib/types';

	let {
		org,
		currentUserId = '',
		viewerIsPlatformAdmin = false,
		onreload = () => {}
	}: {
		org: Organization;
		currentUserId?: string;
		viewerIsPlatformAdmin?: boolean;
		onreload?: () => void;
	} = $props();

	// user_ids that hold platform admin. Only loaded when the viewer can act on it.
	let platformAdminIds = $state<Set<string>>(new Set());
	let platformAdminMsg = $state('');
	let platformAdminError = $state(false);

	let members = $state<(OrgMember & { email: string })[]>([]);
	let saving = $state(false);
	let saveMessage = $state('');

	// Editable org fields, seeded from the prop.
	let orgName = $state(org.name);
	let orgSlug = $state(org.slug);
	let primaryColor = $state(org.primary_color);
	let secondaryColor = $state(org.secondary_color);
	let logoUrl = $state(org.logo_url ?? '');
	let logoUploading = $state(false);
	let logoMessage = $state('');

	const initialEmail =
		(org as unknown as { email_settings?: Record<string, string> }).email_settings ?? {};
	let emailFromAddress = $state(initialEmail.fromEmail ?? '');
	let emailReplyTo = $state(initialEmail.replyToEmail ?? '');
	let emailSaving = $state(false);
	let emailSaveMessage = $state('');

	let emailLogs = $state<
		{
			id: number;
			created_at: string;
			recipient: string;
			type: string;
			status: string;
			error: string | null;
		}[]
	>([]);
	let emailLogsLoading = $state(false);
	let showEmailLogs = $state(false);

	// Add an existing account
	let inviteEmail = $state('');
	let inviteRole = $state('recruiter');
	let inviteMessage = $state('');
	let inviting = $state(false);

	// Invite links
	let invites = $state<OrgInvite[]>([]);
	let invitesLoading = $state(false);
	let redemptions = $state<InviteRedemption[]>([]);
	let expandedInviteId = $state<number | null>(null);
	let linkEmail = $state('');
	let linkRole = $state('recruiter');
	let linkExpiryDays = $state(14);
	let linkMaxUses = $state(1);
	let linkOpen = $state(false);
	let creatingLink = $state(false);
	let linkMessage = $state('');
	let linkError = $state(false);
	let copiedToken = $state('');

	// Per-member scheduling attributes
	let editingAttrUserId = $state<string | null>(null);
	let attrTeamsInput = $state('');
	let attrSaveMsg = $state('');

	// Who used which link, keyed by invite id.
	let usesByInvite = $derived(redemptionsByInvite(redemptions));

	// Reload whenever the caller switches to a different org.
	$effect(() => {
		const id = org.id;
		void loadMembers(id);
		void loadInvites(id);
		if (viewerIsPlatformAdmin) void loadPlatformAdmins();
	});

	async function loadPlatformAdmins() {
		const admins = await getPlatformAdmins();
		platformAdminIds = new Set(admins.map((a) => a.user_id));
	}

	async function togglePlatformAdmin(member: OrgMember & { email: string }) {
		const isAdminNow = platformAdminIds.has(member.user_id);
		const verb = isAdminNow ? 'Revoke platform admin from' : 'Grant platform admin to';
		if (
			!confirm(
				`${verb} ${member.email}?\n\nPlatform admins can read and edit EVERY organization on this deployment, not just ${org.name}.`
			)
		) {
			return;
		}

		platformAdminMsg = '';
		platformAdminError = false;
		try {
			if (isAdminNow) {
				await removePlatformAdminById(member.user_id);
				platformAdminMsg = `${member.email} is no longer a platform admin.`;
			} else {
				await addPlatformAdminByEmail(member.email);
				platformAdminMsg = `${member.email} is now a platform admin.`;
			}
			await loadPlatformAdmins();
		} catch (err) {
			platformAdminMsg = err instanceof Error ? err.message : 'Failed to update platform admin';
			platformAdminError = true;
		}
		setTimeout(() => (platformAdminMsg = ''), 5000);
	}

	async function loadMembers(orgId: number = org.id) {
		members = await getOrgMembersWithEmail(orgId);
	}

	async function loadInvites(orgId: number = org.id) {
		invitesLoading = true;
		try {
			// Both are admin-gated and independent, so pay one round trip.
			[invites, redemptions] = await Promise.all([
				getOrgInvites(orgId),
				getInviteRedemptions(orgId)
			]);
		} finally {
			invitesLoading = false;
		}
	}

	function formatRedeemedAt(iso: string) {
		return new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function saveSettings() {
		saving = true;
		const { error } = await supabase
			.from('organizations')
			.update({
				name: orgName,
				slug: orgSlug,
				primary_color: primaryColor,
				secondary_color: secondaryColor
			})
			.eq('id', org.id);

		saveMessage = error ? 'Failed to save: ' + error.message : 'Settings saved!';
		saving = false;
		if (!error) onreload();
		setTimeout(() => (saveMessage = ''), 3000);
	}

	async function saveEmailSettings() {
		emailSaving = true;
		const emailSettings = { fromEmail: emailFromAddress.trim(), replyToEmail: emailReplyTo.trim() };
		const { error } = await supabase
			.from('organizations')
			.update({ email_settings: emailSettings })
			.eq('id', org.id);

		emailSaveMessage = error ? 'Failed to save: ' + error.message : 'Email settings saved!';
		emailSaving = false;
		setTimeout(() => (emailSaveMessage = ''), 3000);
	}

	async function handleLogoUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			logoMessage = 'Please select an image file.';
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			logoMessage = 'File must be under 2MB.';
			return;
		}

		logoUploading = true;
		logoMessage = '';

		const ext = file.name.split('.').pop() || 'png';
		const path = `logos/${org.id}/logo.${ext}`;

		const { error: uploadError } = await supabase.storage
			.from('org-assets')
			.upload(path, file, { upsert: true });

		if (uploadError) {
			logoMessage = 'Upload failed: ' + uploadError.message;
			logoUploading = false;
			return;
		}

		const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path);
		const publicUrl = urlData.publicUrl;
		const { error: updateError } = await supabase
			.from('organizations')
			.update({ logo_url: publicUrl })
			.eq('id', org.id);

		if (updateError) {
			logoMessage = 'Failed to save URL: ' + updateError.message;
		} else {
			logoUrl = publicUrl;
			logoMessage = 'Logo uploaded!';
			onreload();
		}
		logoUploading = false;
		setTimeout(() => (logoMessage = ''), 3000);
	}

	async function removeLogo() {
		const { error } = await supabase
			.from('organizations')
			.update({ logo_url: null })
			.eq('id', org.id);
		if (!error) {
			logoUrl = '';
			logoMessage = 'Logo removed.';
			onreload();
			setTimeout(() => (logoMessage = ''), 3000);
		}
	}

	async function loadEmailLogs() {
		emailLogsLoading = true;
		const { data, error } = await supabase
			.from('email_log')
			.select('*')
			.eq('org_id', org.id)
			.order('created_at', { ascending: false })
			.limit(50);
		if (!error && data) emailLogs = data;
		emailLogsLoading = false;
	}

	async function toggleEmailLogs() {
		showEmailLogs = !showEmailLogs;
		if (showEmailLogs && emailLogs.length === 0) await loadEmailLogs();
	}

	async function handleInvite() {
		if (!inviteEmail.trim()) return;
		inviting = true;
		inviteMessage = '';
		try {
			await inviteMemberByEmail(org.id, inviteEmail.trim(), inviteRole);
			inviteMessage = `Added ${inviteEmail} as ${inviteRole}!`;
			inviteEmail = '';
			inviteRole = 'recruiter';
			await loadMembers();
		} catch (err) {
			inviteMessage = err instanceof Error ? err.message : 'Failed to invite';
		} finally {
			inviting = false;
			setTimeout(() => (inviteMessage = ''), 5000);
		}
	}

	async function handleCreateLink() {
		if (!linkOpen && !linkEmail.trim()) {
			linkMessage = 'Enter an email address, or switch to a shareable link.';
			linkError = true;
			return;
		}
		creatingLink = true;
		linkMessage = '';
		linkError = false;

		try {
			const { token } = await createOrgInvite(org.id, {
				email: linkOpen ? null : linkEmail.trim(),
				role: linkRole,
				expiresInDays: linkExpiryDays,
				maxUses: linkOpen ? linkMaxUses : 1
			});
			capture(EVENTS.INVITE_CREATED, {
				org_id: org.id,
				role: linkRole,
				open_link: linkOpen,
				expires_in_days: linkExpiryDays
			});
			await copyLink(token);
			linkMessage = 'Invite link created and copied to your clipboard.';
			linkEmail = '';
			await loadInvites();
		} catch (err) {
			linkMessage = err instanceof Error ? err.message : 'Failed to create invite link';
			linkError = true;
		} finally {
			creatingLink = false;
			setTimeout(() => (linkMessage = ''), 6000);
		}
	}

	async function copyLink(token: string) {
		const url = inviteUrl(window.location.origin, token);
		try {
			await navigator.clipboard.writeText(url);
			copiedToken = token;
			setTimeout(() => (copiedToken = ''), 2000);
		} catch {
			// Clipboard is blocked outside a secure context — fall back to a prompt
			// so the admin can still get the link out.
			prompt('Copy this invite link:', url);
		}
	}

	async function handleRevokeLink(invite: OrgInvite) {
		const who = invite.email ?? 'this shareable link';
		if (!confirm(`Revoke the invite for ${who}? The link will stop working immediately.`)) return;
		try {
			await revokeOrgInvite(invite.id);
			await loadInvites();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to revoke invite');
		}
	}

	async function handleRemove(member: OrgMember & { email: string }) {
		if (!confirm(`Remove ${member.email} from ${org.name}?`)) return;
		try {
			await removeMember(org.id, member.user_id);
			await loadMembers();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to remove member');
		}
	}

	async function handleRoleChange(member: OrgMember & { email: string }, newRole: string) {
		try {
			await updateMemberRole(org.id, member.user_id, newRole);
			await loadMembers();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to update role');
		}
	}

	function startEditAttr(member: OrgMember & { email: string }) {
		editingAttrUserId = member.user_id;
		const teams = member.metadata?.teams as string | string[] | undefined;
		attrTeamsInput = Array.isArray(teams) ? teams.join(', ') : teams || '';
		attrSaveMsg = '';
	}

	async function saveAttr(member: OrgMember & { email: string }) {
		const teams = attrTeamsInput
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		try {
			await updateMemberMetadata(org.id, member.user_id, { ...member.metadata, teams });
			attrSaveMsg = 'Saved!';
			await loadMembers();
			setTimeout(() => {
				attrSaveMsg = '';
				editingAttrUserId = null;
			}, 1500);
		} catch (err) {
			attrSaveMsg = err instanceof Error ? err.message : 'Failed to save';
		}
	}

	function getRoleBadgeColor(role: string) {
		switch (role) {
			case 'owner':
				return '#ffc800';
			case 'admin':
				return '#3b82f6';
			case 'recruiter':
				return '#22c55e';
			default:
				return '#878fa1';
		}
	}
</script>

<div class="org-settings">
	<!-- Org Profile -->
	<div class="card">
		<h5>Organization Profile</h5>
		<div class="field">
			<label class="field-label" for="os-name">Name</label>
			<input id="os-name" type="text" class="form-control" bind:value={orgName} />
		</div>
		<div class="field">
			<label class="field-label" for="os-slug">Slug (URL path)</label>
			<input id="os-slug" type="text" class="form-control" bind:value={orgSlug} />
			<p class="field-hint">
				Changing this changes every link for this org, including live application and invite URLs.
			</p>
		</div>
		<div style="display: flex; gap: 15px;">
			<div class="field" style="flex: 1;">
				<label class="field-label" for="os-primary">Primary Color</label>
				<div style="display: flex; gap: 8px; align-items: center;">
					<input
						id="os-primary"
						type="color"
						bind:value={primaryColor}
						style="width: 40px; height: 34px; border: none; cursor: pointer;"
					/>
					<input
						type="text"
						class="form-control"
						bind:value={primaryColor}
						style="font-family: monospace; font-size: 13px;"
					/>
				</div>
			</div>
			<div class="field" style="flex: 1;">
				<label class="field-label" for="os-secondary">Secondary Color</label>
				<div style="display: flex; gap: 8px; align-items: center;">
					<input
						id="os-secondary"
						type="color"
						bind:value={secondaryColor}
						style="width: 40px; height: 34px; border: none; cursor: pointer;"
					/>
					<input
						type="text"
						class="form-control"
						bind:value={secondaryColor}
						style="font-family: monospace; font-size: 13px;"
					/>
				</div>
			</div>
		</div>
		<div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
			<button class="btn btn-tertiary" onclick={saveSettings} disabled={saving}>
				{saving ? 'Saving...' : 'Save Changes'}
			</button>
			{#if saveMessage}
				<span class="ok-msg">{saveMessage}</span>
			{/if}
		</div>
	</div>

	<!-- Logo -->
	<div class="card">
		<h5>Organization Logo</h5>
		{#if logoUrl}
			<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
				<img src={logoUrl} alt="{org.name} logo" class="logo-preview" />
				<button class="btn btn-quaternary btn-sm" onclick={removeLogo}>Remove</button>
			</div>
		{/if}
		<div class="field">
			<label class="field-label" for="os-logo">Upload Logo (max 2MB)</label>
			<input
				id="os-logo"
				type="file"
				accept="image/*"
				class="form-control"
				onchange={handleLogoUpload}
				disabled={logoUploading}
			/>
		</div>
		{#if logoMessage}
			<span class="ok-msg">{logoMessage}</span>
		{/if}
	</div>

	<!-- Operational pages, still org-scoped -->
	<div class="card">
		<h5>Jobs &amp; Scheduling</h5>
		<p class="card-hint">
			Job postings and scheduling config live on the org dashboard — these links jump straight
			there.
		</p>
		<div style="display: flex; gap: 8px; flex-wrap: wrap;">
			<a href="/private/{org.slug}/settings/jobs" class="btn btn-tertiary btn-sm">
				Manage Job Postings
			</a>
			<a href="/private/{org.slug}/settings/scheduling" class="btn btn-tertiary btn-sm">
				Configure Scheduling
			</a>
		</div>
	</div>

	<!-- Email -->
	<div class="card">
		<h5>Email Notifications</h5>
		<p class="card-hint">
			Sender details for automated notifications (requires <code>RESEND_API_KEY</code> in Supabase secrets).
		</p>
		<div class="field">
			<label class="field-label" for="os-from">From Email</label>
			<input
				id="os-from"
				type="text"
				class="form-control"
				bind:value={emailFromAddress}
				placeholder="e.g. noreply@archimedesvt.org"
			/>
			<p class="field-hint">Shown as the sender. Must be a verified Resend domain.</p>
		</div>
		<div class="field">
			<label class="field-label" for="os-replyto">Reply-To Email</label>
			<input
				id="os-replyto"
				type="email"
				class="form-control"
				bind:value={emailReplyTo}
				placeholder="e.g. recruiting@archimedesvt.org"
			/>
			<p class="field-hint">Where applicants reply. Included in the email body.</p>
		</div>
		<div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
			<button class="btn btn-tertiary" onclick={saveEmailSettings} disabled={emailSaving}>
				{emailSaving ? 'Saving...' : 'Save Email Settings'}
			</button>
			{#if emailSaveMessage}
				<span class="ok-msg">{emailSaveMessage}</span>
			{/if}
		</div>
	</div>

	<!-- Email log -->
	<div class="card">
		<div class="card-head">
			<h5>Email Log</h5>
			<button class="btn btn-tertiary btn-sm" onclick={toggleEmailLogs}>
				{showEmailLogs ? 'Hide' : 'View Log'}
			</button>
		</div>
		{#if showEmailLogs}
			{#if emailLogsLoading}
				<p class="card-hint" style="margin-top: 10px;">Loading...</p>
			{:else if emailLogs.length === 0}
				<p class="card-hint" style="margin-top: 10px;">No emails sent yet.</p>
			{:else}
				<div class="email-log-list">
					{#each emailLogs as log (log.id)}
						<div class="log-row">
							<div class="log-info">
								<span class="log-recipient">{log.recipient}</span>
								<span class="log-type">{log.type.replace(/_/g, ' ')}</span>
							</div>
							<div class="log-meta">
								<span class="log-status" class:log-failed={log.status === 'failed'}>
									{log.status}
								</span>
								<span class="log-date">{new Date(log.created_at).toLocaleString()}</span>
							</div>
							{#if log.error}
								<span class="log-error">{log.error}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Members -->
	<div class="card">
		<h5>Team Members ({members.length})</h5>
		<p class="card-hint">Add someone who already has a LUMA account.</p>
		<div class="invite-form">
			<input
				type="email"
				class="form-control"
				bind:value={inviteEmail}
				placeholder="Email address"
				style="flex: 1;"
			/>
			<select class="form-control" bind:value={inviteRole} style="width: 130px;">
				<option value="viewer">Viewer</option>
				<option value="recruiter">Recruiter</option>
				<option value="admin">Admin</option>
			</select>
			<button class="btn btn-tertiary btn-sm" onclick={handleInvite} disabled={inviting}>
				{inviting ? '...' : 'Add Member'}
			</button>
		</div>
		{#if inviteMessage}
			<p
				class="invite-msg"
				class:invite-error={inviteMessage.includes('No user') ||
					inviteMessage.includes('already') ||
					inviteMessage.includes('Failed')}
			>
				{inviteMessage}
			</p>
		{/if}
		{#if viewerIsPlatformAdmin}
			<p class="card-hint">
				The <i class="fi fi-br-shield"></i> button grants or revokes
				<strong>platform admin</strong> — access to every organization, not just this one.
			</p>
			{#if platformAdminMsg}
				<p class="invite-msg" class:invite-error={platformAdminError}>{platformAdminMsg}</p>
			{/if}
		{/if}

		<div class="member-list">
			{#each members as member (member.user_id)}
				<div class="member-card">
					<div class="member-row">
						<div class="member-info">
							<span class="member-email">{member.email}</span>
							<span class="role-badge" style="background-color: {getRoleBadgeColor(member.role)};">
								{member.role}
							</span>
							{#if platformAdminIds.has(member.user_id)}
								<span class="pa-badge" title="Platform admin — can access every org">
									<i class="fi fi-br-shield"></i> platform
								</span>
							{/if}
							{#if member.metadata?.teams && (member.metadata.teams as string[]).length > 0}
								<span class="teams-badge">
									{(Array.isArray(member.metadata.teams)
										? member.metadata.teams
										: [member.metadata.teams]
									).join(', ')}
								</span>
							{/if}
						</div>
						<div class="member-actions">
							{#if viewerIsPlatformAdmin}
								<button
									class="btn-icon btn-attr"
									class:btn-attr-on={platformAdminIds.has(member.user_id)}
									onclick={() => togglePlatformAdmin(member)}
									title={platformAdminIds.has(member.user_id)
										? 'Revoke platform admin'
										: 'Grant platform admin (all orgs)'}
								>
									<i class="fi fi-br-shield"></i>
								</button>
							{/if}
							<button
								class="btn-icon btn-attr"
								onclick={() => startEditAttr(member)}
								title="Edit scheduling attributes"
							>
								<i class="fi fi-br-tags"></i>
							</button>
							{#if member.role !== 'owner'}
								<select
									class="form-control role-select"
									value={member.role}
									onchange={(e) => handleRoleChange(member, e.currentTarget.value)}
								>
									<option value="viewer">Viewer</option>
									<option value="recruiter">Recruiter</option>
									<option value="admin">Admin</option>
								</select>
								{#if member.user_id !== currentUserId}
									<button
										class="btn-icon btn-icon-danger btn-remove"
										onclick={() => handleRemove(member)}
										title="Remove member"
									>
										<i class="fi fi-br-cross-small"></i>
									</button>
								{/if}
							{/if}
						</div>
					</div>

					{#if editingAttrUserId === member.user_id}
						<div class="attr-editor">
							<span class="attr-label">Scheduling teams / attributes</span>
							<p class="attr-hint">
								Comma-separated. Used by attribute-based matching in the scheduler (e.g.
								"engineering, design").
							</p>
							<div class="attr-row">
								<input
									class="form-control"
									bind:value={attrTeamsInput}
									placeholder="e.g. engineering, design, marketing"
									style="flex: 1;"
								/>
								<button class="btn btn-tertiary btn-sm" onclick={() => saveAttr(member)}>
									Save
								</button>
								<button
									class="btn btn-quaternary btn-sm"
									onclick={() => (editingAttrUserId = null)}
								>
									Cancel
								</button>
							</div>
							{#if attrSaveMsg}
								<span class="ok-msg">{attrSaveMsg}</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Invite links -->
	<div class="card">
		<h5>Invite Links</h5>
		<p class="card-hint">
			Send a link to someone with no LUMA account. They sign up and are added to {org.name}
			automatically.
		</p>

		<div class="link-mode">
			<label class="link-mode-opt">
				<input type="radio" bind:group={linkOpen} value={false} />
				<span>Invite one person</span>
			</label>
			<label class="link-mode-opt">
				<input type="radio" bind:group={linkOpen} value={true} />
				<span>Shareable link</span>
			</label>
		</div>

		<div class="invite-form">
			{#if !linkOpen}
				<input
					type="email"
					class="form-control"
					bind:value={linkEmail}
					placeholder="Email address"
					style="flex: 1;"
				/>
			{:else}
				<label class="link-field" style="flex: 1;">
					<span>Max uses</span>
					<input type="number" class="form-control" bind:value={linkMaxUses} min="1" max="100" />
				</label>
			{/if}
			<select class="form-control" bind:value={linkRole} style="width: 130px;">
				<option value="viewer">Viewer</option>
				<option value="recruiter">Recruiter</option>
				<option value="admin">Admin</option>
			</select>
		</div>

		<div class="invite-form" style="margin-top: 8px;">
			<label class="link-field" style="flex: 1;">
				<span>Expires in (days)</span>
				<input type="number" class="form-control" bind:value={linkExpiryDays} min="1" max="90" />
			</label>
			<button class="btn btn-tertiary btn-sm" onclick={handleCreateLink} disabled={creatingLink}>
				{creatingLink ? '...' : 'Create & Copy Link'}
			</button>
		</div>

		{#if linkMessage}
			<p class="invite-msg" class:invite-error={linkError}>{linkMessage}</p>
		{/if}

		{#if invitesLoading}
			<p class="card-hint">Loading invites...</p>
		{:else if invites.length === 0}
			<p class="card-hint" style="margin-top: 12px;">No invites yet.</p>
		{:else}
			<div class="member-list">
				{#each invites as invite (invite.id)}
					{@const status = inviteStatus(invite)}
					{@const uses = usesByInvite.get(invite.id) ?? []}
					<div class="member-card">
						<div class="member-row">
							<div class="member-info">
								<span class="member-email">{invite.email ?? 'Anyone with the link'}</span>
								<span
									class="role-badge"
									style="background-color: {getRoleBadgeColor(invite.role)};"
								>
									{invite.role}
								</span>
								<span class="status-badge status-{status.tone}">{status.label}</span>
							</div>
							<div class="member-actions">
								{#if status.tone === 'active'}
									<button
										class="btn-icon btn-attr"
										onclick={() => copyLink(invite.token)}
										title="Copy invite link"
									>
										<i class="fi {copiedToken === invite.token ? 'fi-br-check' : 'fi-br-link'}"></i>
									</button>
									<button
										class="btn-icon btn-attr"
										onclick={() => handleRevokeLink(invite)}
										title="Revoke invite"
									>
										<i class="fi fi-br-cross-small"></i>
									</button>
								{/if}
							</div>
						</div>

						{#if uses.length > 0}
							<button
								class="uses-toggle"
								onclick={() =>
									(expandedInviteId = expandedInviteId === invite.id ? null : invite.id)}
								aria-expanded={expandedInviteId === invite.id}
							>
								<i class="fi fi-br-angle-small-{expandedInviteId === invite.id ? 'up' : 'down'}"
								></i>
								Used by {uses.length}
								{uses.length === 1 ? 'account' : 'accounts'}
							</button>

							{#if expandedInviteId === invite.id}
								<ul class="uses-list">
									{#each uses as use (use.id)}
										<li class="use-row">
											<span class="use-email">{use.email ?? 'Deleted account'}</span>
											{#if !use.is_member}
												<span class="use-flag">no longer a member</span>
											{/if}
											<span class="use-when">{formatRedeemedAt(use.redeemed_at)}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{:else if invite.used_count > 0}
							<p class="uses-untracked">
								Used {invite.used_count}
								{invite.used_count === 1 ? 'time' : 'times'} before this org tracked redemptions — no
								record of who.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.invite-form {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
	}
	.invite-msg {
		font-size: 12px;
		color: $success;
		margin-bottom: 10px;
	}
	.invite-error {
		color: $danger !important;
	}

	.card-hint {
		font-size: 12px;
		color: $text-muted;
		margin-bottom: 10px;
	}
	.link-mode {
		display: flex;
		gap: 16px;
		margin-bottom: 10px;
	}
	.link-mode-opt {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		margin: 0;
		cursor: pointer;
	}
	.link-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 11px;
		color: $text-muted;
		margin: 0;
	}

	// Solid-fill status chips. Deliberately not the shared soft-tone .pill —
	// these read as state on a tinted member card.
	.status-badge {
		font-size: 9px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.status-active {
		background-color: $success;
		color: white;
	}
	.status-spent {
		// Slate grey for a spent invite; no token exists for it.
		background-color: $text-dim;
		color: white;
	}
	.status-dead {
		background-color: $danger;
		color: white;
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.member-card {
		background-color: $light-secondary;
		border-radius: $radius-sm;
		overflow: hidden;
	}
	.member-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 12px;
	}
	.member-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.member-email {
		font-size: 13px;
		font-weight: 600;
	}
	// Colour is computed per role, so it stays an inline style.
	.role-badge {
		font-size: 9px;
		font-weight: 700;
		color: white;
		padding: 2px 6px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.member-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.role-select {
		font-size: 11px;
		padding: 2px 6px;
		width: auto;
		height: auto;
	}

	// Both extend the shared .btn-icon: these row actions are a size smaller.
	.btn-attr,
	.btn-remove {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		font-size: 10px;

		i {
			font-size: 10px;
		}
	}
	.btn-attr:hover {
		background-color: $info-bg;
		color: $info-fg;
	}
	.teams-badge {
		font-size: 10px;
		color: $success-fg;
		background-color: $success-bg;
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 600;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attr-editor {
		padding: 10px 12px 12px;
		border-top: 1px solid $border;
		background-color: $surface;
	}
	.pa-badge {
		font-size: 9px;
		font-weight: 700;
		color: $dark-primary;
		background-color: $yellow-primary;
		padding: 2px 6px;
		border-radius: $radius-pill;
		text-transform: uppercase;
	}
	.btn-attr-on {
		color: $yellow-primary;
	}
	.attr-label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 2px;
	}
	.attr-hint {
		font-size: 11px;
		color: $text-muted;
		margin: 0 0 8px;
	}
	.attr-row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.email-log-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		max-height: 300px;
		overflow-y: auto;
	}
	.log-row {
		background-color: $light-secondary;
		border-radius: $radius-sm;
		padding: 8px 12px;
		font-size: 12px;
	}
	.log-info {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 4px;
	}
	.log-recipient {
		font-weight: 600;
		font-family: monospace;
		font-size: 12px;
	}
	.log-type {
		font-size: 10px;
		font-weight: 700;
		// Indigo chip for the email type; no token exists for this pair.
		color: $info-fg;
		background-color: $info-bg;
		padding: 1px 6px;
		border-radius: 10px;
		text-transform: capitalize;
	}
	.log-meta {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.log-status {
		font-size: 10px;
		font-weight: 700;
		color: $success-fg;
		background-color: $success-bg;
		padding: 1px 6px;
		border-radius: 10px;
		text-transform: uppercase;
	}
	.log-failed {
		color: $danger-fg;
		background-color: $danger-bg;
	}
	.log-date {
		font-size: 11px;
		color: $text-muted;
	}
	.log-error {
		display: block;
		font-size: 11px;
		color: $danger;
		margin-top: 4px;
		font-family: monospace;
	}

	.org-settings {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 560px;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.ok-msg {
		font-size: 13px;
		color: $success;
	}
	.logo-preview {
		max-height: 48px;
		max-width: 120px;
		border-radius: $radius-sm;
		object-fit: contain;
	}

	.uses-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		padding: 0;
		background: none;
		border: none;
		font-size: 12px;
		font-weight: 600;
		color: $text-muted;
		cursor: pointer;

		&:hover {
			color: $yellow-primary;
		}

		i {
			font-size: 10px;
			line-height: 1;
		}
	}

	.uses-list {
		list-style: none;
		margin: 6px 0 0;
		padding: 8px 10px;
		border-radius: $radius-sm;
		background: rgba(255, 255, 255, 0.03);
	}

	.use-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 0;
		font-size: 12px;
	}

	.use-email {
		color: $default;
		word-break: break-all;
	}

	.use-flag {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 1px 6px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.08);
		color: $text-muted;
		white-space: nowrap;
	}

	.use-when {
		margin-left: auto;
		font-size: 11px;
		color: $text-muted;
		white-space: nowrap;
	}

	.uses-untracked {
		margin: 8px 0 0;
		font-size: 11px;
		color: $text-muted;
	}
</style>
