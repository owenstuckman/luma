// Tenant images: uploads into the public `org-assets` bucket, always under the
// org's own folder (`orgs/<org_id>/<kind>/…`). Storage RLS (migration 00040)
// only lets that org's admins — or a platform admin — write there.
//
// Images used to live in `static/`, which shipped one organization's pictures
// with the app. Anything org-specific is uploaded through here instead.

import { supabase } from '$lib/utils/supabase';

export const ORG_ASSETS_BUCKET = 'org-assets';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What an image is for; becomes the folder under `orgs/<org_id>/`. */
export type AssetKind = 'teams' | 'jobs' | 'questions';

/** A human-readable reason the file can't be uploaded, or null if it's fine. */
export function validateImage(file: File): string | null {
	if (!file.type.startsWith('image/')) return 'Please choose an image file.';
	if (file.size > MAX_IMAGE_BYTES) return 'Images must be under 5 MB.';
	return null;
}

/**
 * Upload an image for an org and return its public URL. A random file name
 * means replacing an image never serves a stale cached copy, and two uploads
 * can't clobber each other.
 */
export async function uploadOrgImage(orgId: number, kind: AssetKind, file: File): Promise<string> {
	const problem = validateImage(file);
	if (problem) throw new Error(problem);

	const ext =
		(file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
	const path = `orgs/${orgId}/${kind}/${crypto.randomUUID()}.${ext}`;

	const { error } = await supabase.storage
		.from(ORG_ASSETS_BUCKET)
		.upload(path, file, { contentType: file.type, cacheControl: '31536000' });
	if (error) throw new Error(`Upload failed: ${error.message}`);

	return supabase.storage.from(ORG_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}
