<script lang="ts">
  import type { AdminAnalytics } from '$lib/types';

  let { analytics, analyticsLoaded, analyticsError, onretryAnalytics = () => {} }: {
    analytics: AdminAnalytics | null;
    analyticsLoaded: boolean;
    analyticsError: string;
    onretryAnalytics?: () => void;
  } = $props();

  const statusCounts = $derived(analytics?.applicants_by_status || {});
  const maxStatusCount = $derived(Math.max(...Object.values(statusCounts as Record<string, number>).map(Number), 1));
  const maxDayCount = $derived(analytics?.applicants_last_30_days
    ? Math.max(...analytics.applicants_last_30_days.map(d => d.count), 1)
    : 1);

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
</script>

{#if analyticsError}
  <div class="alert-error">
    <p><strong>Could not load analytics:</strong> {analyticsError}</p>
    <button class="btn btn-primary btn-sm" style="margin-top: 8px;" onclick={onretryAnalytics}>Retry</button>
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

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

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

  .status-bars {
    background: white; border-radius: 8px; padding: 16px 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05); margin-bottom: 20px;
  }
  .status-bar-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .status-bar-label { width: 80px; font-size: 12px; font-weight: 700; text-transform: capitalize; }
  .status-bar-track { flex: 1; height: 18px; background-color: $light-secondary; border-radius: 9px; overflow: hidden; }
  .status-bar-fill { height: 100%; border-radius: 9px; transition: width 0.3s; min-width: 4px; }
  .status-bar-count { width: 40px; text-align: right; font-size: 13px; font-weight: 700; color: $dark-primary; }

  .chart-container {
    background: white; border-radius: 8px; padding: 16px 20px;
    box-shadow: 0 0 12px rgba(0,0,0,0.05); margin-bottom: 20px;
  }
  .bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
  .bar { width: 100%; background-color: $yellow-primary; border-radius: 3px 3px 0 0; min-height: 2px; }
  .bar-label { font-size: 9px; color: $light-tertiary; margin-top: 2px; }

  .list-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; background: white; border-radius: 8px;
    margin-bottom: 6px; box-shadow: 0 0 8px rgba(0,0,0,0.04);
  }
  .row-left { display: flex; align-items: center; gap: 12px; }
  .row-stats { display: flex; gap: 12px; font-size: 12px; color: $light-tertiary; }
  .org-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .row-name { display: block; font-size: 13px; font-weight: 600; color: $dark-primary; }
  .row-sub { display: block; font-size: 11px; color: $light-tertiary; }

  .activity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
  .activity-row {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 8px 0; border-bottom: 1px solid #f1f5f9;
    &:last-child { border-bottom: none; }
  }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; }

  .section-title { font-size: 13px; font-weight: 700; color: $light-tertiary; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 10px; }
  .muted { color: $light-tertiary; font-size: 13px; }
  .alert-error { background: #fef2f2; color: #991b1b; padding: 12px 16px; border-radius: 8px; }
  .btn-sm { font-size: 11px !important; padding: 4px 12px !important; }
</style>
