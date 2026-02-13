<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/utils/supabase';
  import type { Organization } from '$lib/types';

  let authenticated = false;
  let isAdmin = false;
  let loading = true;
  let organizations: (Organization & { member_count?: number; applicant_count?: number })[] = [];

  // Login state
  let email = '';
  let password = '';
  let loginError = '';

  onMount(async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      authenticated = true;
      // For now, any authenticated user can view admin
      // TODO: add a platform_admins table or check user metadata
      isAdmin = true;
      await loadOrgs();
    }
    loading = false;
  });

  async function handleLogin() {
    loginError = '';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      loginError = error.message;
      return;
    }
    authenticated = true;
    isAdmin = true;
    await loadOrgs();
  }

  async function loadOrgs() {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    organizations = data || [];

    // Get counts for each org
    for (const org of organizations) {
      const { count: members } = await supabase
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id);
      org.member_count = members || 0;

      const { count: applicants } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id);
      org.applicant_count = applicants || 0;
    }
    organizations = [...organizations]; // trigger reactivity
  }
</script>

{#if loading}
  <div class="admin-screen">
    <div class="admin-login">
      <h2 style="color: white;">Loading...</h2>
    </div>
  </div>
{:else if !authenticated}
  <div class="admin-screen">
    <div class="admin-login">
      <h2 style="color: white;">Admin Login</h2>
      <input type="email" class="form-control input-dark" bind:value={email} placeholder="Email" />
      <input type="password" class="form-control input-dark" bind:value={password} placeholder="Password" />
      {#if loginError}
        <p style="color: #ef4444; font-size: 13px;">{loginError}</p>
      {/if}
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <a href="/"><button type="button" class="btn btn-primary">Back</button></a>
        <button class="btn btn-primary" on:click={handleLogin}>Login</button>
      </div>
    </div>
  </div>
{:else}
  <div class="admin-dashboard">
    <div class="admin-header">
      <div style="display: flex; align-items: center; gap: 15px;">
        <a href="/"><img src="/images/ui/logo.png" alt="LUMA" style="height: 40px;" /></a>
        <h4 style="margin: 0;">Platform Admin</h4>
      </div>
      <a href="/" class="btn btn-quaternary" style="font-size: 12px;">Home</a>
    </div>

    <div class="admin-content">
      <div class="admin-stats">
        <div class="stat-card">
          <span class="stat-number">{organizations.length}</span>
          <span class="stat-label">Organizations</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{organizations.reduce((s, o) => s + (o.member_count || 0), 0)}</span>
          <span class="stat-label">Total Members</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">{organizations.reduce((s, o) => s + (o.applicant_count || 0), 0)}</span>
          <span class="stat-label">Total Applicants</span>
        </div>
      </div>

      <h5 style="margin-top: 30px;">Organizations</h5>

      {#if organizations.length === 0}
        <p style="color: #878fa1;">No organizations created yet.</p>
      {:else}
        <div class="org-table">
          {#each organizations as org}
            <div class="org-row">
              <div class="org-row-left">
                <span class="org-dot" style="background-color: {org.primary_color};"></span>
                <div>
                  <span class="org-row-name">{org.name}</span>
                  <span class="org-row-slug">/apply/{org.slug}</span>
                </div>
              </div>
              <div class="org-row-stats">
                <span>{org.member_count || 0} members</span>
                <span>{org.applicant_count || 0} applicants</span>
              </div>
              <div class="org-row-actions">
                <a href="/private/{org.slug}/dashboard" class="btn btn-quaternary" style="font-size: 11px;">Dashboard</a>
                <a href="/private/{org.slug}/settings" class="btn btn-quaternary" style="font-size: 11px;">Settings</a>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../styles/col.scss' as *;

  .admin-screen {
    display: flex;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
  }
  .admin-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: $dark-primary;
    border-radius: 10px;
    width: 40vw;
    padding: 30px;
    gap: 15px;
  }
  .input-dark {
    background-color: $dark-primary;
    border-color: $light-tertiary;
    width: 75%;
    color: white;
  }
  .input-dark:focus, .input-dark:active {
    background-color: $dark-primary;
    box-shadow: none;
    border-color: $yellow-primary;
    color: white;
  }

  .admin-dashboard {
    min-height: 100vh;
    background-color: $light-secondary;
  }
  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 30px;
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
  }
  .admin-content {
    padding: 30px;
    max-width: 900px;
    margin: 0 auto;
  }
  .admin-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
  }
  .stat-number {
    font-size: 32px;
    font-weight: 900;
    color: $dark-primary;
  }
  .stat-label {
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-top: 4px;
  }

  .org-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .org-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.06);
  }
  .org-row-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .org-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .org-row-name {
    font-weight: 700;
    font-size: 14px;
    display: block;
  }
  .org-row-slug {
    font-size: 11px;
    color: $light-tertiary;
    font-family: monospace;
  }
  .org-row-stats {
    display: flex;
    gap: 20px;
    font-size: 12px;
    color: $light-tertiary;
  }
  .org-row-actions {
    display: flex;
    gap: 8px;
  }
</style>
