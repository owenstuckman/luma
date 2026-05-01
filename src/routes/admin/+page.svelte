<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase, isPlatformAdmin, getAllUsersAdmin, getPlatformAdmins, getAllJobPostingsAdmin, getAllApplicantsAdmin, getPlatformSettings, getAdminAnalytics } from '$lib/utils/supabase';
  import type { Organization, AdminUser, PlatformAdmin, AdminJobPosting, AdminApplicant, PlatformSettings, AdminAnalytics, JobPosting, Interview, Applicant, OrgMember } from '$lib/types';
  import EmailGeneratorModal from '$lib/components/recruiter/EmailGeneratorModal.svelte';
  import OverviewTab from '$lib/components/admin/OverviewTab.svelte';
  import OrgsTab from '$lib/components/admin/OrgsTab.svelte';
  import UsersTab from '$lib/components/admin/UsersTab.svelte';
  import JobsTab from '$lib/components/admin/JobsTab.svelte';
  import ApplicantsTab from '$lib/components/admin/ApplicantsTab.svelte';
  import SchedulingTab from '$lib/components/admin/SchedulingTab.svelte';
  import SettingsTab from '$lib/components/admin/SettingsTab.svelte';
  import AdminsTab from '$lib/components/admin/AdminsTab.svelte';

  // Auth
  let authenticated = false;
  let isAdmin = false;
  let loading = true;
  let email = '';
  let password = '';
  let loginError = '';

  // Tab
  type TabId = 'overview' | 'orgs' | 'users' | 'jobs' | 'applicants' | 'scheduling' | 'settings' | 'admins';
  let activeTab: TabId = 'overview';

  // Shared data
  let organizations: (Organization & { member_count?: number; applicant_count?: number })[] = [];
  let users: AdminUser[] = [];
  let platformAdmins: PlatformAdmin[] = [];
  let jobPostings: AdminJobPosting[] = [];
  let applicants: AdminApplicant[] = [];
  let analytics: AdminAnalytics | null = null;
  let analyticsLoaded = false;
  let analyticsError = '';
  let platformSettings: PlatformSettings = {};

  // Email modal (owned by parent, populated by SchedulingTab via event)
  let showEmailModal = false;
  let emailModalData: { interviews: Interview[]; applicants: Applicant[]; orgMembers: (OrgMember & { email: string })[]; jobs: JobPosting[]; orgName: string; orgId: number; slug: string } | null = null;

  const tabLabels: Record<TabId, string> = {
    overview: 'Platform Overview', orgs: 'Organizations', users: 'User Directory',
    jobs: 'Job Postings', applicants: 'Applicants', scheduling: 'Scheduling',
    settings: 'Platform Settings', admins: 'Platform Admins'
  };

  onMount(async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      authenticated = true;
      isAdmin = await isPlatformAdmin();
      if (isAdmin) await loadAllData();
    }
    loading = false;
  });

  async function handleLogin() {
    loginError = '';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { loginError = error.message; return; }
    authenticated = true;
    isAdmin = await isPlatformAdmin();
    if (!isAdmin) { loginError = 'You do not have platform admin access.'; return; }
    await loadAllData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    authenticated = false; isAdmin = false;
  }

  async function loadAllData() {
    await Promise.allSettled([loadOrgs(), loadUsers(), loadAdmins(), loadJobs(), loadApplicants(), loadAnalytics(), loadSettings()]);
  }

  async function loadOrgs() {
    const { data } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
    organizations = data || [];
    for (const org of organizations) {
      const { count: members } = await supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', org.id);
      org.member_count = members || 0;
      const { count: apps } = await supabase.from('applicants').select('*', { count: 'exact', head: true }).eq('org_id', org.id);
      org.applicant_count = apps || 0;
    }
    organizations = [...organizations];
  }
  async function loadUsers() { users = await getAllUsersAdmin(); }
  async function loadAdmins() { platformAdmins = await getPlatformAdmins(); }
  async function loadJobs() { jobPostings = await getAllJobPostingsAdmin(); }
  async function loadApplicants() { applicants = await getAllApplicantsAdmin(); }
  async function loadAnalytics() {
    analyticsError = '';
    try {
      analytics = await getAdminAnalytics();
      if (!analytics) analyticsError = 'Failed to load analytics data.';
    } catch (e: any) { analyticsError = e.message || 'Failed to load analytics'; analytics = null; }
    analyticsLoaded = true;
  }
  async function loadSettings() {
    platformSettings = await getPlatformSettings();
  }

  function handleOpenEmailModal(event: CustomEvent<typeof emailModalData>) {
    emailModalData = event.detail;
    showEmailModal = true;
  }
</script>

{#if loading}
  <div class="admin-screen">
    <div class="admin-login">
      <h2 style="color: white;">Loading...</h2>
    </div>
  </div>
{:else if !authenticated || !isAdmin}
  <div class="admin-screen">
    <div class="admin-login">
      <h2 style="color: white;">Admin Login</h2>
      <input type="email" class="form-control input-dark" bind:value={email} placeholder="Email" />
      <input type="password" class="form-control input-dark" bind:value={password} placeholder="Password"
        on:keydown={(e) => e.key === 'Enter' && handleLogin()} />
      {#if loginError}
        <p class="error-text">{loginError}</p>
      {/if}
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <a href="/"><button type="button" class="btn btn-primary">Back</button></a>
        <button class="btn btn-primary" on:click={handleLogin}>Login</button>
      </div>
    </div>
  </div>
{:else}
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <a href="/"><img src="/images/ui/logo.png" alt="LUMA" style="height: 32px;" /></a>
        <span class="sidebar-title">Admin</span>
      </div>
      <nav class="sidebar-nav">
        <button class="nav-item" class:active={activeTab === 'overview'} on:click={() => activeTab = 'overview'}>
          <i class="fi fi-br-chart-pie-alt" aria-hidden="true"></i> Overview
        </button>
        <button class="nav-item" class:active={activeTab === 'orgs'} on:click={() => activeTab = 'orgs'}>
          <i class="fi fi-br-building" aria-hidden="true"></i> Organizations
        </button>
        <button class="nav-item" class:active={activeTab === 'users'} on:click={() => activeTab = 'users'}>
          <i class="fi fi-br-users" aria-hidden="true"></i> Users
        </button>
        <button class="nav-item" class:active={activeTab === 'jobs'} on:click={() => activeTab = 'jobs'}>
          <i class="fi fi-br-briefcase" aria-hidden="true"></i> Job Postings
        </button>
        <button class="nav-item" class:active={activeTab === 'applicants'} on:click={() => activeTab = 'applicants'}>
          <i class="fi fi-br-document" aria-hidden="true"></i> Applicants
        </button>
        <button class="nav-item" class:active={activeTab === 'scheduling'} on:click={() => activeTab = 'scheduling'}>
          <i class="fi fi-br-calendar-clock" aria-hidden="true"></i> Scheduling
        </button>
        <div class="nav-divider"></div>
        <button class="nav-item" class:active={activeTab === 'settings'} on:click={() => activeTab = 'settings'}>
          <i class="fi fi-br-settings" aria-hidden="true"></i> Settings
        </button>
        <button class="nav-item" class:active={activeTab === 'admins'} on:click={() => activeTab = 'admins'}>
          <i class="fi fi-br-shield" aria-hidden="true"></i> Admins
        </button>
        <button class="nav-item nav-logout" on:click={handleLogout}>
          <i class="fi fi-br-sign-out-alt" aria-hidden="true"></i> Logout
        </button>
      </nav>
    </aside>

    <main class="admin-main">
      <div class="admin-header">
        <h4>{tabLabels[activeTab]}</h4>
        <a href="/" class="btn btn-quaternary" style="font-size: 12px;">Home</a>
      </div>
      <div class="admin-content">
        {#if activeTab === 'overview'}
          <OverviewTab
            {analytics} {analyticsLoaded} {analyticsError}
            on:retryAnalytics={loadAnalytics}
          />
        {:else if activeTab === 'orgs'}
          <OrgsTab {organizations} {platformSettings} on:reload={loadOrgs} />
        {:else if activeTab === 'users'}
          <UsersTab {users} {organizations} />
        {:else if activeTab === 'jobs'}
          <JobsTab {jobPostings} {organizations} on:reload={loadJobs} />
        {:else if activeTab === 'applicants'}
          <ApplicantsTab {applicants} on:reload={loadApplicants} />
        {:else if activeTab === 'scheduling'}
          <SchedulingTab {organizations} on:openEmailModal={handleOpenEmailModal} />
        {:else if activeTab === 'settings'}
          <SettingsTab {platformSettings} />
        {:else if activeTab === 'admins'}
          <AdminsTab {platformAdmins} on:reload={loadAdmins} />
        {/if}
      </div>
    </main>
  </div>
{/if}

{#if showEmailModal && emailModalData}
  <EmailGeneratorModal
    interviews={emailModalData.interviews}
    applicants={emailModalData.applicants}
    orgMembers={emailModalData.orgMembers}
    jobs={emailModalData.jobs}
    orgName={emailModalData.orgName}
    orgId={emailModalData.orgId}
    slug={emailModalData.slug}
    onClose={() => showEmailModal = false}
  />
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
    min-width: 320px;
    padding: 30px;
    gap: 15px;
  }
  .input-dark {
    background-color: $dark-primary;
    border-color: $light-tertiary;
    width: 75%;
    color: white;
    &:focus, &:active { background-color: $dark-primary; box-shadow: none; border-color: $yellow-primary; color: white; }
  }
  .admin-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
    background-color: $light-secondary;
  }
  .admin-sidebar {
    background-color: $dark-primary;
    color: white;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .sidebar-title {
    font-weight: 700;
    font-size: 14px;
    color: $light-tertiary;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    padding: 10px 0;
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 500;
    color: $light-tertiary;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    &:hover { color: white; background-color: rgba(255,255,255,0.05); }
    &.active { color: $yellow-primary; background-color: rgba(255, 200, 0, 0.08); border-left: 3px solid $yellow-primary; padding-left: 17px; }
  }
  .nav-divider {
    height: 1px;
    background-color: rgba(255,255,255,0.08);
    margin: 8px 20px;
  }
  .nav-logout { margin-top: auto; }
  .admin-main {
    overflow-y: auto;
    max-height: 100vh;
  }
  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 30px;
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    h4 { margin: 0; }
  }
  .admin-content {
    padding: 25px 30px;
    max-width: 1100px;
  }
  .error-text { color: #ef4444; font-size: 13px; margin: 4px 0; }

  @media (max-width: 768px) {
    .admin-layout { grid-template-columns: 1fr; }
    .admin-sidebar { display: none; }
  }
</style>
