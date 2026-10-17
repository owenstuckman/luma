// Shape of the deployment status the admin Setup tab renders. Computed by
// `getInstanceStatus()` in `$lib/server/instance` (server-only); the types live
// here so client components can import them.

export type DbProvider = 'supabase-cloud' | 'supabase-self-hosted' | 'supabase-local';

export const DB_PROVIDER_LABELS: Record<DbProvider, string> = {
	'supabase-cloud': 'Supabase Cloud',
	'supabase-self-hosted': 'Self-hosted Supabase',
	'supabase-local': 'Local Supabase (CLI)'
};

export interface SchemaStatus {
	latestInRepo: string | null;
	/** Newest probed migration whose table is readable, or null if none are. */
	appliedThrough: string | null;
	upToDate: boolean;
}

export interface InstanceStatus {
	database: { provider: DbProvider; label: string; host: string | null };
	auth: { provider: 'supabase'; label: string };
	appUrl: string | null;
	adapter: 'vercel' | 'node';
	serviceRoleKey: boolean;
	analytics: { enabled: boolean; host: string };
	schema: SchemaStatus;
	migrations: string[];
}
