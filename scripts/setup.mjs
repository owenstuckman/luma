#!/usr/bin/env node

/**
 * LUMA Setup Script
 * Guides new users through initial project configuration.
 *
 * Usage: npm run setup
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n🟡 LUMA Setup\n');
  console.log('This script will help you configure LUMA for first use.\n');

  // Step 1: Environment variables
  console.log('─── Step 1: Supabase Credentials ───\n');

  if (existsSync('.env.local')) {
    const overwrite = await ask('.env.local already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Keeping existing .env.local\n');
    } else {
      await setupEnv();
    }
  } else {
    await setupEnv();
  }

  // Step 2: Database setup
  console.log('\n─── Step 2: Database Setup ───\n');
  console.log('Run the migration files in your Supabase SQL Editor in order:');
  console.log('  1. supabase/migrations/00001_initial_schema.sql');
  console.log('  2. supabase/migrations/00002_multi_tenancy.sql');
  console.log('  3. supabase/migrations/00003_rls_policies.sql');
  console.log('  4. supabase/migrations/00004_member_management_functions.sql');
  console.log('');
  console.log('Or if you have the Supabase CLI installed:');
  console.log('  supabase db push\n');

  const dbReady = await ask('Have you run the migrations? (y/N): ');
  if (dbReady.toLowerCase() !== 'y') {
    console.log('Run the migrations and then start the app with: npm run dev\n');
  }

  // Step 3: Auth configuration
  console.log('\n─── Step 3: Auth Configuration ───\n');
  console.log('In your Supabase dashboard:');
  console.log('  1. Go to Authentication → URL Configuration');
  console.log('  2. Set Site URL to: http://localhost:5173');
  console.log('  3. Add redirect URL: http://localhost:5173/auth/confirm');
  console.log('');
  console.log('For production, update these to your deployed URL.\n');

  // Done
  console.log('─── Setup Complete ───\n');
  console.log('Start the dev server:  npm run dev');
  console.log('Then visit:            http://localhost:5173');
  console.log('');
  console.log('First steps:');
  console.log('  1. Go to /auth and create an account');
  console.log('  2. Go to /register to create your organization');
  console.log('  3. Go to Settings → Manage Postings to create job listings');
  console.log('  4. Share /apply/your-slug with applicants\n');

  rl.close();
}

async function setupEnv() {
  const url = await ask('Supabase Project URL: ');
  const key = await ask('Supabase Anon Key: ');

  if (!url || !key) {
    console.log('Skipping .env.local — you can set it up manually later.');
    console.log('Copy env.example to .env.local and fill in your credentials.\n');
    return;
  }

  const content = `PUBLIC_SUPABASE_URL=${url.trim()}\nPUBLIC_SUPABASE_ANON_KEY=${key.trim()}\n`;
  writeFileSync('.env.local', content);
  console.log('Created .env.local\n');
}

main().catch(console.error);
