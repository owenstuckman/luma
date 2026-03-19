import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applicantEmail, interviewerEmail } from '../_shared/templates.ts';

/**
 * send-reminders Edge Function
 *
 * Sends reminder emails for interviews happening in the next 24 hours.
 * Skips interviews that already have a reminder logged in email_log.
 *
 * Trigger options:
 *   1. pg_cron: SELECT cron.schedule('send-reminders', '0 8 * * *',
 *      $$SELECT net.http_post(url := '...',  headers := '...', body := '{}')$$);
 *   2. Manual: POST /functions/v1/send-reminders (with service_role key)
 */

interface InterviewRow {
	id: number;
	"start_time": string;
	"end_time": string | null;
	location: string;
	type: 'individual' | 'group';
	job: number | null;
	applicant: string | null;
	interviewer: string | null;
	org_id: number;
}

Deno.serve(async (req: Request) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Headers': 'authorization, content-type'
			}
		});
	}

	try {
		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const resendApiKey = Deno.env.get('RESEND_API_KEY');

		if (!resendApiKey) {
			return json({ error: 'RESEND_API_KEY not configured' }, 500);
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey);

		// Find interviews in the next 24 hours
		const now = new Date();
		const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		const { data: interviews, error: ivError } = await supabase
			.from('interviews')
			.select('id, start_time, end_time, location, type, job, applicant, interviewer, org_id')
			.gte('start_time', now.toISOString())
			.lte('start_time', tomorrow.toISOString());

		if (ivError) return json({ error: ivError.message }, 500);
		if (!interviews || interviews.length === 0) {
			return json({ sent: 0, message: 'No interviews in the next 24 hours' });
		}

		// Check which interviews already have reminders sent
		const interviewIds = (interviews as InterviewRow[]).map(iv => iv.id);
		const { data: existingReminders } = await supabase
			.from('email_log')
			.select('interview_id, type')
			.in('interview_id', interviewIds)
			.in('type', ['applicant_reminder', 'interviewer_reminder']);

		const sentReminders = new Set(
			(existingReminders ?? []).map(r => `${r.interview_id}:${r.type}`)
		);

		// Group by org for org-specific settings
		const orgIds = [...new Set((interviews as InterviewRow[]).map(iv => iv.org_id))];
		const { data: orgs } = await supabase
			.from('organizations')
			.select('id, name, email_settings')
			.in('id', orgIds);

		const orgMap = new Map((orgs ?? []).map(o => [o.id, o]));

		// Fetch job titles
		const jobIds = [...new Set((interviews as InterviewRow[]).map(iv => iv.job).filter(Boolean))] as number[];
		const { data: jobs } = jobIds.length > 0
			? await supabase.from('job_posting').select('id, name').in('id', jobIds)
			: { data: [] };
		const jobMap = new Map((jobs ?? []).map(j => [j.id, j.name]));

		// Fetch applicant names
		const applicantEmails = [...new Set((interviews as InterviewRow[]).map(iv => iv.applicant).filter(Boolean))] as string[];
		const { data: applicants } = applicantEmails.length > 0
			? await supabase.from('applicants').select('email, name').in('email', applicantEmails)
			: { data: [] };
		const applicantMap = new Map((applicants ?? []).map(a => [a.email, a.name]));

		const results = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] };
		const defaultFrom = Deno.env.get('LUMA_FROM_EMAIL') ?? 'LUMA ATS <noreply@example.com>';

		for (const iv of interviews as InterviewRow[]) {
			const org = orgMap.get(iv.org_id);
			const orgName = org?.name ?? 'Unknown Org';
			const emailSettings = (org?.email_settings ?? {}) as Record<string, string>;
			const replyToEmail = emailSettings.replyToEmail || undefined;
			const fromEmail = emailSettings.fromEmail || defaultFrom;
			const jobTitle = (iv.job ? jobMap.get(iv.job) : null) ?? 'Open Role';

			// Send applicant reminder
			if (iv.applicant && !sentReminders.has(`${iv.id}:applicant_reminder`)) {
				const applicantName = applicantMap.get(iv.applicant) ?? iv.applicant;
				const draft = applicantEmail({
					applicantName,
					orgName,
					jobTitle,
					slots: [{
						startTime: new Date(iv.start_time),
						endTime: iv.end_time ? new Date(iv.end_time) : null,
						location: iv.location,
						type: iv.type
					}],
					replyToEmail
				});

				const sendResult = await sendViaResend({
					apiKey: resendApiKey,
					from: fromEmail,
					to: iv.applicant,
					subject: `Reminder: ${draft.subject}`,
					text: `This is a reminder about your upcoming interview.\n\n${draft.text}`,
					replyTo: replyToEmail
				});

				await supabase.from('email_log').insert({
					org_id: iv.org_id,
					interview_id: iv.id,
					recipient: iv.applicant,
					type: 'applicant_reminder',
					provider_id: sendResult.id ?? null,
					status: sendResult.error ? 'failed' : 'sent',
					error: sendResult.error ?? null
				});

				if (sendResult.error) {
					results.failed++;
					results.errors.push(`${iv.applicant}: ${sendResult.error}`);
				} else {
					results.sent++;
				}
			} else if (iv.applicant) {
				results.skipped++;
			}

			// Send interviewer reminder
			if (iv.interviewer && !sentReminders.has(`${iv.id}:interviewer_reminder`)) {
				const interviewerName = iv.interviewer.split('@')[0].replace(/[._-]/g, ' ');
				const draft = interviewerEmail({
					interviewerName,
					orgName,
					jobTitle,
					slots: [{
						startTime: new Date(iv.start_time),
						endTime: iv.end_time ? new Date(iv.end_time) : null,
						location: iv.location,
						type: iv.type,
						applicantName: applicantMap.get(iv.applicant ?? '') ?? iv.applicant ?? 'TBD'
					}]
				});

				const sendResult = await sendViaResend({
					apiKey: resendApiKey,
					from: fromEmail,
					to: iv.interviewer,
					subject: `Reminder: ${draft.subject}`,
					text: `This is a reminder about your upcoming interview.\n\n${draft.text}`
				});

				await supabase.from('email_log').insert({
					org_id: iv.org_id,
					interview_id: iv.id,
					recipient: iv.interviewer,
					type: 'interviewer_reminder',
					provider_id: sendResult.id ?? null,
					status: sendResult.error ? 'failed' : 'sent',
					error: sendResult.error ?? null
				});

				if (sendResult.error) {
					results.failed++;
					results.errors.push(`${iv.interviewer}: ${sendResult.error}`);
				} else {
					results.sent++;
				}
			} else if (iv.interviewer) {
				results.skipped++;
			}
		}

		return json(results);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return json({ error: msg }, 500);
	}
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendViaResend(params: {
	apiKey: string;
	from: string;
	to: string;
	subject: string;
	text: string;
	replyTo?: string;
}): Promise<{ id?: string; error?: string }> {
	const body: Record<string, unknown> = {
		from: params.from,
		to: [params.to],
		subject: params.subject,
		text: params.text
	};
	if (params.replyTo) body.reply_to = params.replyTo;

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${params.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const errText = await res.text();
		return { error: `Resend ${res.status}: ${errText}` };
	}

	const data = await res.json();
	return { id: data.id };
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		}
	});
}
