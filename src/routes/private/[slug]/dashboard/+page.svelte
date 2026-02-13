<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/utils/supabase';
  import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
  import Navbar from '$lib/components/recruiter/Navbar.svelte';
  import type { Organization } from '$lib/types';

  let org: Organization | null = null;
  let userEmail = '';
  let applicantCount = 0;
  let pendingCount = 0;
  let interviewCount = 0;
  let acceptedCount = 0;

  $: slug = $page.params.slug;

  onMount(async () => {
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();
    org = orgData;

    const { data: userData } = await supabase.auth.getUser();
    userEmail = userData?.user?.email || '';

    if (org) {
      const { count: total } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id);
      applicantCount = total || 0;

      const { count: pending } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'pending');
      pendingCount = pending || 0;

      const { count: interviews } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'interview');
      interviewCount = interviews || 0;

      const { count: accepted } = await supabase
        .from('applicants')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'accepted');
      acceptedCount = accepted || 0;
    }
  });
</script>

<div class="layout">
  <div class="content-left">
    <h4 style="text-align: left;">Hello, {userEmail}</h4>
    <p>Welcome to the {org?.name || ''} recruiter dashboard.</p>

    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-number">{applicantCount}</span>
        <span class="stat-label">Total Applicants</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">{pendingCount}</span>
        <span class="stat-label">Pending Review</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">{interviewCount}</span>
        <span class="stat-label">In Interview</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">{acceptedCount}</span>
        <span class="stat-label">Accepted</span>
      </div>
    </div>

    <div style="margin-top: 30px;">
      <h5>Quick Links</h5>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <a href="/private/{slug}/review" class="btn btn-tertiary">Review Applicants</a>
        <a href="/private/{slug}/schedule/full" class="btn btn-tertiary">View Schedule</a>
        <a href="/private/{slug}/settings" class="btn btn-tertiary">Settings</a>
      </div>
    </div>
  </div>

  <Navbar />
  <Sidebar currentStep={0} />
</div>

<style lang="scss">
  @use '../../../../styles/col.scss' as *;

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-top: 20px;
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
</style>
