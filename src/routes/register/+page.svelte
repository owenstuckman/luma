<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/utils/supabase';

  let orgName = '';
  let orgSlug = '';
  let error = '';
  let submitting = false;
  let isAuthenticated = false;
  let loading = true;

  $: orgSlug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  onMount(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      goto('/auth');
      return;
    }
    isAuthenticated = true;
    loading = false;
  });

  async function handleCreate() {
    if (!orgName.trim() || !orgSlug.trim()) {
      error = 'Please enter an organization name.';
      return;
    }
    submitting = true;
    error = '';

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      error = 'Not authenticated.';
      submitting = false;
      return;
    }

    // Create org
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName, slug: orgSlug, owner_id: userData.user.id })
      .select()
      .single();

    if (orgError) {
      error = orgError.message;
      submitting = false;
      return;
    }

    // Add creator as owner
    const { error: memberError } = await supabase
      .from('org_members')
      .insert({ org_id: orgData.id, user_id: userData.user.id, role: 'owner' });

    if (memberError) {
      error = memberError.message;
      submitting = false;
      return;
    }

    goto(`/private/${orgSlug}/dashboard`);
  }
</script>

{#if loading}
  <div class="register-screen">
    <div class="register-card">
      <h2 style="color: white;">Loading...</h2>
    </div>
  </div>
{:else}
  <div class="register-screen">
    <div class="register-card">
      <h2 style="color: white;">Create Organization</h2>
      <p style="color: #878fa1; font-size: 13px; margin-bottom: 15px;">
        Set up your organization to start receiving applications.
      </p>

      <div class="field">
        <label>Organization Name</label>
        <input
          type="text"
          class="form-control input-dark"
          placeholder="Acme Recruiting"
          bind:value={orgName}
        />
      </div>

      <div class="field">
        <label>URL Slug</label>
        <div class="slug-preview">
          <span class="slug-prefix">/apply/</span>
          <input
            type="text"
            class="form-control input-dark"
            bind:value={orgSlug}
            style="font-family: monospace;"
          />
        </div>
      </div>

      {#if error}
        <p style="color: #ef4444; font-size: 13px; margin-top: 5px;">{error}</p>
      {/if}

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <a href="/private">
          <button type="button" class="btn btn-primary">Back</button>
        </a>
        <button class="btn btn-primary" on:click={handleCreate} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use '../../styles/col.scss' as *;

  .register-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
  }
  .register-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: $dark-primary;
    border-radius: 10px;
    padding: 40px;
    width: 400px;
  }
  .field {
    width: 100%;
    margin-bottom: 12px;
  }
  .field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: $light-tertiary;
    margin-bottom: 4px;
  }
  .slug-preview {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .slug-prefix {
    color: $light-tertiary;
    font-size: 13px;
    font-family: monospace;
    white-space: nowrap;
  }
  .input-dark {
    background-color: $dark-primary;
    border-color: $light-tertiary;
    color: white;
  }
  .input-dark:focus, .input-dark:active {
    background-color: $dark-primary;
    box-shadow: none;
    border-color: $yellow-primary;
    color: white;
  }
</style>
