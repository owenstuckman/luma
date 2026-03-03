// Deno-compatible email template functions (mirrors src/lib/email/templates.ts)
// No Node.js APIs used — safe for Supabase Edge Functions.

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
