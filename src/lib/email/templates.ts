export interface EmailSlot {
	startTime: Date;
	endTime: Date | null;
	location: string;
	type: 'individual' | 'group';
}

export interface InterviewerSlot extends EmailSlot {
	applicantName: string;
}

export interface EmailDraft {
	subject: string;
	text: string;
}

function formatTime(d: Date): string {
	return d.toLocaleString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

function formatTimeShort(d: Date): string {
	return d.toLocaleString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}

function formatDateShort(d: Date): string {
	return d.toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
}

function formatSlotTime(start: Date, end: Date | null): string {
	if (!end) return formatTime(start);
	return `${formatTime(start)} – ${formatTimeShort(end)}`;
}

export function applicantEmail(params: {
	applicantName: string;
	orgName: string;
	jobTitle: string;
	slots: EmailSlot[];
	replyToEmail?: string;
}): EmailDraft {
	const { applicantName, orgName, jobTitle, slots, replyToEmail } = params;

	const sorted = [...slots].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
	const first = sorted[0];

	const subject =
		sorted.length === 1
			? `Your Interview with ${orgName} — ${formatDateShort(first.startTime)}`
			: `Your Interviews with ${orgName} (${sorted.length} sessions)`;

	const slotLines = sorted
		.map((s, i) => {
			const timeStr = formatSlotTime(s.startTime, s.endTime);
			const typeStr = s.type === 'group' ? 'Group Interview' : 'Individual Interview';
			const locationStr = s.location || 'TBD';
			return sorted.length === 1
				? `Time:     ${timeStr}\nLocation: ${locationStr}\nFormat:   ${typeStr}`
				: `Session ${i + 1} — ${typeStr}\n  Time:     ${timeStr}\n  Location: ${locationStr}`;
		})
		.join('\n\n');

	const greeting = applicantName ? `Hi ${applicantName},` : 'Hi,';
	const replyLine = replyToEmail
		? `Reply to ${replyToEmail} if you have any questions or need to reschedule.`
		: `Reply to this email if you have any questions or need to reschedule.`;

	const text = `${greeting}

We're excited to invite you to interview for ${jobTitle} at ${orgName}.

${slotLines}

Please arrive 5 minutes early. ${replyLine}

Best,
${orgName} Recruiting Team`;

	return { subject, text };
}

export function interviewerEmail(params: {
	interviewerName: string;
	orgName: string;
	jobTitle: string;
	slots: InterviewerSlot[];
}): EmailDraft {
	const { interviewerName, orgName, jobTitle, slots } = params;

	const sorted = [...slots].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

	const subject = `Your Interview Schedule — ${jobTitle} at ${orgName} (${sorted.length} interview${sorted.length === 1 ? '' : 's'})`;

	const slotLines = sorted
		.map((s, i) => {
			const timeStr = formatSlotTime(s.startTime, s.endTime);
			const typeStr = s.type === 'group' ? 'Group' : 'Individual';
			const locationStr = s.location || 'TBD';
			return `${i + 1}. ${s.applicantName}\n   Time:     ${timeStr}\n   Location: ${locationStr}\n   Format:   ${typeStr}`;
		})
		.join('\n\n');

	const greeting = interviewerName ? `Hi ${interviewerName},` : 'Hi,';

	const text = `${greeting}

You have ${sorted.length} interview${sorted.length === 1 ? '' : 's'} scheduled for ${jobTitle} at ${orgName}. Please review candidate materials in LUMA before your sessions.

${slotLines}

Reply to this email if you have any scheduling conflicts.

Best,
${orgName} Recruiting Team`;

	return { subject, text };
}

/* ------------------------------------------------------------------ *
 * Application lifecycle (V1)
 *
 * Plain-text drafts, same shape as the interview templates above. Kept
 * in-repo rather than in a vendor dashboard so they are reviewed and
 * versioned like any other code. The caller decides whether to send —
 * each event has its own toggle in `OrgSettings.email`.
 * ------------------------------------------------------------------ */

/** Sent immediately after a successful submission. */
export function applicationReceivedEmail(params: {
	applicantName: string;
	orgName: string;
	jobTitle: string;
	teamNames?: string[];
	replyToEmail?: string;
}): EmailDraft {
	const { applicantName, orgName, jobTitle, teamNames = [], replyToEmail } = params;
	const greeting = applicantName ? `Hi ${applicantName},` : 'Hi,';
	const teamLine = teamNames.length > 0 ? `\nYou applied to: ${teamNames.join(', ')}.\n` : '\n';
	const replyLine = replyToEmail
		? `If you have questions, reply to ${replyToEmail}.`
		: 'If you have questions, just reply to this email.';

	return {
		subject: `We received your application — ${orgName}`,
		text: `${greeting}

Thanks for applying for ${jobTitle} at ${orgName}. Your application is in.
${teamLine}
We're reviewing applications now and will be in touch about next steps. You
don't need to do anything else right now.

${replyLine}

Best,
${orgName} Recruiting Team`
	};
}

/**
 * Sent when a submission trips an auto-reject rule. Deliberately gives no
 * per-question detail — telling applicants exactly which answer disqualified
 * them invites gaming the form on a resubmit.
 */
export function autoRejectedEmail(params: {
	applicantName: string;
	orgName: string;
	jobTitle: string;
	replyToEmail?: string;
}): EmailDraft {
	const { applicantName, orgName, jobTitle, replyToEmail } = params;
	const greeting = applicantName ? `Hi ${applicantName},` : 'Hi,';
	const replyLine = replyToEmail ? `\n\nQuestions? Reply to ${replyToEmail}.` : '';

	return {
		subject: `Your application to ${orgName}`,
		text: `${greeting}

Thank you for your interest in ${jobTitle} at ${orgName}, and for taking the
time to apply.

Unfortunately we aren't able to move forward with your application this cycle,
as it doesn't meet the eligibility requirements for this role.

We'd genuinely welcome an application from you in a future cycle if your
circumstances change.${replyLine}

Best,
${orgName} Recruiting Team`
	};
}

export type DecisionKind = 'hire' | 'reject' | 'waitlist';

/** Final per-team outcome. One template, three tones. */
export function decisionEmail(params: {
	applicantName: string;
	orgName: string;
	teamName: string;
	outcome: DecisionKind;
	customMessage?: string;
	replyToEmail?: string;
}): EmailDraft {
	const { applicantName, orgName, teamName, outcome, customMessage, replyToEmail } = params;
	const greeting = applicantName ? `Hi ${applicantName},` : 'Hi,';
	const replyLine = replyToEmail
		? `Reply to ${replyToEmail} with any questions.`
		: 'Reply to this email with any questions.';

	// An admin-authored message replaces the default body entirely, so orgs can
	// say something specific without us second-guessing their wording.
	const bodies: Record<DecisionKind, { subject: string; body: string }> = {
		hire: {
			subject: `Welcome to ${teamName} — ${orgName}`,
			body: `We're delighted to offer you a place on ${teamName} at ${orgName}.

Congratulations — this was a competitive cycle and you stood out. We'll follow
up shortly with onboarding details and your first meeting.`
		},
		waitlist: {
			subject: `Your application to ${teamName} — ${orgName}`,
			body: `Thank you for interviewing for ${teamName} at ${orgName}.

We'd like to place you on our waitlist. That means we were impressed, but don't
have a spot to offer right now. If one opens up this cycle, you're who we'll
contact first. We'll let you know either way rather than leaving you waiting.`
		},
		reject: {
			subject: `Your application to ${teamName} — ${orgName}`,
			body: `Thank you for interviewing for ${teamName} at ${orgName}, and for the time
you put into the process.

After careful consideration we aren't able to offer you a spot this cycle. This
was a genuinely difficult decision — we had far more strong candidates than
places.

We'd encourage you to apply again next cycle.`
		}
	};

	const chosen = bodies[outcome];
	return {
		subject: chosen.subject,
		text: `${greeting}

${customMessage?.trim() || chosen.body}

${replyLine}

Best,
${orgName} Recruiting Team`
	};
}
