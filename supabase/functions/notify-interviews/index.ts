import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applicantEmail, interviewerEmail } from '../_shared/templates.ts';

interface RequestBody {
	orgId: number;
	recipientType: 'applicants' | 'interviewers' | 'both';
	interviewIds?: number[]; // if omitted, send for all org interviews
}

interface InterviewRow {
	id: number;
	startTime: string;
	endTime: string | null;
	location: string;
	type: 'individual' | 'group';
	job: number | null;
	applicant: string | null;
	interviewer: string | null;
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
		// ── Auth ────────────────────────────────────────────────────────────
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) return jsonError('Unauthorized', 401);

		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const resendApiKey = Deno.env.get('RESEND_API_KEY');
		const fromEmail = Deno.env.get('LUMA_FROM_EMAIL') ?? 'LUMA ATS <noreply@example.com>';

		// User-scoped client to verify JWT
		const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
			global: { headers: { Authorization: authHeader } }
		});
		const {
			data: { user },
			error: authError
		} = await supabaseUser.auth.getUser();
		if (authError || !user) return jsonError('Unauthorized', 401);

		// Service-role client for DB writes (email_log)
		const supabase = createClient(supabaseUrl, supabaseServiceKey);

		// ── Parse body ───────────────────────────────────────────────────────
		const body: RequestBody = await req.json();
		const { orgId, recipientType, interviewIds } = body;
		if (!orgId || !recipientType) return jsonError('orgId and recipientType are required', 400);

		// Verify user is an org member
		const { data: membership } = await supabase
			.from('org_members')
			.select('role')
			.eq('org_id', orgId)
			.eq('user_id', user.id)
			.single();
		if (!membership) return jsonError('Forbidden: not an org member', 403);

		// ── Fetch data ───────────────────────────────────────────────────────
		const { data: org } = await supabase
			.from('organizations')
			.select('name, email_settings')
			.eq('id', orgId)
			.single();
		if (!org) return jsonError('Organization not found', 404);

		const orgName: string = org.name ?? 'Unknown Org';
		const emailSettings: Record<string, unknown> = (org.email_settings as Record<string, unknown>) ?? {};
		const replyToEmail = (emailSettings.replyToEmail as string | undefined) ?? undefined;

		let interviewQuery = supabase
			.from('interviews')
			.select('id, startTime, endTime, location, type, job, applicant, interviewer')
			.eq('org_id', orgId);

		if (interviewIds && interviewIds.length > 0) {
			interviewQuery = interviewQuery.in('id', interviewIds);
		}

		const { data: interviews, error: ivError } = await interviewQuery;
		if (ivError) return jsonError(ivError.message, 500);
		if (!interviews || interviews.length === 0) {
			return json({ sent: 0, failed: 0, errors: [], message: 'No interviews to notify' });
		}

		// Fetch jobs and applicants for name lookups
		const jobIds = [...new Set((interviews as InterviewRow[]).map((iv) => iv.job).filter(Boolean))] as number[];
		const applicantEmails = [...new Set((interviews as InterviewRow[]).map((iv) => iv.applicant).filter(Boolean))] as string[];

		const [{ data: jobs }, { data: applicants }] = await Promise.all([
			jobIds.length > 0
				? supabase.from('job_posting').select('id, name').in('id', jobIds)
				: Promise.resolve({ data: [] }),
			applicantEmails.length > 0
				? supabase.from('applicants').select('email, name').in('email', applicantEmails)
				: Promise.resolve({ data: [] })
		]);

		function getJobTitle(jobId: number | null): string {
			if (!jobId || !jobs) return 'Open Role';
			const job = (jobs as { id: number; name: string }[]).find((j) => j.id === jobId);
			return job?.name ?? 'Open Role';
		}

		function getApplicantName(email: string): string {
			if (!applicants) return email;
			const a = (applicants as { email: string; name: string }[]).find((a) => a.email === email);
			return a?.name ?? email;
		}

		// ── Build per-recipient email batches ─────────────────────────────────
		const results: { sent: number; failed: number; errors: string[] } = {
			sent: 0,
			failed: 0,
			errors: []
		};

		if (!resendApiKey) {
			// Dry-run mode: return what would be sent without actually sending
			const applicantCount = [...new Set((interviews as InterviewRow[]).map((iv) => iv.applicant).filter(Boolean))].length;
			const interviewerCount = [...new Set((interviews as InterviewRow[]).map((iv) => iv.interviewer).filter(Boolean))].length;
			return json({
				dryRun: true,
				message: 'RESEND_API_KEY not configured — dry run only',
				wouldSend: {
					applicants: recipientType !== 'interviewers' ? applicantCount : 0,
					interviewers: recipientType !== 'applicants' ? interviewerCount : 0
				}
			});
		}

		// ── Send applicant emails ─────────────────────────────────────────────
		if (recipientType === 'applicants' || recipientType === 'both') {
			const byApplicant = new Map<string, InterviewRow[]>();
			for (const iv of interviews as InterviewRow[]) {
				if (!iv.applicant) continue;
				const existing = byApplicant.get(iv.applicant) ?? [];
				const isDup = existing.some((e) => e.startTime === iv.startTime && e.location === iv.location);
				if (!isDup) existing.push(iv);
				byApplicant.set(iv.applicant, existing);
			}

			for (const [email, ivs] of byApplicant) {
				const jobCounts = new Map<number | null, number>();
				for (const iv of ivs) jobCounts.set(iv.job, (jobCounts.get(iv.job) ?? 0) + 1);
				const primaryJobId = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

				const draft = applicantEmail({
					applicantName: getApplicantName(email),
					orgName,
					jobTitle: getJobTitle(primaryJobId),
					slots: ivs.map((iv) => ({
						startTime: new Date(iv.startTime),
						endTime: iv.endTime ? new Date(iv.endTime) : null,
						location: iv.location,
						type: iv.type
					})),
					replyToEmail
				});

				const sendResult = await sendViaResend({
					apiKey: resendApiKey,
					from: fromEmail,
					to: email,
					subject: draft.subject,
					text: draft.text,
					replyTo: replyToEmail
				});

				const logEntry = {
					org_id: orgId,
					recipient: email,
					type: 'applicant_confirmation',
					provider_id: sendResult.id ?? null,
					status: sendResult.error ? 'failed' : 'sent',
					error: sendResult.error ?? null
				};

				await supabase.from('email_log').insert(logEntry);

				if (sendResult.error) {
					results.failed++;
					results.errors.push(`${email}: ${sendResult.error}`);
				} else {
					results.sent++;
				}
			}
		}

		// ── Send interviewer emails ───────────────────────────────────────────
		if (recipientType === 'interviewers' || recipientType === 'both') {
			const byInterviewer = new Map<string, InterviewRow[]>();
			for (const iv of interviews as InterviewRow[]) {
				if (!iv.interviewer) continue;
				const existing = byInterviewer.get(iv.interviewer) ?? [];
				existing.push(iv);
				byInterviewer.set(iv.interviewer, existing);
			}

			for (const [email, ivs] of byInterviewer) {
				const interviewerName = email.split('@')[0].replace(/[._-]/g, ' ');

				const jobCounts = new Map<number | null, number>();
				for (const iv of ivs) jobCounts.set(iv.job, (jobCounts.get(iv.job) ?? 0) + 1);
				const primaryJobId = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

				const draft = interviewerEmail({
					interviewerName,
					orgName,
					jobTitle: getJobTitle(primaryJobId),
					slots: ivs.map((iv) => ({
						startTime: new Date(iv.startTime),
						endTime: iv.endTime ? new Date(iv.endTime) : null,
						location: iv.location,
						type: iv.type,
						applicantName: getApplicantName(iv.applicant ?? '')
					}))
				});

				const sendResult = await sendViaResend({
					apiKey: resendApiKey,
					from: fromEmail,
					to: email,
					subject: draft.subject,
					text: draft.text
				});

				const logEntry = {
					org_id: orgId,
					recipient: email,
					type: 'interviewer_schedule',
					provider_id: sendResult.id ?? null,
					status: sendResult.error ? 'failed' : 'sent',
					error: sendResult.error ?? null
				};

				await supabase.from('email_log').insert(logEntry);

				if (sendResult.error) {
					results.failed++;
					results.errors.push(`${email}: ${sendResult.error}`);
				} else {
					results.sent++;
				}
			}
		}

		return json(results);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return jsonError(msg, 500);
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

function jsonError(message: string, status: number): Response {
	return json({ error: message }, status);
}
