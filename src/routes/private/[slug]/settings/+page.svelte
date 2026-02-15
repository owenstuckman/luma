<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import { getOrgMembersWithEmail, inviteMemberByEmail, removeMember, updateMemberRole } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import type { Organization, OrgMember } from '$lib/types';

  let org: Organization | null = null;
  let members: (OrgMember & { email: string })[] = [];
  let userRole: string = '';
  let currentUserId: string = '';
  let saving = false;
  let saveMessage = '';

  // Editable fields
  let orgName = '';
  let orgSlug = '';
  let primaryColor = '';
  let secondaryColor = '';

  // Invite
  let inviteEmail = '';
  let inviteRole = 'recruiter';
  let inviteMessage = '';
  let inviting = false;

  $: slug = $page.params.slug;
  $: isAdmin = userRole === 'admin' || userRole === 'owner';

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!orgData) return;
    org = orgData;
    orgName = orgData.name;
    orgSlug = orgData.slug;
    primaryColor = orgData.primary_color;
    secondaryColor = orgData.secondary_color;

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      currentUserId = userData.user.id;
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('user_id', userData.user.id)
        .single();
      userRole = memberData?.role || '';
    }

    await loadMembers();
  });

  async function loadMembers() {
    if (!org) return;
    members = await getOrgMembersWithEmail(org.id);
  }

  async function saveSettings() {
    if (!org || !isAdmin) return;
    saving = true;
    const { error } = await supabase
      .from('organizations')
      .update({ name: orgName, slug: orgSlug, primary_color: primaryColor, secondary_color: secondaryColor })
      .eq('id', org.id);

    if (error) {
      saveMessage = 'Failed to save: ' + error.message;
    } else {
      saveMessage = 'Settings saved!';
    }
    saving = false;
    setTimeout(() => { saveMessage = ''; }, 3000);
  }

  async function handleInvite() {
    if (!org || !inviteEmail.trim()) return;
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
      setTimeout(() => { inviteMessage = ''; }, 5000);
    }
  }

  async function handleRemove(member: OrgMember & { email: string }) {
    if (!org) return;
    if (!confirm(`Remove ${member.email} from the organization?`)) return;

    try {
      await removeMember(org.id, member.user_id);
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  async function handleRoleChange(member: OrgMember & { email: string }, newRole: string) {
    if (!org) return;

    try {
      await updateMemberRole(org.id, member.user_id, newRole);
      await loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'owner': return '#ffc800';
      case 'admin': return '#3b82f6';
      case 'recruiter': return '#22c55e';
      case 'viewer': return '#878fa1';
      default: return '#878fa1';
    }
  }
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Settings</h4>

    {#if isAdmin}
      <!-- Org Profile -->
      <div class="card" style="max-width: 500px;">
        <h5>Organization Profile</h5>
        <div class="setting-field">
          <label>Name</label>
          <input type="text" class="form-control" bind:value={orgName} />
        </div>
        <div class="setting-field">
          <label>Slug (URL path)</label>
          <input type="text" class="form-control" bind:value={orgSlug} />
        </div>
        <div style="display: flex; gap: 15px;">
          <div class="setting-field" style="flex: 1;">
            <label>Primary Color</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="color" bind:value={primaryColor} style="width: 40px; height: 34px; border: none; cursor: pointer;" />
              <input type="text" class="form-control" bind:value={primaryColor} style="font-family: monospace; font-size: 13px;" />
            </div>
          </div>
          <div class="setting-field" style="flex: 1;">
            <label>Secondary Color</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="color" bind:value={secondaryColor} style="width: 40px; height: 34px; border: none; cursor: pointer;" />
              <input type="text" class="form-control" bind:value={secondaryColor} style="font-family: monospace; font-size: 13px;" />
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
          <button class="btn btn-tertiary" on:click={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {#if saveMessage}
            <span style="font-size: 13px; color: #22c55e;">{saveMessage}</span>
          {/if}
        </div>
      </div>

      <!-- Job Postings -->
      <div class="card" style="max-width: 500px; margin-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h5 style="margin: 0;">Job Postings</h5>
          <a href="/private/{slug}/settings/jobs" class="btn btn-tertiary" style="font-size: 11px; padding: 4px 12px;">
            Manage Postings
          </a>
        </div>
        <p style="font-size: 13px; color: #878fa1; margin-top: 8px;">
          Create and edit job postings with custom application forms.
        </p>
      </div>

      <!-- Members -->
      <div class="card" style="max-width: 500px; margin-top: 20px;">
        <h5>Team Members ({members.length})</h5>

        <!-- Invite form -->
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
          <button class="btn btn-tertiary" style="font-size: 11px; padding: 4px 12px; white-space: nowrap;" on:click={handleInvite} disabled={inviting}>
            {inviting ? '...' : 'Add Member'}
          </button>
        </div>
        {#if inviteMessage}
          <p class="invite-msg" class:invite-error={inviteMessage.includes('No user') || inviteMessage.includes('already') || inviteMessage.includes('Failed')}>
            {inviteMessage}
          </p>
        {/if}

        <!-- Member list -->
        <div class="member-list">
          {#each members as member}
            <div class="member-row">
              <div class="member-info">
                <span class="member-email">{member.email}</span>
                <span class="role-badge" style="background-color: {getRoleBadgeColor(member.role)};">
                  {member.role}
                </span>
              </div>
              <div class="member-actions">
                {#if member.role !== 'owner' && isAdmin}
                  <select
                    class="form-control role-select"
                    value={member.role}
                    on:change={(e) => handleRoleChange(member, e.currentTarget.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="recruiter">Recruiter</option>
                    <option value="admin">Admin</option>
                  </select>
                  {#if member.user_id !== currentUserId}
                    <button class="btn-remove" on:click={() => handleRemove(member)} title="Remove member">
                      <i class="fi fi-br-cross-small"></i>
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p style="color: #878fa1;">You need admin access to change settings.</p>
    {/if}
  </div>

  <Navbar />
  <Sidebar currentStep={6} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .setting-field {
    margin-bottom: 12px;
  }
  .setting-field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-bottom: 4px;
  }

  .invite-form {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
  .invite-msg {
    font-size: 12px;
    color: #22c55e;
    margin-bottom: 10px;
  }
  .invite-error {
    color: #ef4444 !important;
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .member-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background-color: $light-secondary;
    border-radius: 6px;
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
  .role-badge {
    font-size: 9px;
    font-weight: 700;
    color: white;
    padding: 2px 6px;
    border-radius: 999px;
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
  .btn-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: $light-tertiary;
    cursor: pointer;
    font-size: 10px;
  }
  .btn-remove:hover {
    background-color: #fef2f2;
    color: #ef4444;
  }
</style>
