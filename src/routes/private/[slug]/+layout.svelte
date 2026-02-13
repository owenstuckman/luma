<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';
  import type { Organization, OrgMember } from '$lib/types';

  let { children } = $props();

  let org: Organization | null = null;
  let membership: OrgMember | null = null;
  let loading = true;

  onMount(async () => {
    const slug = $page.params.slug;

    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (!orgData) {
      goto('/private');
      return;
    }
    org = orgData;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      goto('/auth');
      return;
    }

    const { data: memberData } = await supabase
      .from('org_members')
      .select('*')
      .eq('org_id', orgData.id)
      .eq('user_id', userData.user.id)
      .single();

    if (!memberData) {
      goto('/private');
      return;
    }

    membership = memberData;
    loading = false;
  });
</script>

{#if loading}
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f6fc;">
    <p>Loading...</p>
  </div>
{:else}
  {@render children()}
{/if}
