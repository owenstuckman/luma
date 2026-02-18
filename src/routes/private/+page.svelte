<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import type { Organization, OrgMember } from '$lib/types';

  let orgs: (OrgMember & { organizations: Organization })[] = [];
  let loading = true;

  onMount(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      goto('/auth');
      return;
    }

    const { data: memberData } = await supabase
      .from('org_members')
      .select('*, organizations(*)')
      .eq('user_id', userData.user.id);

    if (memberData && memberData.length === 1) {
      // Single org — go straight to dashboard
      goto(`/private/${memberData[0].organizations.slug}/dashboard`);
      return;
    }

    orgs = (memberData || []) as (OrgMember & { organizations: Organization })[];
    loading = false;
  });
</script>

{#if loading}
  <div class="org-select-screen">
    <div class="org-select-card">
      <h2 style="color: white;">Loading...</h2>
    </div>
  </div>
{:else}
  <div class="org-select-screen">
    <div class="org-select-card">
      <h2 style="color: white;">Select Organization</h2>

      {#if orgs.length === 0}
        <p style="color: #878fa1; margin-top: 10px;">You're not a member of any organization yet.</p>
        <p style="color: #878fa1; font-size: 13px;">Ask an admin to add you, or create a new organization.</p>
        <a href="/register" class="btn btn-primary" style="margin-top: 15px;">Create Organization</a>
      {:else}
        <div class="org-list">
          {#each orgs as membership}
            <a href="/private/{membership.organizations.slug}/dashboard" class="org-item">
              <span class="org-dot" style="background-color: {membership.organizations.primary_color};"></span>
              <div class="org-item-info">
                <span class="org-item-name">{membership.organizations.name}</span>
                <span class="org-item-role">{membership.role}</span>
              </div>
              <i class="fi fi-br-angle-right" style="color: #878fa1; font-size: 10px;"></i>
            </a>
          {/each}
        </div>
      {/if}

      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
        <a href="/register" class="btn btn-primary" style="font-size: 12px;">Create New Org</a>
        <a href="/" class="btn btn-primary" style="font-size: 12px;">Home</a>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../styles/col.scss' as *;

  .org-select-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
  }
  .org-select-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: $dark-primary;
    border-radius: 10px;
    padding: 40px;
    min-width: 350px;
  }
  .org-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    margin-top: 15px;
  }
  .org-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background-color: $dark-secondary;
    border-radius: 8px;
    color: white;
    text-decoration: none;
    transition: background-color 0.2s ease;
  }
  .org-item:hover {
    background-color: lighten($dark-secondary, 5%);
    color: white;
  }
  .org-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .org-item-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .org-item-name {
    font-weight: 600;
    font-size: 14px;
  }
  .org-item-role {
    font-size: 11px;
    color: $light-tertiary;
    text-transform: capitalize;
  }
</style>
