<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import type { Organization, OrgMember } from '$lib/types';

  let org: Organization | null = null;
  let members: (OrgMember & { email?: string })[] = [];
  let userRole: string = '';
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
      const { data: memberData } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('user_id', userData.user.id)
        .single();
      userRole = memberData?.role || '';
    }

    // Load members
    const { data: memberList } = await supabase
      .from('org_members')
      .select('*')
      .eq('org_id', orgData.id)
      .order('created_at');
    members = memberList || [];
  });

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

      <!-- Members -->
      <div class="card" style="max-width: 500px; margin-top: 20px;">
        <h5>Team Members</h5>
        <div class="member-list">
          {#each members as member}
            <div class="member-row">
              <span class="member-id">{member.user_id.slice(0, 8)}...</span>
              <span class="member-role">{member.role}</span>
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
  .member-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .member-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: $light-secondary;
    border-radius: 6px;
  }
  .member-id {
    font-size: 13px;
    font-family: monospace;
  }
  .member-role {
    font-size: 11px;
    font-weight: 700;
    color: $light-tertiary;
    text-transform: uppercase;
  }
</style>
