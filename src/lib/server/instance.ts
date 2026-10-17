// Instance-level configuration: what THIS deployment runs on, read from the
// environment that `npm run setup` writes (`.env` + `.env.local`, see the
// `*.example` templates at the repo root).
//
// Server-only. Nothing here may return a secret — the admin Setup tab renders
// this object, so keys are reported as present/absent, never by value.

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	DB_PROVIDER_LABELS,
	type DbProvider,
	type InstanceStatus,
	type SchemaStatus
} from '$lib/types/instance';

/**
 * The service-role key, if configured. `SUPABASE_SERVICE_ROLE_KEY` is the name
 * setup writes; `PRIVATE_SUPABASE_SERVICE_KEY` is the older name the email
 * webhook used, still accepted so existing deployments keep working.
 */
export function serviceRoleKey(): string {
	return privateEnv.SUPABASE_SERVICE_ROLE_KEY || privateEnv.PRIVATE_SUPABASE_SERVICE_KEY || '';
}

/** Explicit `LUMA_DB_PROVIDER` wins; otherwise infer from the Supabase URL. */
function dbProvider(url: string): DbProvider {
	const explicit = privateEnv.LUMA_DB_PROVIDER;
	if (explicit && explicit in DB_PROVIDER_LABELS) return explicit as DbProvider;
	try {
		const host = new URL(url).hostname;
		if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'supabase-local';
		if (host.endsWith('.supabase.co')) return 'supabase-cloud';
	} catch {
		// Unparseable URL: fall through and report it as self-hosted.
	}
	return 'supabase-self-hosted';
}

/**
 * Migration files in the repo, newest last — injected at build time by
 * `vite.config.ts` (`__LUMA_MIGRATIONS__`), so this is the list the running code
 * was built against even where `supabase/` isn't deployed.
 */
const MIGRATIONS: string[] = [...__LUMA_MIGRATIONS__].sort();

/**
 * One table per late migration, newest first. If the newest probe table is
 * readable the schema is at least that new. When you add a migration that
 * creates a table, add it at the top so the Setup tab notices a missing apply.
 */
const SCHEMA_PROBES: { migration: string; table: string }[] = [
	{ migration: '00039', table: 'readiness_scores' },
	{ migration: '00036', table: 'interview_transfers' },
	{ migration: '00023', table: 'org_invite_redemptions' },
	{ migration: '00015', table: 'teams' }
];

async function schemaStatus(supabase: SupabaseClient): Promise<SchemaStatus> {
	const latestInRepo = MIGRATIONS.at(-1) ?? null;
	let appliedThrough: string | null = null;
	for (const probe of SCHEMA_PROBES) {
		const { error } = await supabase
			.from(probe.table)
			.select('id', { head: true, count: 'exact' })
			.limit(0);
		if (!error) {
			appliedThrough = probe.migration;
			break;
		}
	}
	const newestProbe = SCHEMA_PROBES[0].migration;
	return {
		latestInRepo,
		appliedThrough,
		// Probes can only vouch up to the newest probed migration; anything after
		// it (functions, policies) is assumed applied alongside.
		upToDate: appliedThrough === newestProbe
	};
}

/** Everything the admin Setup tab shows about this deployment. No secrets. */
export async function getInstanceStatus(supabase: SupabaseClient): Promise<InstanceStatus> {
	const url = publicEnv.PUBLIC_SUPABASE_URL ?? '';
	let host: string | null = null;
	try {
		host = new URL(url).host;
	} catch {
		host = null;
	}
	const provider = dbProvider(url);
	return {
		database: { provider, label: DB_PROVIDER_LABELS[provider], host },
		// Supabase Auth is the only auth backend; OAuth providers (Google, Azure,
		// GitHub…) are enabled on it rather than replacing it.
		auth: { provider: 'supabase', label: 'Supabase Auth' },
		appUrl: publicEnv.PUBLIC_APP_URL || null,
		adapter: (privateEnv.ADAPTER ?? process.env.ADAPTER) === 'node' ? 'node' : 'vercel',
		serviceRoleKey: Boolean(serviceRoleKey()),
		analytics: {
			enabled: Boolean(publicEnv.PUBLIC_POSTHOG_KEY),
			host: publicEnv.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
		},
		schema: await schemaStatus(supabase),
		migrations: MIGRATIONS
	};
}
