export interface ICSEventParams {
	uid: string;
	dtStart: string; // ISO datetime string (no timezone assumed)
	dtEnd: string | null; // ISO datetime string
	summary: string;
	description: string;
	location: string;
}

// Convert "2025-10-15T18:00:00" or "2025-10-15T18:00:00.000Z" → "20251015T180000"
// Uses floating time (no Z/TZID) so calendar apps interpret it as local time.
function formatDT(isoStr: string): string {
	const base = isoStr.split('.')[0].replace('Z', '');
	return base.replace(/-/g, '').replace(/:/g, '');
}

// Current UTC time for DTSTAMP
function dtstamp(): string {
	const now = new Date().toISOString();
	return formatDT(now) + 'Z';
}

// Escape special chars per RFC 5545
function escapeText(s: string): string {
	return s
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\n/g, '\\n');
}

// Fold long lines per RFC 5545 (max 75 octets, continuation with CRLF + space)
function fold(line: string): string {
	if (line.length <= 75) return line;
	const parts: string[] = [line.slice(0, 75)];
	let pos = 75;
	while (pos < line.length) {
		parts.push(' ' + line.slice(pos, pos + 74));
		pos += 74;
	}
	return parts.join('\r\n');
}

function buildVEvent(p: ICSEventParams): string {
	const start = formatDT(p.dtStart);
	const end = p.dtEnd ? formatDT(p.dtEnd) : start;
	const lines = [
		'BEGIN:VEVENT',
		fold(`UID:${p.uid}`),
		`DTSTAMP:${dtstamp()}`,
		`DTSTART:${start}`,
		`DTEND:${end}`,
		fold(`SUMMARY:${escapeText(p.summary)}`),
		fold(`DESCRIPTION:${escapeText(p.description)}`),
		fold(`LOCATION:${escapeText(p.location)}`),
		'END:VEVENT'
	];
	return lines.join('\r\n');
}

export function buildICSFile(events: ICSEventParams[]): string {
	const parts = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//LUMA ATS//EN',
		'CALSCALE:GREGORIAN',
		...events.map(buildVEvent),
		'END:VCALENDAR'
	];
	return parts.join('\r\n');
}

export function downloadICS(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export async function downloadICSZip(
	files: { filename: string; content: string }[],
	zipName: string
): Promise<void> {
	// Dynamic import keeps JSZip out of the initial bundle
	const JSZip = (await import('jszip')).default;
	const zip = new JSZip();
	for (const { filename, content } of files) {
		zip.file(filename, content);
	}
	const blob = await zip.generateAsync({ type: 'blob' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = zipName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
