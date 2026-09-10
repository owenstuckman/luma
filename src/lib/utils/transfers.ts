/**
 * Interview hand-offs and swaps.
 *
 * A transfer is a REQUEST, never a direct edit: nothing moves until the other
 * person accepts. That is the whole point — recruiters were already swapping
 * verbally, and the schedule quietly went stale, so the app showed one person
 * interviewing while somebody else turned up and the evaluation landed on the
 * wrong row.
 *
 * Every write goes through a `SECURITY DEFINER` RPC (migration 00036) rather
 * than a table update: accepting has to change an `interviews` row the
 * recipient does not own, which RLS correctly refuses, and a swap has to move
 * both rows or neither.
 */
import { supabase } from '$lib/utils/supabase';

export type TransferKind = 'handoff' | 'swap';
export type TransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface InterviewTransfer {
	id: number;
	created_at: string;
	org_id: number;
	interview_id: number;
	counterpart_interview_id: number | null;
	kind: TransferKind;
	from_email: string;
	to_email: string;
	status: TransferStatus;
	note: string | null;
	responded_at: string | null;
}

/** Every request this user is party to, newest first. */
export const getMyTransfers = async (orgId: number): Promise<InterviewTransfer[]> => {
	const { data, error } = await supabase
		.from('interview_transfers')
		.select('*')
		.eq('org_id', orgId)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error loading transfers:', error);
		return [];
	}
	return (data ?? []) as InterviewTransfer[];
};

/**
 * Ask someone to take an interview, optionally offering one of theirs back.
 * Resolves with an error string when the request is refused (already promised
 * to someone else, recipient not in the org, clash, …) rather than throwing —
 * these are ordinary outcomes the UI has to show, not exceptions.
 */
export const requestTransfer = async (opts: {
	interviewId: number;
	recipientEmail: string;
	kind: TransferKind;
	counterpartInterviewId?: number | null;
	note?: string | null;
}): Promise<{ id?: number; error?: string }> => {
	const { data, error } = await supabase.rpc('request_interview_transfer', {
		target_interview_id: opts.interviewId,
		recipient_email: opts.recipientEmail,
		transfer_kind: opts.kind,
		offered_interview_id: opts.counterpartInterviewId ?? null,
		transfer_note: opts.note ?? null
	});
	if (error) return { error: error.message };
	return data as { id?: number; error?: string };
};

/** Accept or decline. Accepting is what actually moves the interview. */
export const respondToTransfer = async (
	transferId: number,
	accept: boolean
): Promise<{ status?: string; error?: string }> => {
	const { data, error } = await supabase.rpc('respond_to_interview_transfer', {
		transfer_id: transferId,
		accept
	});
	if (error) return { error: error.message };
	return data as { status?: string; error?: string };
};

/** Withdraw a request you sent, while it is still pending. */
export const cancelTransfer = async (
	transferId: number
): Promise<{ status?: string; error?: string }> => {
	const { data, error } = await supabase.rpc('cancel_interview_transfer', {
		transfer_id: transferId
	});
	if (error) return { error: error.message };
	return data as { status?: string; error?: string };
};

/** Human summary for a request row, from the reader's point of view. */
export function describeTransfer(t: InterviewTransfer, viewerEmail: string): string {
	const mine = t.from_email.toLowerCase() === viewerEmail.toLowerCase();
	const other = mine ? t.to_email : t.from_email;
	if (t.kind === 'swap') {
		return mine ? `You offered ${other} a swap` : `${other} offered you a swap`;
	}
	return mine ? `You offered this to ${other}` : `${other} asked you to take this`;
}
