<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase, isPlatformAdmin } from '$lib/utils/supabase';
  import type { Organization, OrgMember } from '$lib/types';

  let { children } = $props();

  let org: Organization | null = $state(null);
  let membership: OrgMember | null = $state(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    const slug = $page.params.slug;

    try {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('slug', slug)
        .single();

      if (orgError || !orgData) {
        error = `Organization "${slug}" not found.`;
        loading = false;
        return;
      }
      org = orgData;

      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        goto('/auth');
        return;
      }

      const { data: memberData, error: memberError } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (memberError) {
        error = 'Failed to verify organization membership.';
        loading = false;
        return;
      }

      if (!memberData) {
        // Allow platform admins to access any org
        const platformAdmin = await isPlatformAdmin();
        if (!platformAdmin) {
          error = 'You are not a member of this organization.';
          loading = false;
          return;
        }
        // Platform admins get owner-level access
        membership = { id: 0, created_at: '', org_id: orgData.id, user_id: userData.user.id, role: 'owner' };
      } else {
        membership = memberData;
      }
      loading = false;
    } catch (err) {
      console.error('Layout error:', err);
      error = 'Something went wrong loading this page.';
      loading = false;
    }
  });
</script>

{#if loading}
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f6fc;">
    <p>Loading...</p>
  </div>
{:else if error}
  <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f3f6fc; gap: 15px;">
    <p style="color: #ef4444; font-weight: 600;">{error}</p>
    <a href="/private" style="color: #3b82f6; text-decoration: underline;">Back to organizations</a>
  </div>
{:else}
  {@render children()}
{/if}
