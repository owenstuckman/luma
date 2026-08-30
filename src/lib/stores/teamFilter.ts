import { writable } from 'svelte/store';

/**
 * Currently selected team filter, by slug. null = "All teams" (no filter).
 *
 * An application belongs to exactly one team, so this narrows the list to the
 * applications a given team is responsible for — it never merges or compares
 * a candidate's applications across teams.
 */
export const selectedTeamSlug = writable<string | null>(null);
