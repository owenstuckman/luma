// Writes for per-org configuration: `organizations.settings` sections and the
// org's teams. Reads of settings still go through `readOrgSettings()` /
// `resolveInterviewForms()`; this module only owns the writes.
//
// All writes are RLS-gated (`has_org_role(org_id, 'admin')` on both tables), so
// a non-admin calling these gets an error back rather than a silent change.

import { supabase } from '$lib/utils/supabase';
import type { Team } from '$lib/types';

/**
 * Replace ONE top-level section of `organizations.settings`, leaving every
 * other key exactly as stored. Re-reads the row first so two admins editing
 * different sections (rules vs interview forms) don't overwrite each other's
 * work with a stale copy of the whole JSON. Pass a function to derive the
 * section from its freshly read value — to merge into it rather than replace.
 */
export async function saveOrgSettingsSection(
	orgId: number,
	section: string,
	value: unknown | ((current: unknown) => unknown)
): Promise<void> {
	const { data, error: readError } = await supabase
		.from('organizations')
		.select('settings')
		.eq('id', orgId)
		.single();
	if (readError) throw new Error(readError.message);

	const current =
		data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
			? (data.settings as Record<string, unknown>)
			: {};
	const resolved = typeof value === 'function' ? value(current[section]) : value;
	const next = { ...current, [section]: resolved };

	const { error } = await supabase.from('organizations').update({ settings: next }).eq('id', orgId);
	if (error) throw new Error(error.message);
}

/** Every team for an org, inactive ones included, in display order. */
export async function getAllTeams(orgId: number): Promise<Team[]> {
	const { data, error } = await supabase
		.from('teams')
		.select('*')
		.eq('org_id', orgId)
		.order('display_order', { ascending: true });
	if (error) throw new Error(error.message);
	return (data ?? []) as Team[];
}

/** 'Design Team' → 'design-team'. The slug is what question `team_scope` rules reference. */
export function slugifyTeam(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export async function createTeam(
	orgId: number,
	team: { name: string; slug: string; description: string | null; display_order: number }
): Promise<Team> {
	const { data, error } = await supabase
		.from('teams')
		.insert({ org_id: orgId, active: true, ...team })
		.select('*')
		.single();
	if (error) {
		if (error.code === '23505')
			throw new Error(`A team with the slug "${team.slug}" already exists.`);
		throw new Error(error.message);
	}
	return data as Team;
}

/**
 * Update a team. Deliberately no delete: applications reference `team_id`, so
 * retiring a team is `active: false`, which hides it from new application forms
 * and keeps every past application readable.
 */
export async function updateTeam(
	teamId: number,
	patch: Partial<Pick<Team, 'name' | 'description' | 'display_order' | 'active' | 'image_url'>>
): Promise<void> {
	const { error } = await supabase.from('teams').update(patch).eq('id', teamId);
	if (error) throw new Error(error.message);
}
