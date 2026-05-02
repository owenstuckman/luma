<script lang="ts">
  import { adminBulkUpdateStatus, adminBulkDeleteApplicants } from '$lib/utils/supabase';
  import type { AdminApplicant } from '$lib/types';

  let { applicants, onreload = () => {} }: {
    applicants: AdminApplicant[];
    onreload?: () => void;
  } = $props();

  let appSearch = '';
  let appOrgFilter = '';
  let appStatusFilter: 'all' | 'pending' | 'interview' | 'accepted' | 'denied' = 'all';
  let selectedApplicantIds: Set<number> = new Set();
  let bulkStatusValue = 'pending';
  let appActionError = '';
  let appActionSuccess = '';
  let expandedApplicantId: number | null = null;

  $: filteredApplicants = applicants.filter(a => {
    const searchMatch = !appSearch ||
      a.name?.toLowerCase().includes(appSearch.toLowerCase()) ||
      a.email?.toLowerCase().includes(appSearch.toLowerCase());
    const orgMatch = !appOrgFilter || a.org_name?.toLowerCase().includes(appOrgFilter.toLowerCase());
    const statusMatch = appStatusFilter === 'all' || a.status === appStatusFilter;
    return searchMatch && orgMatch && statusMatch;
  });

  $: allSelected = filteredApplicants.length > 0 && filteredApplicants.every(a => selectedApplicantIds.has(a.id));

  function toggleApplicantSelect(id: number) {
    if (selectedApplicantIds.has(id)) selectedApplicantIds.delete(id);
    else selectedApplicantIds.add(id);
    selectedApplicantIds = new Set(selectedApplicantIds);
  }

  function toggleAllApplicants() {
    if (allSelected) selectedApplicantIds = new Set();
    else selectedApplicantIds = new Set(filteredApplicants.map(a => a.id));
  }

  async function bulkUpdateStatus() {
    if (selectedApplicantIds.size === 0) return;
    appActionError = ''; appActionSuccess = '';
    try {
      await adminBulkUpdateStatus([...selectedApplicantIds], bulkStatusValue);
      appActionSuccess = `Updated ${selectedApplicantIds.size} applicants to "${bulkStatusValue}".`;
      selectedApplicantIds = new Set();
      onreload();
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
      onreload();
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

  function statusColor(status: string): string {
    switch (status) {
      case 'accepted': return '#065f46'; case 'interview': return '#1e40af';
      case 'denied': return '#991b1b'; default: return '#92400e';
    }
  }
  function statusBg(status: string): string {
    switch (status) {
      case 'accepted': return '#ecfdf5'; case 'interview': return '#eff6ff';
      case 'denied': return '#fef2f2'; default: return '#fffbeb';
    }
  }
</script>

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
    <span class="col-check"><input type="checkbox" checked={allSelected} on:change={toggleAllApplicants} /></span>
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
        {#if app.org_name}<span class="row-sub">{app.org_name}</span>
        {:else}<span class="muted">-</span>{/if}
      </span>
      <span class="col-job"><span class="row-sub">{app.job_name || '-'}</span></span>
      <span class="col-status">
        <span class="badge" style="background-color: {statusBg(app.status)}; color: {statusColor(app.status)};">{app.status}</span>
      </span>
      <span class="col-date"><span class="row-sub">{new Date(app.created_at).toLocaleDateString()}</span></span>
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

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .filter-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .bulk-bar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 14px; background: #fffbeb; border-radius: 6px;
    border: 1px solid #fcd34d; margin-bottom: 12px;
  }
  .jobs-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 12px rgba(0,0,0,0.05); }
  .app-table-header, .app-table-row {
    display: grid;
    grid-template-columns: 36px 2fr 1fr 1fr 100px 100px;
    align-items: center;
  }
  .table-header {
    padding: 10px 16px; background: $light-secondary;
    font-size: 11px; font-weight: 700; color: $light-tertiary; text-transform: uppercase;
  }
  .table-row {
    padding: 10px 16px; border-bottom: 1px solid #f1f5f9;
    &:last-child { border-bottom: none; }
    &.row-selected { background-color: #fefce8; }
  }
  .app-name-btn {
    background: none; border: none; cursor: pointer; text-align: left; padding: 0;
  }
  .app-detail-panel {
    padding: 12px 16px 16px 52px; background: #fafbfc;
    border-bottom: 1px solid #f1f5f9;
  }
  .app-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .app-detail-field { display: flex; flex-direction: column; gap: 2px; }
  .app-detail-label { font-size: 10px; font-weight: 700; color: $light-tertiary; text-transform: uppercase; }
  .app-detail-value { font-size: 12px; color: $dark-primary; word-break: break-word; }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .error-text { color: #ef4444; font-size: 12px; margin: 4px 0; }
  .alert-success { background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
  .btn-danger { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; &:hover { background-color: #fee2e2; } }
</style>
