import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	/** Migration file names (no extension), injected by vite.config.ts `define`. */
	const __LUMA_MIGRATIONS__: string[];

	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
