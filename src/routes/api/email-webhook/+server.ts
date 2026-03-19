import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Resend webhook endpoint — receives delivery events and updates email_log status.
 *
 * Configure in Resend dashboard → Webhooks → point to:
 *   https://<your-domain>/api/email-webhook
 *
 * Events handled: email.delivered, email.bounced, email.complained, email.delivery_delayed
 */

interface ResendWebhookEvent {
	type: string;
	data: {
		email_id: string;
		to: string[];
		created_at: string;
		[key: string]: unknown;
	};
}

// Use service-role key if available (set via PRIVATE_SUPABASE_SERVICE_KEY env var),
// otherwise fall back to anon key (will rely on RLS).
const SERVICE_KEY = (typeof process !== 'undefined' && process.env?.PRIVATE_SUPABASE_SERVICE_KEY) || '';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const event: ResendWebhookEvent = await request.json();

		if (!event.type || !event.data?.email_id) {
			return json({ error: 'Invalid webhook payload' }, { status: 400 });
		}

		const providerMessageId = event.data.email_id;

		// Map Resend event types to email_log status values
		const statusMap: Record<string, string> = {
			'email.delivered': 'delivered',
			'email.bounced': 'bounced',
			'email.complained': 'complained',
			'email.delivery_delayed': 'delayed',
			'email.sent': 'sent'
		};

		const newStatus = statusMap[event.type];
		if (!newStatus) {
			// Unhandled event type (opened, clicked, etc.) — acknowledge but skip
			return json({ ok: true, skipped: true, event: event.type });
		}

		// Use service-role client to bypass RLS for updating email_log
		const supabaseKey = SERVICE_KEY || PUBLIC_SUPABASE_ANON_KEY;
		const supabase = createClient(PUBLIC_SUPABASE_URL, supabaseKey);

		const { error } = await supabase
			.from('email_log')
			.update({
				status: newStatus,
				error: event.type === 'email.bounced'
					? `Bounced: ${JSON.stringify(event.data).substring(0, 500)}`
					: event.type === 'email.complained'
						? 'Recipient marked as spam'
						: null
			})
			.eq('provider_id', providerMessageId);

		if (error) {
			console.error('Failed to update email_log:', error);
			return json({ error: 'DB update failed' }, { status: 500 });
		}

		return json({ ok: true, status: newStatus, provider_id: providerMessageId });
	} catch (err) {
		console.error('Webhook handler error:', err);
		return json({ error: 'Internal error' }, { status: 500 });
	}
};
