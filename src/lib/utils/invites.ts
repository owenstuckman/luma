/**
 * Org invite links.
 *
 * The old path to adding a teammate (`inviteMemberByEmail`) only works if they
 * already have a LUMA account — it looks the address up in `auth.users`. These
 * helpers wrap the `org_invites` RPCs from migration 00021, which let an admin
 * hand out a link that the recipient redeems themselves, signing up along the
 * way if they need to.
 *
 * Everything here goes through SECURITY DEFINER functions rather than table
 * reads: the person accepting an invite is by definition not yet a member, so
 * RLS would hide the row from them.
 */
import { supabase } from './supabase';

import type { InviteDetails, OrgInvite } from '$lib/types';

export interface CreateInviteOptions {
	/** Bind the invite to one address. Omit for a link anyone can redeem. */
	email?: string | null;
	role?: string;
	roles?: string[];
	expiresInDays?: number;
	/** Only meaningful for open links; email-bound invites are single-use. */
	maxUses?: number;
}

/** Create an invite and return its token. Owners/admins only (enforced in SQL). */
export const createOrgInvite = async (
	orgId: number,
	options: CreateInviteOptions = {}
): Promise<{ token: string; expires_at: string }> => {
	const { data, error } = await supabase.rpc('create_org_invite', {
		target_org_id: orgId,
		target_email: options.email?.trim() || null,
		target_role: options.role ?? 'recruiter',
		target_roles: options.roles ?? [],
		expires_in_days: options.expiresInDays ?? 14,
		target_max_uses: options.maxUses ?? 1
	});

	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return { token: data.token, expires_at: data.expires_at };
};

/** Every invite for an org, newest first. Returns [] for non-admins. */
export const getOrgInvites = async (orgId: number): Promise<OrgInvite[]> => {
	const { data, error } = await supabase.rpc('get_org_invites', { target_org_id: orgId });

	if (error) {
		console.error('Error fetching invites:', error);
		return [];
	}
	return (data ?? []) as OrgInvite[];
};

export const revokeOrgInvite = async (inviteId: number): Promise<void> => {
	const { data, error } = await supabase.rpc('revoke_org_invite', { invite_id: inviteId });

	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
};

/**
 * Read an invite without being signed in — this is what renders the
 * "You've been invited to join X" page. Never returns the invited address, so
 * a guessed token leaks nothing.
 */
export const getInviteDetails = async (token: string): Promise<InviteDetails> => {
	const { data, error } = await supabase.rpc('get_invite_details', { invite_token: token });

	if (error) {
		console.error('Error reading invite:', error);
		return { valid: false, reason: 'not_found' };
	}
	return data as InviteDetails;
};

/** Redeem an invite for the signed-in user. Returns the org slug to land on. */
export const acceptOrgInvite = async (
	token: string
): Promise<{ slug: string; alreadyMember: boolean }> => {
	const { data, error } = await supabase.rpc('accept_org_invite', { invite_token: token });

	if (error) throw new Error(error.message);
	if (data?.error) throw new Error(data.error);
	return { slug: data.slug, alreadyMember: data.already_member };
};

/** Absolute URL to hand out. `origin` comes from `$page.url.origin`. */
export const inviteUrl = (origin: string, token: string) => `${origin}/invite/${token}`;

/** Human-readable state for the invite list in Settings → Members. */
export const inviteStatus = (
	invite: OrgInvite
): { label: string; tone: 'active' | 'spent' | 'dead' } => {
	if (invite.revoked_at) return { label: 'Revoked', tone: 'dead' };
	if (new Date(invite.expires_at) < new Date()) return { label: 'Expired', tone: 'dead' };
	if (invite.used_count >= invite.max_uses) return { label: 'Accepted', tone: 'spent' };
	if (invite.max_uses > 1) {
		return { label: `Active · ${invite.used_count}/${invite.max_uses} used`, tone: 'active' };
	}
	return { label: 'Pending', tone: 'active' };
};
