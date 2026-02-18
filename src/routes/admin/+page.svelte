<script lang="ts">
  import { onMount } from 'svelte';
  import {
    supabase, isPlatformAdmin, getAllUsersAdmin, getPlatformAdmins,
    addPlatformAdminByEmail, removePlatformAdminById, adminCreateOrganization,
    adminDeleteOrganization, adminUpdateOrganization, adminTransferOwnership,
    getAllJobPostingsAdmin, getUserMembershipsAdmin, adminAddUserToOrg,
    adminRemoveUserFromOrg, adminChangeUserRole, toggleJobPostingActive,
    deleteJobPosting, getAllApplicantsAdmin, adminBulkUpdateStatus,
    adminBulkDeleteApplicants, getPlatformSettings, updatePlatformSettings,
    getAdminAnalytics, adminCreateJobPosting, getActiveRoles,
    getAllApplicants, getInterviewerAvailability, getInterviewsByOrg,
    bulkCreateInterviews, clearAutoScheduledInterviews,
    upsertSchedulingConfig, getSchedulingConfig
  } from '$lib/utils/supabase';
  import type {
    Organization, AdminUser, PlatformAdmin, AdminJobPosting, UserMembership,
    OrgRole, AdminApplicant, PlatformSettings, AdminAnalytics, JobPosting, Interview
  } from '$lib/types';
  import { algorithms, getAlgorithm } from '$lib/scheduling/registry';
  import type { SchedulerInput, SchedulerOutput, ProposedInterview, TimeRange } from '$lib/scheduling/types';

  // Auth state
  let authenticated = false;
  let isAdmin = false;
  let loading = true;
  let email = '';
  let password = '';
  let loginError = '';

  // Tab state
  type TabId = 'overview' | 'orgs' | 'users' | 'jobs' | 'applicants' | 'scheduling' | 'settings' | 'admins';
  let activeTab: TabId = 'overview';

  // Data
  let organizations: (Organization & { member_count?: number; applicant_count?: number })[] = [];
  let users: AdminUser[] = [];
  let platformAdmins: PlatformAdmin[] = [];
  let jobPostings: AdminJobPosting[] = [];
  let applicants: AdminApplicant[] = [];
  let analytics: AdminAnalytics | null = null;
  let analyticsLoaded = false;
  let analyticsError = '';
  let platformSettings: PlatformSettings = {};

  // Org create form
  let newOrgName = '';
  let newOrgSlug = '';
  let newOrgOwnerEmail = '';
  let newOrgPrimaryColor = '#ffc800';
  let newOrgSecondaryColor = '#0F1112';
  let orgCreateError = '';
  let orgCreateSuccess = '';
  let showCreateOrg = false;

  // Org edit state
  let editingOrgId: number | null = null;
  let editOrgName = '';
  let editOrgSlug = '';
  let editOrgPrimary = '';
  let editOrgSecondary = '';
  let orgEditError = '';

  // Org delete state
  let deletingOrg: (Organization & { member_count?: number; applicant_count?: number }) | null = null;
  let deleteConfirmName = '';

  // Transfer ownership
  let transferOrgId: number | null = null;
  let transferEmail = '';
  let transferError = '';

  // Admin management
  let newAdminEmail = '';
  let adminError = '';
  let adminSuccess = '';

  // User search
  let userSearch = '';
  let selectedUser: AdminUser | null = null;
  let selectedUserMemberships: UserMembership[] = [];
  let addToOrgId = '';
  let addToOrgRole: OrgRole = 'recruiter';
  let userActionError = '';
  let userActionSuccess = '';

  // Job filters
  let jobOrgFilter = '';
  let jobStatusFilter: 'all' | 'active' | 'inactive' = 'all';

  // Job create form
  let showCreateJob = false;
  let newJobName = '';
  let newJobDescription = '';
  let newJobOrgId = '';
  let jobCreateError = '';
  let jobCreateSuccess = '';
  let jobCreating = false;

  // Applicant state
  let appSearch = '';
  let appOrgFilter = '';
  let appStatusFilter: 'all' | 'pending' | 'interview' | 'accepted' | 'denied' = 'all';
  let selectedApplicantIds: Set<number> = new Set();
  let bulkStatusValue = 'pending';
  let appActionError = '';
  let appActionSuccess = '';
  let expandedApplicantId: number | null = null;

  // Settings state
  let settingsLoading = false;
  let settingsError = '';
  let settingsSuccess = '';
  let editSettings: PlatformSettings = {};

  // Scheduling state
  let schedOrgId: number | null = null;
  let schedJobId: number | null = null;
  let schedJobs: JobPosting[] = [];
  let schedAlgorithmId = 'greedy-first-available';
  let schedConfig: Record<string, unknown> = {
    slotDurationMinutes: 30,
    breakBetweenMinutes: 10,
    maxInterviewsPerInterviewer: 0,
    interviewType: 'individual',
    location: ''
  };
  let schedPreview: SchedulerOutput | null = null;
  let schedPreviewing = false;
  let schedApplying = false;
  let schedClearing = false;
  let schedError = '';
  let schedSuccess = '';

  $: filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  $: filteredJobs = jobPostings.filter(j => {
    const orgMatch = !jobOrgFilter || j.org_name?.toLowerCase().includes(jobOrgFilter.toLowerCase());
    const statusMatch = jobStatusFilter === 'all' ||
      (jobStatusFilter === 'active' && j.active_flg) ||
      (jobStatusFilter === 'inactive' && !j.active_flg);
    return orgMatch && statusMatch;
  });

  $: filteredApplicants = applicants.filter(a => {
    const searchMatch = !appSearch ||
      a.name?.toLowerCase().includes(appSearch.toLowerCase()) ||
      a.email?.toLowerCase().includes(appSearch.toLowerCase());
    const orgMatch = !appOrgFilter || a.org_name?.toLowerCase().includes(appOrgFilter.toLowerCase());
    const statusMatch = appStatusFilter === 'all' || a.status === appStatusFilter;
    return searchMatch && orgMatch && statusMatch;
  });

  $: allSelected = filteredApplicants.length > 0 && filteredApplicants.every(a => selectedApplicantIds.has(a.id));

  // Analytics derived
  $: statusCounts = analytics?.applicants_by_status || {};
  $: maxStatusCount = Math.max(...Object.values(statusCounts as Record<string, number>).map(Number), 1);
  $: maxDayCount = analytics?.applicants_last_30_days
    ? Math.max(...analytics.applicants_last_30_days.map(d => d.count), 1)
    : 1;

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

  async function loadAllData() {
    const results = await Promise.allSettled([loadOrgs(), loadUsers(), loadAdmins(), loadJobs(), loadApplicants(), loadAnalytics(), loadSettings()]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const names = ['orgs', 'users', 'admins', 'jobs', 'applicants', 'analytics', 'settings'];
        console.error(`Failed to load ${names[i]}:`, r.reason);
      }
    });
  }

  async function loadOrgs() {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });
    organizations = data || [];

    for (const org of organizations) {
      const { count: members } = await supabase
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id);
      org.member_count = members || 0;

      const { count: apps } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id);
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
      if (!analytics) analyticsError = 'Failed to load analytics data. The database function may not exist yet.';
    } catch (e: any) {
      analyticsError = e.message || 'Failed to load analytics';
      analytics = null;
    }
    analyticsLoaded = true;
  }
  async function loadSettings() {
    platformSettings = await getPlatformSettings();
    editSettings = { ...platformSettings };
  }

  // Org CRUD
  function autoSlug() {
    newOrgSlug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function createOrg() {
    orgCreateError = ''; orgCreateSuccess = '';
    if (!newOrgName || !newOrgSlug || !newOrgOwnerEmail) { orgCreateError = 'All fields are required.'; return; }
    try {
      await adminCreateOrganization(newOrgName, newOrgSlug, newOrgOwnerEmail, newOrgPrimaryColor, newOrgSecondaryColor);
      orgCreateSuccess = `Created "${newOrgName}" successfully.`;
      newOrgName = ''; newOrgSlug = ''; newOrgOwnerEmail = '';
      newOrgPrimaryColor = '#ffc800'; newOrgSecondaryColor = '#0F1112';
      showCreateOrg = false;
      await loadOrgs();
    } catch (e: any) { orgCreateError = e.message; }
  }

  function startEditOrg(org: Organization) {
    editingOrgId = org.id; editOrgName = org.name; editOrgSlug = org.slug;
    editOrgPrimary = org.primary_color; editOrgSecondary = org.secondary_color; orgEditError = '';
  }

  async function saveEditOrg() {
    orgEditError = '';
    if (!editingOrgId) return;
    try {
      await adminUpdateOrganization(editingOrgId, { name: editOrgName, slug: editOrgSlug, primary_color: editOrgPrimary, secondary_color: editOrgSecondary });
      editingOrgId = null;
      await loadOrgs();
    } catch (e: any) { orgEditError = e.message; }
  }

  async function confirmDeleteOrg() {
    if (!deletingOrg || deleteConfirmName !== deletingOrg.name) return;
    try {
      await adminDeleteOrganization(deletingOrg.id);
      deletingOrg = null; deleteConfirmName = '';
      await loadOrgs();
    } catch (e: any) { orgEditError = e.message; }
  }

  async function handleTransferOwnership() {
    transferError = '';
    if (!transferOrgId || !transferEmail) return;
    try {
      await adminTransferOwnership(transferOrgId, transferEmail);
      transferOrgId = null; transferEmail = '';
      await loadOrgs();
    } catch (e: any) { transferError = e.message; }
  }

  // Admin management
  async function addAdmin() {
    adminError = ''; adminSuccess = '';
    if (!newAdminEmail) return;
    try {
      await addPlatformAdminByEmail(newAdminEmail);
      adminSuccess = `Added ${newAdminEmail} as platform admin.`;
      newAdminEmail = '';
      await loadAdmins();
    } catch (e: any) { adminError = e.message; }
  }

  async function removeAdmin(admin: PlatformAdmin) {
    if (!confirm(`Remove ${admin.email} as platform admin?`)) return;
    try { await removePlatformAdminById(admin.user_id); await loadAdmins(); }
    catch (e: any) { adminError = e.message; }
  }

  // User management
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
    try { await adminRemoveUserFromOrg(orgId, selectedUser.id); selectedUserMemberships = await getUserMembershipsAdmin(selectedUser.id); }
    catch (e: any) { userActionError = e.message; }
  }

  async function changeUserRole(orgId: number, newRole: string) {
    if (!selectedUser) return;
    try { await adminChangeUserRole(orgId, selectedUser.id, newRole); selectedUserMemberships = await getUserMembershipsAdmin(selectedUser.id); }
    catch (e: any) { userActionError = e.message; }
  }

  // Job actions
  async function toggleJob(jobId: number, currentActive: boolean) {
    try { await toggleJobPostingActive(jobId, !currentActive); await loadJobs(); } catch (e: any) { console.error(e); }
  }
  async function deleteJob(jobId: number) {
    if (!confirm('Delete this job posting? This cannot be undone.')) return;
    try { await deleteJobPosting(jobId); await loadJobs(); } catch (e: any) { console.error(e); }
  }
  async function createJob() {
    jobCreateError = ''; jobCreateSuccess = '';
    if (!newJobName.trim() || !newJobOrgId) { jobCreateError = 'Name and organization are required.'; return; }
    jobCreating = true;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerEmail = userData?.user?.email || '';
      await adminCreateJobPosting({
        name: newJobName,
        description: newJobDescription,
        owner: ownerEmail,
        org_id: parseInt(newJobOrgId),
        questions: { steps: [] },
        schedule: {},
      });
      jobCreateSuccess = `Created "${newJobName}" successfully.`;
      newJobName = ''; newJobDescription = ''; newJobOrgId = '';
      showCreateJob = false;
      await loadJobs();
    } catch (e: any) { jobCreateError = e.message; }
    jobCreating = false;
  }

  // Applicant actions
  function toggleApplicantSelect(id: number) {
    if (selectedApplicantIds.has(id)) selectedApplicantIds.delete(id);
    else selectedApplicantIds.add(id);
    selectedApplicantIds = new Set(selectedApplicantIds);
  }

  function toggleAllApplicants() {
    if (allSelected) {
      selectedApplicantIds = new Set();
    } else {
      selectedApplicantIds = new Set(filteredApplicants.map(a => a.id));
    }
  }

  async function bulkUpdateStatus() {
    if (selectedApplicantIds.size === 0) return;
    appActionError = ''; appActionSuccess = '';
    try {
      await adminBulkUpdateStatus([...selectedApplicantIds], bulkStatusValue);
      appActionSuccess = `Updated ${selectedApplicantIds.size} applicants to "${bulkStatusValue}".`;
      selectedApplicantIds = new Set();
      await loadApplicants();
    } catch (e: any) { appActionError = e.message; }
  }

  async function bulkDelete() {
    if (selectedApplicantIds.size === 0) return;
    if (!confirm(`Delete ${selectedApplicantIds.size} applicants? This cannot be undone.`)) return;
    appActionError = ''; appActionSuccess = '';
    try {
      await adminBulkDeleteApplicants([...selectedApplicantIds]);
      appActionSuccess = `Deleted ${selectedApplicantIds.size} applicants.`;
      selectedApplicantIds = new Set();
      await loadApplicants();
    } catch (e: any) { appActionError = e.message; }
  }

  function exportApplicantsCsv() {
    const rows = selectedApplicantIds.size > 0
      ? filteredApplicants.filter(a => selectedApplicantIds.has(a.id))
      : filteredApplicants;

    const headers = ['ID', 'Name', 'Email', 'Status', 'Organization', 'Job', 'Submitted'];
    const csvRows = [headers.join(',')];
    for (const a of rows) {
      csvRows.push([
        a.id, `"${a.name}"`, `"${a.email}"`, a.status,
        `"${a.org_name || ''}"`, `"${a.job_name || ''}"`,
        new Date(a.created_at).toLocaleDateString()
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'applicants_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Settings
  async function saveSettings() {
    settingsLoading = true; settingsError = ''; settingsSuccess = '';
    try {
      await updatePlatformSettings(editSettings);
      settingsSuccess = 'Settings saved successfully.';
      platformSettings = { ...editSettings };
    } catch (e: any) { settingsError = e.message; }
    settingsLoading = false;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    authenticated = false; isAdmin = false;
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'accepted': return '#065f46';
      case 'interview': return '#1e40af';
      case 'denied': return '#991b1b';
      default: return '#92400e';
    }
  }

  function statusBg(status: string): string {
    switch (status) {
      case 'accepted': return '#ecfdf5';
      case 'interview': return '#eff6ff';
      case 'denied': return '#fef2f2';
      default: return '#fffbeb';
    }
  }

  // Scheduling functions
  async function onSchedOrgChange() {
    schedJobs = [];
    schedJobId = null;
    schedPreview = null;
    schedError = '';
    schedSuccess = '';
    if (!schedOrgId) return;
    try {
      schedJobs = await getActiveRoles(schedOrgId);
      const existing = await getSchedulingConfig(schedOrgId);
      if (existing) {
        schedAlgorithmId = existing.algorithm_id;
        schedConfig = { ...schedConfig, ...(existing.config as Record<string, unknown>) };
      }
    } catch (e: any) {
      console.error('Error loading scheduling data:', e);
    }
  }

  function parseApplicantAvailability(recruitInfo: Record<string, string> | null): TimeRange[] {
    if (!recruitInfo) return [];
    // Look for availability key — AvailabilityGrid stores as JSON string of ranges
    for (const [key, value] of Object.entries(recruitInfo)) {
      if (key.toLowerCase().includes('availability') || key.toLowerCase().includes('avail')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed as TimeRange[];
          if (parsed?.ranges && Array.isArray(parsed.ranges)) return parsed.ranges as TimeRange[];
        } catch { /* not JSON, skip */ }
      }
    }
    return [];
  }

  async function runPreview() {
    if (!schedOrgId) return;
    schedPreviewing = true;
    schedError = '';
    schedSuccess = '';
    schedPreview = null;

    try {
      // Fetch applicants
      const allApplicants = await getAllApplicants(schedOrgId);
      const filtered = schedJobId
        ? allApplicants.filter(a => a.job === schedJobId)
        : allApplicants;

      const schedulerApplicants = filtered.map(a => ({
        email: a.email,
        name: a.name,
        jobId: a.job || 0,
        availability: parseApplicantAvailability(a.recruitInfo)
      }));

      // Fetch interviewer availability
      const iaRows = await getInterviewerAvailability(schedOrgId);
      const interviewerMap = new Map<string, TimeRange[]>();
      for (const row of iaRows) {
        const ranges = interviewerMap.get(row.email) || [];
        ranges.push({
          date: row.date,
          start: row.start_time.substring(0, 5),
          end: row.end_time.substring(0, 5)
        });
        interviewerMap.set(row.email, ranges);
      }
      const schedulerInterviewers = Array.from(interviewerMap.entries()).map(([email, availability]) => ({
        email,
        availability
      }));

      // Fetch existing interviews
      const existingInterviews = await getInterviewsByOrg(schedOrgId);
      const existingForScheduler = existingInterviews.map(iv => ({
        startTime: iv.startTime,
        endTime: iv.endTime || iv.startTime,
        interviewer: iv.interviewer || '',
        applicant: iv.applicant || ''
      }));

      const algorithm = getAlgorithm(schedAlgorithmId);
      if (!algorithm) {
        schedError = 'Algorithm not found.';
        schedPreviewing = false;
        return;
      }

      const input: SchedulerInput = {
        applicants: schedulerApplicants,
        interviewers: schedulerInterviewers,
        existingInterviews: existingForScheduler,
        config: {
          slotDurationMinutes: Number(schedConfig.slotDurationMinutes) || 30,
          breakBetweenMinutes: Number(schedConfig.breakBetweenMinutes) || 10,
          maxInterviewsPerInterviewer: Number(schedConfig.maxInterviewsPerInterviewer) || 0,
          interviewType: (schedConfig.interviewType as 'individual' | 'group') || 'individual',
          location: String(schedConfig.location || ''),
          ...schedConfig
        }
      };

      schedPreview = algorithm.run(input);
    } catch (e: any) {
      schedError = e.message || 'Preview failed.';
    }
    schedPreviewing = false;
  }

  async function applySchedule() {
    if (!schedOrgId || !schedPreview || schedPreview.interviews.length === 0) return;
    schedApplying = true;
    schedError = '';
    schedSuccess = '';

    try {
      const rows = schedPreview.interviews.map(iv => ({
        startTime: iv.startTime,
        endTime: iv.endTime,
        location: iv.location,
        type: iv.type,
        job: iv.jobId,
        applicant: iv.applicant,
        interviewer: iv.interviewer,
        org_id: schedOrgId!,
        source: 'auto'
      }));

      await bulkCreateInterviews(rows);

      // Save config
      await upsertSchedulingConfig(schedOrgId!, schedAlgorithmId, schedConfig, schedJobId || undefined);

      schedSuccess = `Created ${rows.length} interviews successfully.`;
      schedPreview = null;
    } catch (e: any) {
      schedError = e.message || 'Failed to apply schedule.';
    }
    schedApplying = false;
  }

  async function clearAutoInterviews() {
    if (!schedOrgId) return;
    if (!confirm('Delete all auto-scheduled interviews for this org/job? This cannot be undone.')) return;
    schedClearing = true;
    schedError = '';
    schedSuccess = '';

    try {
      await clearAutoScheduledInterviews(schedOrgId, schedJobId || undefined);
      schedSuccess = 'Auto-scheduled interviews cleared.';
    } catch (e: any) {
      schedError = e.message || 'Failed to clear interviews.';
    }
    schedClearing = false;
  }

  const tabLabels: Record<TabId, string> = {
    overview: 'Platform Overview', orgs: 'Organizations', users: 'User Directory',
    jobs: 'Job Postings', applicants: 'Applicants', scheduling: 'Scheduling',
    settings: 'Platform Settings', admins: 'Platform Admins'
  };
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
    <!-- Sidebar -->
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <a href="/"><img src="/images/ui/logo.png" alt="LUMA" style="height: 32px;" /></a>
        <span class="sidebar-title">Admin</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item" class:active={activeTab === 'overview'} on:click={() => activeTab = 'overview'}>
          <i class="fi fi-br-chart-pie-alt"></i> Overview
        </button>
        <button class="nav-item" class:active={activeTab === 'orgs'} on:click={() => activeTab = 'orgs'}>
          <i class="fi fi-br-building"></i> Organizations
        </button>
        <button class="nav-item" class:active={activeTab === 'users'} on:click={() => activeTab = 'users'}>
          <i class="fi fi-br-users"></i> Users
        </button>
        <button class="nav-item" class:active={activeTab === 'jobs'} on:click={() => activeTab = 'jobs'}>
          <i class="fi fi-br-briefcase"></i> Job Postings
        </button>
        <button class="nav-item" class:active={activeTab === 'applicants'} on:click={() => activeTab = 'applicants'}>
          <i class="fi fi-br-document"></i> Applicants
        </button>
        <button class="nav-item" class:active={activeTab === 'scheduling'} on:click={() => activeTab = 'scheduling'}>
          <i class="fi fi-br-calendar-clock"></i> Scheduling
        </button>

        <div class="nav-divider"></div>

        <button class="nav-item" class:active={activeTab === 'settings'} on:click={() => activeTab = 'settings'}>
          <i class="fi fi-br-settings"></i> Settings
        </button>
        <button class="nav-item" class:active={activeTab === 'admins'} on:click={() => activeTab = 'admins'}>
          <i class="fi fi-br-shield"></i> Admins
        </button>
        <button class="nav-item nav-logout" on:click={handleLogout}>
          <i class="fi fi-br-sign-out-alt"></i> Logout
        </button>
      </nav>
    </aside>

    <!-- Content -->
    <main class="admin-main">
      <div class="admin-header">
        <h4>{tabLabels[activeTab]}</h4>
        <a href="/" class="btn btn-quaternary" style="font-size: 12px;">Home</a>
      </div>

      <div class="admin-content">
        <!-- ==================== OVERVIEW TAB ==================== -->
        {#if activeTab === 'overview'}
          {#if analyticsError}
            <div class="alert-error">
              <p><strong>Could not load analytics:</strong> {analyticsError}</p>
              <button class="btn btn-primary btn-sm" style="margin-top: 8px;" on:click={loadAnalytics}>Retry</button>
            </div>
          {:else if !analyticsLoaded}
            <p class="muted">Loading analytics...</p>
          {:else if analytics}
            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-number">{analytics.total_orgs}</span>
                <span class="stat-label">Organizations</span>
              </div>
              <div class="stat-card">
                <span class="stat-number">{analytics.total_users}</span>
                <span class="stat-label">Registered Users</span>
              </div>
              <div class="stat-card">
                <span class="stat-number">{analytics.total_applicants}</span>
                <span class="stat-label">Total Applicants</span>
              </div>
              <div class="stat-card">
                <span class="stat-number">{analytics.total_interviews}</span>
                <span class="stat-label">Total Interviews</span>
              </div>
              <div class="stat-card">
                <span class="stat-number">{analytics.total_jobs}</span>
                <span class="stat-label">Job Postings</span>
              </div>
              <div class="stat-card">
                <span class="stat-number">{analytics.active_jobs}</span>
                <span class="stat-label">Active Jobs</span>
              </div>
            </div>

            <!-- Applicants by Status -->
            {#if analytics.applicants_by_status}
              <h5 class="section-title">Applicants by Status</h5>
              <div class="status-bars">
                {#each Object.entries(analytics.applicants_by_status) as [status, count]}
                  <div class="status-bar-row">
                    <span class="status-bar-label" style="color: {statusColor(status)};">{status}</span>
                    <div class="status-bar-track">
                      <div class="status-bar-fill" style="width: {(Number(count) / maxStatusCount) * 100}%; background-color: {statusColor(status)};"></div>
                    </div>
                    <span class="status-bar-count">{count}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Applicants Last 30 Days -->
            {#if analytics.applicants_last_30_days && analytics.applicants_last_30_days.length > 0}
              <h5 class="section-title">Applicants (Last 30 Days)</h5>
              <div class="chart-container">
                <div class="bar-chart">
                  {#each analytics.applicants_last_30_days as day}
                    <div class="bar-col" title="{day.day}: {day.count}">
                      <div class="bar" style="height: {(day.count / maxDayCount) * 100}%;"></div>
                      <span class="bar-label">{new Date(day.day).getDate()}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Orgs by Size -->
            {#if analytics.orgs_by_size && analytics.orgs_by_size.length > 0}
              <h5 class="section-title">Organizations by Size</h5>
              {#each analytics.orgs_by_size as org}
                <div class="list-row">
                  <div class="row-left">
                    <span class="org-dot" style="background-color: {org.primary_color};"></span>
                    <div>
                      <span class="row-name">{org.name}</span>
                      <span class="row-sub">/apply/{org.slug}</span>
                    </div>
                  </div>
                  <div class="row-stats">
                    <span>{org.member_count} members</span>
                  </div>
                </div>
              {/each}
            {/if}

            <!-- Recent Activity -->
            <div class="activity-grid">
              <div>
                <h5 class="section-title">Recent Applications</h5>
                {#if analytics.recent_applicants}
                  {#each analytics.recent_applicants as app}
                    <div class="activity-row">
                      <div>
                        <span class="row-name">{app.name}</span>
                        <span class="row-sub">{app.email}</span>
                      </div>
                      <div style="text-align: right;">
                        <span class="badge" style="background-color: {statusBg(app.status)}; color: {statusColor(app.status)};">{app.status}</span>
                        <span class="row-sub">{new Date(app.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  {/each}
                {:else}
                  <p class="muted">No recent applications.</p>
                {/if}
              </div>

              <div>
                <h5 class="section-title">Recent Sign-ups</h5>
                {#if analytics.recent_users}
                  {#each analytics.recent_users as user}
                    <div class="activity-row">
                      <span class="row-name">{user.email}</span>
                      <span class="row-sub">{new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                  {/each}
                {:else}
                  <p class="muted">No recent sign-ups.</p>
                {/if}
              </div>
            </div>
          {:else}
            <p class="muted">No analytics data available.</p>
          {/if}

        <!-- ==================== ORGS TAB ==================== -->
        {:else if activeTab === 'orgs'}
          <div style="margin-bottom: 20px;">
            <button class="btn btn-primary" on:click={() => showCreateOrg = !showCreateOrg}>
              {showCreateOrg ? 'Cancel' : '+ New Organization'}
            </button>
          </div>

          {#if orgCreateSuccess}
            <div class="alert-success">{orgCreateSuccess}</div>
          {/if}

          {#if showCreateOrg}
            <div class="form-card">
              <h6>Create Organization</h6>
              <div class="form-row">
                <label>Name</label>
                <input class="form-control" bind:value={newOrgName} on:input={autoSlug} placeholder="My Organization" />
              </div>
              <div class="form-row">
                <label>Slug</label>
                <input class="form-control" bind:value={newOrgSlug} placeholder="my-organization" />
              </div>
              <div class="form-row">
                <label>Owner Email</label>
                <input class="form-control" bind:value={newOrgOwnerEmail} placeholder="owner@example.com" />
              </div>
              <div class="form-row color-row">
                <div>
                  <label>Primary Color</label>
                  <input type="color" bind:value={newOrgPrimaryColor} />
                </div>
                <div>
                  <label>Secondary Color</label>
                  <input type="color" bind:value={newOrgSecondaryColor} />
                </div>
              </div>
              {#if orgCreateError}
                <p class="error-text">{orgCreateError}</p>
              {/if}
              <button class="btn btn-primary" on:click={createOrg}>Create</button>
            </div>
          {/if}

          {#each organizations as org}
            <div class="list-row org-expandable">
              {#if editingOrgId === org.id}
                <div class="edit-form">
                  <div class="form-row">
                    <label>Name</label>
                    <input class="form-control" bind:value={editOrgName} />
                  </div>
                  <div class="form-row">
                    <label>Slug</label>
                    <input class="form-control" bind:value={editOrgSlug} />
                  </div>
                  <div class="form-row color-row">
                    <div>
                      <label>Primary</label>
                      <input type="color" bind:value={editOrgPrimary} />
                    </div>
                    <div>
                      <label>Secondary</label>
                      <input type="color" bind:value={editOrgSecondary} />
                    </div>
                  </div>
                  {#if orgEditError}
                    <p class="error-text">{orgEditError}</p>
                  {/if}
                  <div class="btn-group">
                    <button class="btn btn-primary btn-sm" on:click={saveEditOrg}>Save</button>
                    <button class="btn btn-quaternary btn-sm" on:click={() => editingOrgId = null}>Cancel</button>
                  </div>
                </div>
              {:else}
                <div class="row-left">
                  <span class="org-dot" style="background-color: {org.primary_color};"></span>
                  <div>
                    <span class="row-name">{org.name}</span>
                    <span class="row-sub">/apply/{org.slug}</span>
                  </div>
                </div>
                <div class="row-stats">
                  <span>{org.member_count || 0} members</span>
                  <span>{org.applicant_count || 0} applicants</span>
                </div>
                <div class="row-actions">
                  <a href="/private/{org.slug}/dashboard" class="btn btn-quaternary btn-sm">Dashboard</a>
                  <button class="btn btn-quaternary btn-sm" on:click={() => startEditOrg(org)}>Edit</button>
                  <button class="btn btn-quaternary btn-sm" on:click={() => { transferOrgId = org.id; transferEmail = ''; transferError = ''; }}>Transfer</button>
                  <button class="btn btn-danger btn-sm" on:click={() => { deletingOrg = org; deleteConfirmName = ''; }}>Delete</button>
                </div>
              {/if}
            </div>
          {/each}

          {#if transferOrgId}
            <div class="modal-overlay" on:click={() => transferOrgId = null} on:keydown={(e) => e.key === 'Escape' && (transferOrgId = null)}>
              <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation>
                <h6>Transfer Ownership</h6>
                <p class="muted" style="font-size: 13px;">The new owner must already have an account. The current owner will be demoted to admin.</p>
                <div class="form-row">
                  <label>New Owner Email</label>
                  <input class="form-control" bind:value={transferEmail} placeholder="newowner@example.com" />
                </div>
                {#if transferError}
                  <p class="error-text">{transferError}</p>
                {/if}
                <div class="btn-group">
                  <button class="btn btn-primary btn-sm" on:click={handleTransferOwnership}>Transfer</button>
                  <button class="btn btn-quaternary btn-sm" on:click={() => transferOrgId = null}>Cancel</button>
                </div>
              </div>
            </div>
          {/if}

          {#if deletingOrg}
            <div class="modal-overlay" on:click={() => deletingOrg = null} on:keydown={(e) => e.key === 'Escape' && (deletingOrg = null)}>
              <div class="modal-content modal-danger" on:click|stopPropagation on:keydown|stopPropagation>
                <h6>Delete Organization</h6>
                <p style="font-size: 13px;">This will permanently delete <strong>{deletingOrg.name}</strong> and all associated data:</p>
                <ul style="font-size: 13px; color: #ef4444;">
                  <li>{deletingOrg.member_count || 0} members</li>
                  <li>{deletingOrg.applicant_count || 0} applicants</li>
                </ul>
                <div class="form-row">
                  <label>Type "<strong>{deletingOrg.name}</strong>" to confirm</label>
                  <input class="form-control" bind:value={deleteConfirmName} placeholder={deletingOrg.name} />
                </div>
                <div class="btn-group">
                  <button class="btn btn-danger btn-sm" disabled={deleteConfirmName !== deletingOrg.name} on:click={confirmDeleteOrg}>Delete Forever</button>
                  <button class="btn btn-quaternary btn-sm" on:click={() => deletingOrg = null}>Cancel</button>
                </div>
              </div>
            </div>
          {/if}

        <!-- ==================== USERS TAB ==================== -->
        {:else if activeTab === 'users'}
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

        <!-- ==================== JOBS TAB ==================== -->
        {:else if activeTab === 'jobs'}
          <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div class="filter-bar" style="margin-bottom: 0;">
              <input class="form-control" bind:value={jobOrgFilter} placeholder="Filter by org name..." style="max-width: 250px;" />
              <select class="form-select" bind:value={jobStatusFilter} style="max-width: 150px;">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <span class="muted" style="font-size: 12px;">{filteredJobs.length} postings</span>
            </div>
            <button class="btn btn-primary" on:click={() => showCreateJob = !showCreateJob}>
              {showCreateJob ? 'Cancel' : '+ New Job Posting'}
            </button>
          </div>

          {#if jobCreateSuccess}
            <div class="alert-success">{jobCreateSuccess}</div>
          {/if}

          {#if showCreateJob}
            <div class="form-card">
              <h6>Create Job Posting</h6>
              <div class="form-row">
                <label>Organization</label>
                <select class="form-select" bind:value={newJobOrgId}>
                  <option value="">Select organization...</option>
                  {#each organizations as org}
                    <option value={org.id}>{org.name} (/{org.slug})</option>
                  {/each}
                </select>
              </div>
              <div class="form-row">
                <label>Position Name</label>
                <input class="form-control" bind:value={newJobName} placeholder="e.g. Software Engineer" />
              </div>
              <div class="form-row">
                <label>Description</label>
                <textarea class="form-control" bind:value={newJobDescription} rows="2" placeholder="Brief description of the role"></textarea>
              </div>
              {#if jobCreateError}
                <p class="error-text">{jobCreateError}</p>
              {/if}
              <button class="btn btn-primary" on:click={createJob} disabled={jobCreating}>
                {jobCreating ? 'Creating...' : 'Create Job Posting'}
              </button>
            </div>
          {/if}

          <div class="jobs-table">
            <div class="table-header">
              <span class="col-name">Job Name</span>
              <span class="col-org">Organization</span>
              <span class="col-status">Status</span>
              <span class="col-apps">Applicants</span>
              <span class="col-actions">Actions</span>
            </div>
            {#each filteredJobs as job}
              <div class="table-row">
                <span class="col-name">
                  <span class="row-name">{job.name}</span>
                  {#if job.description}<span class="row-sub">{job.description}</span>{/if}
                </span>
                <span class="col-org">
                  {#if job.org_name}
                    <span class="row-name">{job.org_name}</span>
                    <span class="row-sub">/{job.org_slug}</span>
                  {:else}
                    <span class="muted">No org</span>
                  {/if}
                </span>
                <span class="col-status">
                  <span class="badge" style="background-color: {job.active_flg ? '#ecfdf5' : '#fef2f2'}; color: {job.active_flg ? '#065f46' : '#991b1b'};">
                    {job.active_flg ? 'Active' : 'Inactive'}
                  </span>
                </span>
                <span class="col-apps">{job.applicant_count}</span>
                <span class="col-actions">
                  <button class="btn btn-quaternary btn-sm" on:click={() => toggleJob(job.id, job.active_flg)}>
                    {job.active_flg ? 'Deactivate' : 'Activate'}
                  </button>
                  {#if job.org_slug}
                    <a href="/private/{job.org_slug}/settings/jobs/{job.id}" class="btn btn-quaternary btn-sm">Edit</a>
                  {/if}
                  <button class="btn btn-danger btn-sm" on:click={() => deleteJob(job.id)}>Delete</button>
                </span>
              </div>
            {/each}
            {#if filteredJobs.length === 0}
              <p class="muted" style="padding: 20px;">No job postings found.</p>
            {/if}
          </div>

        <!-- ==================== APPLICANTS TAB ==================== -->
        {:else if activeTab === 'applicants'}
          <div class="filter-bar">
            <input class="form-control" bind:value={appSearch} placeholder="Search by name or email..." style="max-width: 250px;" />
            <input class="form-control" bind:value={appOrgFilter} placeholder="Filter by org..." style="max-width: 180px;" />
            <select class="form-select" bind:value={appStatusFilter} style="max-width: 140px;">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="interview">Interview</option>
              <option value="accepted">Accepted</option>
              <option value="denied">Denied</option>
            </select>
            <span class="muted" style="font-size: 12px;">{filteredApplicants.length} applicants</span>
          </div>

          <!-- Bulk Actions Bar -->
          {#if selectedApplicantIds.size > 0}
            <div class="bulk-bar">
              <span style="font-size: 13px; font-weight: 600;">{selectedApplicantIds.size} selected</span>
              <select class="form-select form-select-sm" bind:value={bulkStatusValue} style="max-width: 140px;">
                <option value="pending">Pending</option>
                <option value="interview">Interview</option>
                <option value="accepted">Accepted</option>
                <option value="denied">Denied</option>
              </select>
              <button class="btn btn-primary btn-sm" on:click={bulkUpdateStatus}>Update Status</button>
              <button class="btn btn-quaternary btn-sm" on:click={exportApplicantsCsv}>Export CSV</button>
              <button class="btn btn-danger btn-sm" on:click={bulkDelete}>Delete</button>
              <button class="btn btn-quaternary btn-sm" on:click={() => selectedApplicantIds = new Set()}>Clear</button>
            </div>
          {/if}

          {#if appActionError}<p class="error-text">{appActionError}</p>{/if}
          {#if appActionSuccess}<div class="alert-success">{appActionSuccess}</div>{/if}

          <div class="jobs-table">
            <div class="table-header app-table-header">
              <span class="col-check">
                <input type="checkbox" checked={allSelected} on:change={toggleAllApplicants} />
              </span>
              <span class="col-name">Name</span>
              <span class="col-org">Organization</span>
              <span class="col-job">Job</span>
              <span class="col-status">Status</span>
              <span class="col-date">Submitted</span>
            </div>
            {#each filteredApplicants as app}
              <div class="table-row app-table-row" class:row-selected={selectedApplicantIds.has(app.id)}>
                <span class="col-check">
                  <input type="checkbox" checked={selectedApplicantIds.has(app.id)} on:change={() => toggleApplicantSelect(app.id)} />
                </span>
                <span class="col-name">
                  <button class="app-name-btn" on:click={() => expandedApplicantId = expandedApplicantId === app.id ? null : app.id}>
                    <span class="row-name">{app.name}</span>
                    <span class="row-sub">{app.email}</span>
                  </button>
                </span>
                <span class="col-org">
                  {#if app.org_name}
                    <span class="row-sub">{app.org_name}</span>
                  {:else}
                    <span class="muted">-</span>
                  {/if}
                </span>
                <span class="col-job">
                  <span class="row-sub">{app.job_name || '-'}</span>
                </span>
                <span class="col-status">
                  <span class="badge" style="background-color: {statusBg(app.status)}; color: {statusColor(app.status)};">{app.status}</span>
                </span>
                <span class="col-date">
                  <span class="row-sub">{new Date(app.created_at).toLocaleDateString()}</span>
                </span>
              </div>
              {#if expandedApplicantId === app.id}
                <div class="app-detail-panel">
                  <div class="app-detail-grid">
                    {#if app.recruitInfo}
                      {#each Object.entries(app.recruitInfo) as [key, value]}
                        <div class="app-detail-field">
                          <span class="app-detail-label">{key}</span>
                          <span class="app-detail-value">{value}</span>
                        </div>
                      {/each}
                    {:else}
                      <p class="muted">No application data available.</p>
                    {/if}
                  </div>
                  {#if app.org_slug}
                    <a href="/private/{app.org_slug}/review/candidate?id={app.id}" class="btn btn-quaternary btn-sm" style="margin-top: 10px;">
                      View in Dashboard
                    </a>
                  {/if}
                </div>
              {/if}
            {/each}
            {#if filteredApplicants.length === 0}
              <p class="muted" style="padding: 20px;">No applicants found.</p>
            {/if}
          </div>

          {#if selectedApplicantIds.size === 0}
            <div style="margin-top: 12px;">
              <button class="btn btn-quaternary btn-sm" on:click={exportApplicantsCsv}>Export All as CSV</button>
            </div>
          {/if}

        <!-- ==================== SCHEDULING TAB ==================== -->
        {:else if activeTab === 'scheduling'}
          <div class="form-card">
            <h6>Scheduling Configuration</h6>

            <!-- Org selector -->
            <div class="form-row">
              <label>Organization</label>
              <select class="form-select" bind:value={schedOrgId} on:change={onSchedOrgChange}>
                <option value={null}>Select organization...</option>
                {#each organizations as org}
                  <option value={org.id}>{org.name} (/{org.slug})</option>
                {/each}
              </select>
            </div>

            <!-- Job selector -->
            {#if schedOrgId}
              <div class="form-row">
                <label>Job Posting (optional — leave blank for all)</label>
                <select class="form-select" bind:value={schedJobId}>
                  <option value={null}>All jobs</option>
                  {#each schedJobs as job}
                    <option value={job.id}>{job.name}</option>
                  {/each}
                </select>
              </div>
            {/if}

            <!-- Algorithm picker -->
            {#if schedOrgId}
              <div class="form-row">
                <label>Algorithm</label>
                <div class="algo-cards">
                  {#each algorithms as algo}
                    <button
                      class="algo-card"
                      class:algo-selected={schedAlgorithmId === algo.id}
                      on:click={() => schedAlgorithmId = algo.id}
                    >
                      <span class="algo-name">{algo.name}</span>
                      <span class="algo-desc">{algo.description}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Config form -->
            {#if schedOrgId}
              <div class="config-grid">
                <div class="form-row">
                  <label>Slot Duration (minutes)</label>
                  <input type="number" class="form-control" bind:value={schedConfig.slotDurationMinutes} min="10" max="180" />
                </div>
                <div class="form-row">
                  <label>Break Between (minutes)</label>
                  <input type="number" class="form-control" bind:value={schedConfig.breakBetweenMinutes} min="0" max="60" />
                </div>
                <div class="form-row">
                  <label>Max Interviews per Interviewer (0 = unlimited)</label>
                  <input type="number" class="form-control" bind:value={schedConfig.maxInterviewsPerInterviewer} min="0" />
                </div>
                <div class="form-row">
                  <label>Interview Type</label>
                  <select class="form-select" bind:value={schedConfig.interviewType}>
                    <option value="individual">Individual</option>
                    <option value="group">Group</option>
                  </select>
                </div>
                <div class="form-row">
                  <label>Location</label>
                  <input class="form-control" bind:value={schedConfig.location} placeholder="e.g. Room 101, Zoom, etc." />
                </div>
              </div>
            {/if}
          </div>

          <!-- Actions -->
          {#if schedOrgId}
            <div class="sched-actions">
              <button class="btn btn-primary" on:click={runPreview} disabled={schedPreviewing}>
                {schedPreviewing ? 'Running...' : 'Preview Schedule'}
              </button>
              {#if schedPreview && schedPreview.interviews.length > 0}
                <button class="btn btn-primary" on:click={applySchedule} disabled={schedApplying}>
                  {schedApplying ? 'Applying...' : `Apply ${schedPreview.interviews.length} Interviews`}
                </button>
              {/if}
              <button class="btn btn-danger btn-sm" on:click={clearAutoInterviews} disabled={schedClearing}>
                {schedClearing ? 'Clearing...' : 'Clear Auto-Scheduled'}
              </button>
            </div>
          {/if}

          {#if schedError}<p class="error-text">{schedError}</p>{/if}
          {#if schedSuccess}<div class="alert-success">{schedSuccess}</div>{/if}

          <!-- Preview Results -->
          {#if schedPreview}
            <div class="form-card" style="margin-top: 16px;">
              <h6>Preview Results</h6>

              {#if schedPreview.warnings.length > 0}
                <div class="alert-error" style="margin-bottom: 12px;">
                  {#each schedPreview.warnings as w}
                    <p style="margin: 2px 0;">{w}</p>
                  {/each}
                </div>
              {/if}

              {#if schedPreview.interviews.length > 0}
                <div class="jobs-table">
                  <div class="table-header sched-table-header">
                    <span>Applicant</span>
                    <span>Interviewer</span>
                    <span>Date</span>
                    <span>Time</span>
                    <span>Location</span>
                  </div>
                  {#each schedPreview.interviews as iv}
                    <div class="table-row sched-table-row">
                      <span class="row-name">{iv.applicant}</span>
                      <span class="row-name">{iv.interviewer}</span>
                      <span class="row-sub">{iv.startTime.substring(0, 10)}</span>
                      <span class="row-sub">{iv.startTime.substring(11, 16)} - {iv.endTime.substring(11, 16)}</span>
                      <span class="row-sub">{iv.location || '-'}</span>
                    </div>
                  {/each}
                </div>
                <p class="muted" style="margin-top: 8px; font-size: 12px;">{schedPreview.interviews.length} interviews proposed</p>
              {:else}
                <p class="muted">No interviews could be scheduled.</p>
              {/if}

              {#if schedPreview.unmatched.length > 0}
                <h6 style="margin-top: 16px;">Unmatched Applicants ({schedPreview.unmatched.length})</h6>
                <div style="font-size: 13px; color: #991b1b;">
                  {#each schedPreview.unmatched as email}
                    <p style="margin: 2px 0;">{email}</p>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

        <!-- ==================== SETTINGS TAB ==================== -->
        {:else if activeTab === 'settings'}
          <div class="form-card">
            <h6>Platform Branding</h6>
            <div class="form-row">
              <label>Platform Name</label>
              <input class="form-control" bind:value={editSettings.platform_name} placeholder="LUMA" />
            </div>
            <div class="form-row color-row">
              <div>
                <label>Default Primary Color</label>
                <input type="color" bind:value={editSettings.default_primary_color} />
              </div>
              <div>
                <label>Default Secondary Color</label>
                <input type="color" bind:value={editSettings.default_secondary_color} />
              </div>
            </div>
          </div>

          <div class="form-card">
            <h6>Maintenance Mode</h6>
            <p class="muted" style="font-size: 13px; margin-bottom: 12px;">
              When enabled, all public application forms will show a maintenance message instead.
            </p>
            <div class="maintenance-toggle">
              <label class="toggle-label">
                <input type="checkbox" bind:checked={editSettings.maintenance_mode} />
                <span class="toggle-text">{editSettings.maintenance_mode ? 'Maintenance Mode ON' : 'Maintenance Mode OFF'}</span>
              </label>
            </div>
            {#if editSettings.maintenance_mode}
              <div class="form-row" style="margin-top: 12px;">
                <label>Maintenance Message</label>
                <input class="form-control" bind:value={editSettings.maintenance_message}
                  placeholder="Applications are currently closed. Please check back later." />
              </div>
            {/if}
          </div>

          {#if settingsError}<p class="error-text">{settingsError}</p>{/if}
          {#if settingsSuccess}<div class="alert-success">{settingsSuccess}</div>{/if}

          <button class="btn btn-primary" on:click={saveSettings} disabled={settingsLoading}>
            {settingsLoading ? 'Saving...' : 'Save Settings'}
          </button>

        <!-- ==================== ADMINS TAB ==================== -->
        {:else if activeTab === 'admins'}
          <div class="form-card" style="margin-bottom: 20px;">
            <h6>Add Platform Admin</h6>
            <div class="add-admin-form">
              <input class="form-control" bind:value={newAdminEmail} placeholder="user@example.com"
                on:keydown={(e) => e.key === 'Enter' && addAdmin()} />
              <button class="btn btn-primary btn-sm" on:click={addAdmin}>Add Admin</button>
            </div>
            {#if adminError}<p class="error-text">{adminError}</p>{/if}
            {#if adminSuccess}<div class="alert-success">{adminSuccess}</div>{/if}
          </div>

          <h5 class="section-title">Current Platform Admins</h5>
          {#each platformAdmins as admin}
            <div class="list-row">
              <div class="row-left">
                <i class="fi fi-br-shield" style="color: #ffc800;"></i>
                <div>
                  <span class="row-name">{admin.email}</span>
                  <span class="row-sub">Since {new Date(admin.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="row-actions">
                <button class="btn btn-danger btn-sm" on:click={() => removeAdmin(admin)}>Remove</button>
              </div>
            </div>
          {/each}
          {#if platformAdmins.length === 0}
            <p class="muted">No platform admins found.</p>
          {/if}
        {/if}
      </div>
    </main>
  </div>
{/if}

<style lang="scss">
  @use '../../styles/col.scss' as *;

  /* ==================== Login Screen ==================== */
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
  }
  .input-dark:focus, .input-dark:active {
    background-color: $dark-primary;
    box-shadow: none;
    border-color: $yellow-primary;
    color: white;
  }

  /* ==================== Layout ==================== */
  .admin-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
    background-color: $light-secondary;
  }

  /* ==================== Sidebar ==================== */
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

  /* ==================== Main Content ==================== */
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

  /* ==================== Stats Grid ==================== */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 25px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.06);
  }
  .stat-number { font-size: 28px; font-weight: 900; color: $dark-primary; }
  .stat-label { font-size: 11px; font-weight: 600; color: $light-tertiary; margin-top: 4px; }

  /* ==================== Status Bars (Overview) ==================== */
  .status-bars {
    background: white;
    border-radius: 8px;
    padding: 16px 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05);
    margin-bottom: 20px;
  }
  .status-bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }
  .status-bar-label {
    width: 80px;
    font-size: 12px;
    font-weight: 700;
    text-transform: capitalize;
  }
  .status-bar-track {
    flex: 1;
    height: 18px;
    background-color: $light-secondary;
    border-radius: 9px;
    overflow: hidden;
  }
  .status-bar-fill {
    height: 100%;
    border-radius: 9px;
    transition: width 0.3s;
    min-width: 4px;
  }
  .status-bar-count {
    width: 40px;
    text-align: right;
    font-size: 13px;
    font-weight: 700;
    color: $dark-primary;
  }

  /* ==================== Bar Chart (Overview) ==================== */
  .chart-container {
    background: white;
    border-radius: 8px;
    padding: 16px 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05);
    margin-bottom: 20px;
  }
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 120px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }
  .bar {
    width: 100%;
    background-color: $yellow-primary;
    border-radius: 3px 3px 0 0;
    min-height: 2px;
    transition: height 0.3s;
  }
  .bar-label {
    font-size: 9px;
    color: $light-tertiary;
    margin-top: 4px;
  }

  /* ==================== Activity Grid (Overview) ==================== */
  .activity-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 10px;
  }
  .activity-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
  }

  /* ==================== Shared Components ==================== */
  .section-title { margin: 20px 0 12px; }
  .muted { color: $light-tertiary; }
  .error-text { color: #ef4444; font-size: 13px; margin: 4px 0; }
  .alert-success {
    background-color: #ecfdf5;
    color: #065f46;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    margin: 8px 0;
  }
  .alert-error {
    background-color: #fef2f2;
    color: #991b1b;
    padding: 14px 18px;
    border-radius: 8px;
    font-size: 13px;
    margin: 8px 0;
    border: 1px solid #fecaca;
  }

  .list-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.05);
    margin-bottom: 6px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .row-left { display: flex; align-items: center; gap: 10px; }
  .row-name { font-weight: 700; font-size: 13px; display: block; }
  .row-sub { font-size: 11px; color: $light-tertiary; font-family: monospace; display: block; }
  .row-stats { display: flex; gap: 16px; font-size: 12px; color: $light-tertiary; }
  .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .org-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* ==================== Form Components ==================== */
  .form-card {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.06);
    margin-bottom: 16px;
    h6 { margin-bottom: 14px; }
  }
  .form-row {
    margin-bottom: 12px;
    label { display: block; font-size: 12px; font-weight: 600; color: $light-tertiary; margin-bottom: 4px; }
  }
  .color-row { display: flex; gap: 20px; }
  .edit-form { width: 100%; padding: 4px 0; }
  .btn-group { display: flex; gap: 8px; margin-top: 8px; }
  .btn-sm { font-size: 11px !important; padding: 4px 10px !important; }
  .btn-danger {
    background-color: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;
    &:hover { background-color: #dc2626; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .search-bar, .filter-bar { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }

  /* ==================== Modal ==================== */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(0,0,0,0.5);
    display: flex; justify-content: center; align-items: center; z-index: 1000;
  }
  .modal-content {
    background-color: white; border-radius: 10px; padding: 24px;
    max-width: 420px; width: 90%;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    h6 { margin-bottom: 10px; }
  }
  .modal-danger { border-top: 3px solid #ef4444; }

  /* ==================== Users Tab ==================== */
  .users-layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; min-height: 500px; }
  .user-list {
    background-color: white; border-radius: 8px; padding: 12px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.05); overflow-y: auto; max-height: 70vh;
  }
  .user-row {
    display: flex; flex-direction: column; align-items: flex-start; width: 100%;
    padding: 10px 12px; border: none; background: none; cursor: pointer;
    border-radius: 6px; text-align: left; transition: background 0.1s;
    &:hover { background-color: $light-secondary; }
    &.selected { background-color: rgba(255,200,0,0.1); border-left: 3px solid $yellow-primary; }
  }
  .user-detail { min-height: 200px; }
  .detail-card {
    background-color: white; border-radius: 8px; padding: 20px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.05);
    &.empty { display: flex; align-items: center; justify-content: center; min-height: 200px; }
  }
  .detail-meta {
    display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: $light-tertiary; margin-top: 8px;
    code { font-size: 10px; background-color: $light-secondary; padding: 1px 4px; border-radius: 3px; }
  }
  .membership-row {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid #f0f0f0;
  }
  .add-to-org-form { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .add-admin-form { display: flex; gap: 8px; align-items: center; }

  /* ==================== Jobs Table ==================== */
  .jobs-table {
    background-color: white; border-radius: 8px;
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.05); overflow: hidden;
  }
  .table-header, .table-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 100px 80px 1fr;
    align-items: center; padding: 10px 16px; gap: 8px;
  }
  .table-header {
    font-size: 11px; font-weight: 700; color: $light-tertiary;
    text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 1px solid #e5e7eb; background-color: #fafbfc;
  }
  .table-row {
    border-bottom: 1px solid #f0f0f0; font-size: 13px;
    &:last-child { border-bottom: none; }
  }
  .col-actions { display: flex; gap: 4px; flex-wrap: wrap; }

  /* ==================== Applicants Table ==================== */
  .app-table-header, .app-table-row {
    grid-template-columns: 40px 2fr 1.2fr 1.2fr 100px 90px !important;
  }
  .col-check { display: flex; align-items: center; justify-content: center; }
  .row-selected { background-color: rgba(255,200,0,0.04); }
  .app-name-btn {
    background: none; border: none; cursor: pointer; text-align: left; padding: 0;
    &:hover .row-name { color: $yellow-secondary; }
  }
  .bulk-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; background-color: #fffbeb;
    border: 1px solid #fde68a; border-radius: 8px; margin-bottom: 12px;
  }
  .app-detail-panel {
    padding: 12px 16px 16px 56px;
    background-color: #fafbfc;
    border-bottom: 1px solid #e5e7eb;
  }
  .app-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
  }
  .app-detail-field {
    padding: 6px 0;
  }
  .app-detail-label {
    font-size: 11px; font-weight: 600; color: $light-tertiary; text-transform: capitalize;
    display: block; margin-bottom: 2px;
  }
  .app-detail-value {
    font-size: 13px; color: $dark-primary;
  }

  /* ==================== Settings Tab ==================== */
  .maintenance-toggle {
    display: flex; align-items: center;
  }
  .toggle-label {
    display: flex; align-items: center; gap: 10px; cursor: pointer;
    input[type="checkbox"] { width: 18px; height: 18px; accent-color: $yellow-primary; }
  }
  .toggle-text {
    font-size: 13px; font-weight: 600;
  }

  /* ==================== Badges ==================== */
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600;
  }

  /* ==================== Scheduling Tab ==================== */
  .algo-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 6px;
  }
  .algo-card {
    display: flex;
    flex-direction: column;
    padding: 14px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
    &:hover { border-color: #ffc800; }
  }
  .algo-selected {
    border-color: #ffc800 !important;
    background-color: rgba(255, 200, 0, 0.05);
  }
  .algo-name {
    font-weight: 700;
    font-size: 13px;
    margin-bottom: 4px;
  }
  .algo-desc {
    font-size: 11px;
    color: $light-tertiary;
    line-height: 1.4;
  }
  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    margin-top: 8px;
  }
  .sched-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 16px 0;
    flex-wrap: wrap;
  }
  .sched-table-header, .sched-table-row {
    grid-template-columns: 2fr 2fr 1fr 1fr 1fr !important;
  }

  /* ==================== Responsive ==================== */
  @media (max-width: 768px) {
    .admin-layout { grid-template-columns: 1fr; }
    .admin-sidebar { display: none; }
    .users-layout { grid-template-columns: 1fr; }
    .table-header, .table-row { grid-template-columns: 1fr 1fr auto; }
    .col-org, .col-apps, .col-job, .col-date { display: none; }
    .activity-grid { grid-template-columns: 1fr; }
    .app-table-header, .app-table-row { grid-template-columns: 40px 2fr 100px !important; }
  }
</style>
