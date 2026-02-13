<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import type { Applicant } from '$lib/types';

  let applicants: Applicant[] = [];
  let searchQuery = '';
  let statusFilter = 'all';
  let orgId: number | null = null;

  $: slug = $page.params.slug;

  $: filteredApplicants = applicants
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!orgData) return;
    orgId = orgData.id;

    const { data } = await supabase
      .from('applicants')
      .select('*')
      .eq('org_id', orgData.id)
      .order('created_at', { ascending: false });

    applicants = data || [];
  });

  const navigateToReview = (id: number) => {
    goto(`/private/${slug}/review/candidate?id=${id}`);
  };

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return '#878fa1';
      case 'interview': return '#3b82f6';
      case 'accepted': return '#22c55e';
      case 'denied': return '#ef4444';
      default: return '#878fa1';
    }
  }
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Review Applications</h4>

    <div class="filter-bar">
      <input
        type="text"
        placeholder="Search by name..."
        bind:value={searchQuery}
        class="form-control"
        style="max-width: 300px;"
      />
      <select bind:value={statusFilter} class="form-control" style="max-width: 180px;">
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="interview">Interview</option>
        <option value="accepted">Accepted</option>
        <option value="denied">Denied</option>
      </select>
      <span class="result-count">{filteredApplicants.length} applicants</span>
    </div>

    <div class="applicant-grid">
      {#each filteredApplicants as applicant}
        <div class="applicant-card" on:click={() => navigateToReview(applicant.id)} on:keydown={() => {}} role="button" tabindex="0">
          <div class="applicant-card-top">
            <span class="applicant-name">{applicant.name}</span>
            <span class="status-badge" style="background-color: {getStatusColor(applicant.status)};">
              {applicant.status}
            </span>
          </div>
          <p class="applicant-meta">{applicant.email}</p>
          <p class="applicant-meta">{new Date(applicant.created_at).toLocaleDateString()}</p>
        </div>
      {/each}

      {#if filteredApplicants.length === 0}
        <p style="color: #878fa1; padding: 20px;">No applicants found.</p>
      {/if}
    </div>
  </div>

  <Navbar />
  <Sidebar currentStep={1} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .filter-bar {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .result-count {
    font-size: 13px;
    color: $light-tertiary;
    font-weight: 500;
  }
  .applicant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }
  .applicant-card {
    background-color: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .applicant-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }
  .applicant-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .applicant-name {
    font-weight: 700;
    font-size: 14px;
    color: $dark-primary;
  }
  .status-badge {
    font-size: 10px;
    font-weight: 700;
    color: white;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .applicant-meta {
    font-size: 12px;
    color: $light-tertiary;
    margin: 2px 0;
  }
</style>
