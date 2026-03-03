import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	const session = locals.session;
	if (!session) throw error(401, 'Unauthorized');

	const body = await request.json();

	// Verify the slug matches the requested orgId
	const { data: org } = await locals.supabase
		.from('organizations')
		.select('id')
		.eq('slug', params.slug)
		.single();

	if (!org) throw error(404, 'Organization not found');
	if (body.orgId !== org.id) throw error(403, 'Forbidden');

	// Proxy to the Supabase Edge Function using the user's JWT
	const edgeFnUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/notify-interviews`;

	const resp = await fetch(edgeFnUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.access_token}`
		},
		body: JSON.stringify(body)
	});

	const data = await resp.json();
	return json(data, { status: resp.status });
};
