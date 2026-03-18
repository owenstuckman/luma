<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/utils/supabase';
  import type { Organization } from '$lib/types';

  let organizations: Organization[] = [];
  let loading = true;

  onMount(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('name');

    organizations = (data || []) as Organization[];
    loading = false;
  });
</script>

<div class="login-screen">
  <div class="login-left hide-on-small">
    <img src="/images/ui/logo.png" alt="LUMA logo" class="logo-large" style="margin-bottom: 15px;">
    <h1>Welcome!</h1>
    <p style="font-weight: 600">LUMA is an open-source applicant tracking system that streamlines your recruiting experience.</p>
  </div>
  <div class="login-right widen-on-small">
    <div class="login-top-right">
      <h2>Get Started</h2>

      {#if loading}
        <p style="color: white;">Loading...</p>
      {:else if organizations.length > 0}
        <div class="org-list">
          {#each organizations as org}
            <a href="/apply/{org.slug}" class="org-card">
              <span class="org-dot" style="background-color: {org.primary_color};"></span>
              <span class="org-name">{org.name}</span>
              <i class="fi fi-br-angle-right org-arrow"></i>
            </a>
          {/each}
        </div>
      {:else}
        <p style="color: #878fa1; font-size: 14px;">No organizations yet.</p>
      {/if}

      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <a href="/auth">
          <button class="btn btn-primary">Recruiter Login</button>
        </a>
      </div>

      <div class="divider">
        <span class="divider-line"></span>
        <span class="divider-text">or</span>
        <span class="divider-line"></span>
      </div>

      <a href="/auth?redirect=/register" class="create-org-link">
        <button class="btn btn-create">Create Your Organization</button>
      </a>
      <p class="create-hint">Set up your own recruiting portal — free and open source.</p>
    </div>
    <div class="login-bottom-right">
      <a href="/admin" class="underline" style="color: white;">Admin</a>
    </div>
  </div>
</div>

<style lang="scss">
  @use 'sass:color';
  @use '../styles/col.scss' as *;

  .login-screen {
    display: flex;
    background: #FFC800;
    background: linear-gradient(90deg, rgba(255, 153, 0, 1) 0%, rgba(255, 200, 0, 1) 100%);
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
  }

  .login-left {
    display: flex;
    flex-direction: column;
    background-image: url('/images/ui/stairs_yellow.png');
    background-size: cover;
    border-radius: 10px 0 0 10px;
    width: 35vw;
    height: 55vh;
    padding: 30px;
    justify-content: left;
    align-items: start;
    box-shadow: 0 0px 12px rgba(0, 0, 0, 0.1);
    overflow-y: auto;
  }

  .login-right {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background-color: $dark-primary;
    border-radius: 0 10px 10px 0;
    width: 25vw;
    height: 55vh;
    padding: 30px;
    overflow-y: auto;
  }

  .login-top-right {
    display: flex;
    flex-direction: column;
    text-align: center;
    justify-items: center;
    align-items: center;
    gap: 15px;
  }

  .login-bottom-right {
    display: flex;
    justify-content: center;
    align-items: end;
    margin-top: 50px;
  }

  .org-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .org-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background-color: $dark-secondary;
    border-radius: 8px;
    color: white;
    text-decoration: none;
    transition: background-color 0.2s ease;
  }
  .org-card:hover {
    background-color: color.adjust($dark-secondary, $lightness: 5%);
    color: white;
  }
  .org-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .org-name {
    flex: 1;
    text-align: left;
    font-weight: 600;
    font-size: 14px;
  }
  .org-arrow {
    font-size: 10px;
    color: $light-tertiary;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-top: 6px;
  }
  .divider-line {
    flex: 1;
    height: 1px;
    background-color: $dark-secondary;
  }
  .divider-text {
    color: $light-tertiary;
    font-size: 12px;
    font-weight: 600;
  }
  .create-org-link {
    text-decoration: none;
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .btn-create {
    background-color: transparent;
    border: 1px solid $light-tertiary;
    color: white;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 20px;
    border-radius: 6px;
    transition: all 0.2s ease;
    &:hover {
      background-color: $dark-secondary;
      border-color: white;
      color: white;
    }
  }
  .create-hint {
    color: $light-tertiary;
    font-size: 11px;
    margin-top: 4px;
    text-align: center;
  }
</style>
