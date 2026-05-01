<script lang="ts">
  import { getUserMembershipsAdmin, adminAddUserToOrg, adminRemoveUserFromOrg, adminChangeUserRole } from '$lib/utils/supabase';
  import type { AdminUser, UserMembership, Organization, OrgRole } from '$lib/types';

  export let users: AdminUser[];
  export let organizations: Organization[];

  let userSearch = '';
  let selectedUser: AdminUser | null = null;
  let selectedUserMemberships: UserMembership[] = [];
  let addToOrgId = '';
  let addToOrgRole: OrgRole = 'recruiter';
  let userActionError = '';
  let userActionSuccess = '';

  $: filteredUsers = users.filter(u => u.email?.toLowerCase().includes(userSearch.toLowerCase()));

  async function selectUser(user: AdminUser) {
    selectedUser = user; userActionError = ''; userActionSuccess = '';
    selectedUserMemberships = await getUserMembershipsAdmin(user.id);
  }

  async function addUserToOrg() {
    userActionError = ''; userActionSuccess = '';
    if (!selectedUser || !addToOrgId) return;
    try {
      await adminAddUserToOrg(parseInt(addToOrgId), selectedUser.email, addToOrgRole);
      userActionSuccess = 'Added to org successfully.';
      addToOrgId = ''; addToOrgRole = 'recruiter';
      selectedUserMemberships = await getUserMembershipsAdmin(selectedUser.id);
    } catch (e: any) { userActionError = e.message; }
  }

  async function removeUserFromOrg(orgId: number) {
    if (!selectedUser) return;
    try {
      await adminRemoveUserFromOrg(orgId, selectedUser.id);
      selectedUserMemberships = await getUserMembershipsAdmin(selectedUser.id);
    } catch (e: any) { userActionError = e.message; }
  }

  async function changeUserRole(orgId: number, newRole: string) {
    if (!selectedUser) return;
    try {
      await adminChangeUserRole(orgId, selectedUser.id, newRole);
      selectedUserMemberships = await getUserMembershipsAdmin(selectedUser.id);
    } catch (e: any) { userActionError = e.message; }
  }
</script>

<div class="search-bar">
  <input class="form-control" bind:value={userSearch} placeholder="Search users by email..." />
</div>

<div class="users-layout">
  <div class="user-list">
    <p class="muted" style="font-size: 12px; margin-bottom: 8px;">{filteredUsers.length} users</p>
    {#each filteredUsers as user}
      <button class="user-row" class:selected={selectedUser?.id === user.id} on:click={() => selectUser(user)}>
        <span class="row-name">{user.email}</span>
        <span class="row-sub">Joined {new Date(user.created_at).toLocaleDateString()}</span>
      </button>
    {/each}
    {#if filteredUsers.length === 0}
      <p class="muted">No users found.</p>
    {/if}
  </div>

  <div class="user-detail">
    {#if selectedUser}
      <div class="detail-card">
        <h6>{selectedUser.email}</h6>
        <div class="detail-meta">
          <span>User ID: <code>{selectedUser.id}</code></span>
          <span>Joined: {new Date(selectedUser.created_at).toLocaleDateString()}</span>
          <span>Last sign-in: {selectedUser.last_sign_in_at ? new Date(selectedUser.last_sign_in_at).toLocaleDateString() : 'Never'}</span>
        </div>

        <h6 style="margin-top: 20px;">Organization Memberships</h6>
        {#if selectedUserMemberships.length === 0}
          <p class="muted">Not a member of any organization.</p>
        {:else}
          {#each selectedUserMemberships as mem}
            <div class="membership-row">
              <div>
                <span class="row-name">{mem.org_name}</span>
                <span class="row-sub">/apply/{mem.org_slug}</span>
              </div>
              <select class="form-select form-select-sm" value={mem.role}
                on:change={(e) => changeUserRole(mem.org_id, e.currentTarget.value)}>
                <option value="viewer">Viewer</option>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <button class="btn btn-danger btn-sm" on:click={() => removeUserFromOrg(mem.org_id)}>Remove</button>
            </div>
          {/each}
        {/if}

        <h6 style="margin-top: 20px;">Add to Organization</h6>
        <div class="add-to-org-form">
          <select class="form-select form-select-sm" bind:value={addToOrgId}>
            <option value="">Select org...</option>
            {#each organizations as org}
              <option value={org.id}>{org.name}</option>
            {/each}
          </select>
          <select class="form-select form-select-sm" bind:value={addToOrgRole}>
            <option value="viewer">Viewer</option>
            <option value="recruiter">Recruiter</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button class="btn btn-primary btn-sm" on:click={addUserToOrg}>Add</button>
        </div>
        {#if userActionError}<p class="error-text">{userActionError}</p>{/if}
        {#if userActionSuccess}<div class="alert-success">{userActionSuccess}</div>{/if}
      </div>
    {:else}
      <div class="detail-card empty">
        <p class="muted">Select a user to view details and manage memberships.</p>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .search-bar { margin-bottom: 16px; }
  .users-layout { display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px; }
  .user-list { display: flex; flex-direction: column; gap: 4px; }
  .user-row {
    display: flex; flex-direction: column; align-items: flex-start;
    padding: 10px 14px; background: white; border-radius: 6px;
    border: none; cursor: pointer; text-align: left; width: 100%;
    box-shadow: 0 0 6px rgba(0,0,0,0.04); transition: box-shadow 0.15s;
    &:hover { box-shadow: 0 0 12px rgba(0,0,0,0.1); }
    &.selected { box-shadow: 0 0 0 2px $yellow-primary; }
  }
  .detail-card {
    background: white; border-radius: 8px; padding: 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.06);
    &.empty { display: flex; align-items: center; justify-content: center; min-height: 200px; }
  }
  .detail-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: $light-tertiary; margin-top: 8px; }
  .membership-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid #f1f5f9; gap: 8px;
    &:last-child { border-bottom: none; }
  }
  .add-to-org-form { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-top: 8px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
