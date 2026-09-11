<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/utils/supabase';
	import {
		getInterviewsByInterviewer,
		getCurrentUserEmail,
		getOrgMembersWithEmail
	} from '$lib/utils/supabase';
	import Sidebar from '$lib/components/recruiter/Sidebar.svelte';
	import Navbar from '$lib/components/recruiter/Navbar.svelte';
	import { selectedJob } from '$lib/stores/jobFilter';
	import { ScheduleXCalendar } from '@schedule-x/svelte';
	import {
		createCalendar,
		createViewDay,
		createViewWeek,
		createViewMonthGrid
	} from '@schedule-x/calendar';
	import '@schedule-x/theme-default/dist/index.css';
	import {
		getMyTransfers,
		requestTransfer,
		respondToTransfer,
		cancelTransfer,
		describeTransfer
	} from '$lib/utils/transfers';
	import type { InterviewTransfer, TransferKind } from '$lib/utils/transfers';
	import type { Interview } from '$lib/types';

	let orgId: number | null = null;
	let interviews: Interview[] = [];
	let calendarApp: ReturnType<typeof createCalendar> | null = null;
	let loading = true;
	let userEmail = '';
	let errorMsg = '';

	// ── Transfers ────────────────────────────────────────────────────────────
	let transfers: InterviewTransfer[] = [];
	let members: { email: string; name: string | null }[] = [];
	let applicantNames: Record<string, string> = {};
	let busy = false;
	let actionError = '';
	let actionOk = '';

	/** The interview being handed off, when the dialog is open. */
	let transferFor: Interview | null = null;
	let toEmail = '';
	let transferKind: TransferKind = 'handoff';
	let swapWith: number | null = null;
	let note = '';

	$: incoming = transfers.filter(
		(t) => t.status === 'pending' && t.to_email.toLowerCase() === userEmail.toLowerCase()
	);
	$: outgoing = transfers.filter(
		(t) => t.status === 'pending' && t.from_email.toLowerCase() === userEmail.toLowerCase()
	);
	$: pendingByInterview = new Set(
		transfers.filter((t) => t.status === 'pending').map((t) => t.interview_id)
	);
	/** What the chosen recipient could offer back, for a swap. */
	$: theirInterviews = interviewsByEmail[toEmail.toLowerCase()] ?? [];

	let interviewsByEmail: Record<string, Interview[]> = {};

	/**
	 * One entry per SESSION, not per interview row.
	 *
	 * A group interview is stored one row per (applicant x interviewer), so a
	 * room of six showed up as six identical-looking rows each with its own
	 * "Hand off" button — and pressing one moved a single candidate. Reported as
	 * "he could only transfer one participant". Collapsing here makes the list
	 * match what the server now does, which is move the whole session.
	 */
	const sessionKey = (iv: Interview) => `${iv.location}|${iv.start_time}|${iv.type}`;

	$: mySessions = Object.values(
		interviews.reduce<Record<string, { lead: Interview; count: number }>>((acc, iv) => {
			const k = sessionKey(iv);
			if (acc[k]) acc[k].count += 1;
			else acc[k] = { lead: iv, count: 1 };
			return acc;
		}, {})
	).sort((a, b) => a.lead.start_time.localeCompare(b.lead.start_time));

	/** Sessions belonging to the chosen recipient, for the swap picker. */
	/** How many candidates are in the session currently being handed off. */
	$: transferSessionCount = transferFor
		? interviews.filter((x) => sessionKey(x) === sessionKey(transferFor!)).length
		: 0;

	$: theirSessions = Object.values(
		(theirInterviews ?? []).reduce<Record<string, Interview>>((acc, iv) => {
			const k = sessionKey(iv);
			if (!acc[k]) acc[k] = iv;
			return acc;
		}, {})
	).sort((a, b) => a.start_time.localeCompare(b.start_time));

	/** A whole session, with how many candidates are in it. */
	const sessionLabel = (iv: Interview, n: number) =>
		iv.type === 'group'
			? `${new Date(iv.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(iv.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${iv.location} · group of ${n}`
			: label(iv);

	const label = (iv: Interview | undefined) =>
		iv
			? `${new Date(iv.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(iv.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${iv.location} · ${applicantNames[iv.applicant ?? ''] ?? iv.applicant}`
			: 'that interview';

	const byId = (id: number | null) =>
		id === null
			? undefined
			: [...interviews, ...Object.values(interviewsByEmail).flat()].find((x) => x.id === id);

	function openTransfer(iv: Interview) {
		transferFor = iv;
		toEmail = '';
		transferKind = 'handoff';
		swapWith = null;
		note = '';
		actionError = '';
	}

	async function submitTransfer() {
		if (!transferFor || !toEmail) return;
		busy = true;
		actionError = '';
		const res = await requestTransfer({
			interviewId: transferFor.id,
			recipientEmail: toEmail,
			kind: transferKind,
			counterpartInterviewId: transferKind === 'swap' ? swapWith : null,
			note: note.trim() || null
		});
		busy = false;
		if (res.error) {
			actionError = res.error;
			return;
		}
		actionOk = `Request sent to ${toEmail}. It moves only once they accept.`;
		transferFor = null;
		await reload();
	}

	async function answer(t: InterviewTransfer, accept: boolean) {
		busy = true;
		actionError = '';
		const res = await respondToTransfer(t.id, accept);
		busy = false;
		if (res.error) {
			actionError = res.error;
			return;
		}
		actionOk = accept ? 'Accepted — the interview is now yours.' : 'Request declined.';
		await reload();
	}

	async function withdraw(t: InterviewTransfer) {
		busy = true;
		const res = await cancelTransfer(t.id);
		busy = false;
		if (res.error) {
			actionError = res.error;
			return;
		}
		actionOk = 'Request withdrawn.';
		await reload();
	}

	$: slug = $page.params.slug;

	function formatForCalendar(dt: string): string {
		const d = new Date(dt);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const h = String(d.getHours()).padStart(2, '0');
		const min = String(d.getMinutes()).padStart(2, '0');
		return `${y}-${m}-${day} ${h}:${min}`;
	}

	function getTodayStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	// Rebuild calendar when job filter changes
	$: if (!loading) {
		const filtered = $selectedJob
			? interviews.filter((iv) => iv.job === $selectedJob.id)
			: interviews;
		buildCalendar(filtered);
	}

	function buildCalendar(source: Interview[]) {
		const events = source.map((iv) => ({
			id: String(iv.id),
			title: `${iv.applicant || 'Unknown'} — ${iv.type}`,
			start: formatForCalendar(iv.start_time),
			end: iv.end_time ? formatForCalendar(iv.end_time) : formatForCalendar(iv.start_time),
			location: iv.location || '',
			description: `Location: ${iv.location || 'TBD'}`
		}));

		const now = new Date();
		const upcoming = source.find((iv) => new Date(iv.start_time) >= now);
		const defaultDate = upcoming
			? formatForCalendar(upcoming.start_time).split(' ')[0]
			: source.length > 0
				? formatForCalendar(source[0].start_time).split(' ')[0]
				: getTodayStr();

		calendarApp = createCalendar({
			views: [createViewWeek(), createViewDay(), createViewMonthGrid()],
			events,
			selectedDate: defaultDate,
			dayBoundaries: { start: '07:00', end: '22:00' },
			callbacks: {
				// Clicking an interview opens its evaluation form directly. The
				// interviewer is standing in front of the candidate when they need
				// it, so making them find the person again on /evaluate is a step
				// too many.
				onEventClick(calendarEvent: { id: string | number }) {
					goto(`/private/${slug}/evaluate?interview=${calendarEvent.id}`);
				}
			}
		});
	}

	onMount(async () => {
		const { data: orgData } = await supabase
			.from('organizations')
			.select('id')
			.eq('slug', slug)
			.single();

		if (!orgData) {
			loading = false;
			errorMsg = 'Organization not found.';
			return;
		}
		orgId = orgData.id;

		userEmail = (await getCurrentUserEmail()) || '';
		if (!userEmail) {
			loading = false;
			errorMsg = 'Could not determine your email. Please sign out and back in.';
			return;
		}

		await reload();
		loading = false;
	});

	/**
	 * Refetch everything the transfer UI depends on. Called after any action so
	 * the calendar, the inbox and the "who could I swap with" list can never
	 * disagree with each other.
	 */
	async function reload() {
		if (!orgId) return;
		interviews = await getInterviewsByInterviewer(orgId, userEmail);
		transfers = await getMyTransfers(orgId);

		// Teammates, from ORG MEMBERSHIP — which is what the RPC validates against.
		// Sourcing this from `interviewers` looked equivalent and wasn't: that table
		// held 31 rows against 45 members, so real teammates (adamy, with a dozen
		// interviews) were missing from the picker while the server would happily
		// have accepted them.
		const orgMembers = await getOrgMembersWithEmail(orgId);
		const names = new Map<string, string>();
		const { data: named } = await supabase
			.from('interviewers')
			.select('name,email')
			.eq('org_id', orgId);
		for (const n of named ?? []) if (n.email && n.name) names.set(n.email.toLowerCase(), n.name);

		members = orgMembers
			.filter((m) => m.email && m.email.toLowerCase() !== userEmail.toLowerCase())
			.map((m) => ({ email: m.email, name: names.get(m.email.toLowerCase()) ?? null }))
			.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

		// Everyone else's interviews, so a swap can name a specific slot and so
		// pending requests can be described in full rather than by bare id.
		const { data: all } = await supabase
			.from('interviews')
			.select('*')
			.eq('org_id', orgId)
			.order('start_time');
		const grouped: Record<string, Interview[]> = {};
		for (const iv of (all ?? []) as Interview[]) {
			const k = (iv.interviewer ?? '').toLowerCase();
			(grouped[k] = grouped[k] ?? []).push(iv);
		}
		interviewsByEmail = grouped;

		// Applicant names, so a row reads "Ellie Kwon" not an address.
		const emails = [...new Set((all ?? []).map((iv) => iv.applicant).filter(Boolean))] as string[];
		if (emails.length) {
			const { data: apps } = await supabase
				.from('applicants')
				.select('email,name')
				.eq('org_id', orgId)
				.in('email', emails);
			const map: Record<string, string> = {};
			for (const a of apps ?? []) map[a.email] = a.name;
			applicantNames = map;
		}
	}
</script>

<div class="layout">
	<div class="content-left">
		<div class="page-head">
			<div>
				<h4 class="page-title">My Schedule</h4>
				<p class="page-subtitle">Your interviews: <strong>{interviews.length}</strong> total</p>
			</div>
		</div>

		{#if loading}
			<p class="muted placeholder">Loading schedule...</p>
		{:else if errorMsg}
			<p class="muted placeholder">{errorMsg}</p>
		{:else}
			{#if actionOk}<p class="alert-soft alert-success">{actionOk}</p>{/if}
			{#if actionError}<p class="alert-soft alert-error">{actionError}</p>{/if}

			<!-- Waiting on YOU: nothing moves until one of these is answered. -->
			{#if incoming.length > 0}
				<div class="panel inbox">
					<div class="panel-head">
						<h6 class="panel-title">Requests for you ({incoming.length})</h6>
					</div>
					{#each incoming as t (t.id)}
						{@const iv = byId(t.interview_id)}
						{@const mine = byId(t.counterpart_interview_id)}
						<div class="req-row">
							<div class="req-body">
								<span class="req-who">{describeTransfer(t, userEmail)}</span>
								<span class="req-detail">{label(iv)}</span>
								{#if t.kind === 'swap'}
									<span class="req-detail swap-line">
										<i class="fi fi-br-exchange"></i> in exchange for yours: {label(mine)}
									</span>
								{/if}
								{#if t.note}<span class="req-note">"{t.note}"</span>{/if}
							</div>
							<div class="req-actions">
								<button
									class="btn btn-tertiary btn-sm"
									disabled={busy}
									on:click={() => answer(t, true)}
								>
									Accept
								</button>
								<button
									class="btn btn-quaternary btn-sm"
									disabled={busy}
									on:click={() => answer(t, false)}
								>
									Decline
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if outgoing.length > 0}
				<div class="panel inbox">
					<div class="panel-head">
						<h6 class="panel-title">Awaiting a reply ({outgoing.length})</h6>
					</div>
					{#each outgoing as t (t.id)}
						{@const iv = byId(t.interview_id)}
						<div class="req-row">
							<div class="req-body">
								<span class="req-who">{describeTransfer(t, userEmail)}</span>
								<span class="req-detail">{label(iv)}</span>
								<span class="req-note">Still yours until they accept.</span>
							</div>
							<div class="req-actions">
								<button
									class="btn btn-quaternary btn-sm"
									disabled={busy}
									on:click={() => withdraw(t)}
								>
									Withdraw
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<div class="panel">
				<div class="panel-head">
					<h6 class="panel-title">My interviews ({interviews.length})</h6>
				</div>
				{#if mySessions.length === 0}
					<p class="muted placeholder">Nothing assigned to you yet.</p>
				{:else}
					{#each mySessions as s (sessionKey(s.lead))}
						<div class="iv-row">
							<div class="iv-body">
								<span class="iv-when">{sessionLabel(s.lead, s.count)}</span>
								<span class="pill pill-neutral">{s.lead.type}</span>
							</div>
							{#if pendingByInterview.has(s.lead.id)}
								<span class="pill pill-warning">Transfer pending</span>
							{:else}
								<button class="btn btn-quaternary btn-sm" on:click={() => openTransfer(s.lead)}>
									Hand off / Swap
								</button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if calendarApp}
				<div class="calendar-wrap">
					<ScheduleXCalendar {calendarApp} />
				</div>
			{/if}
		{/if}
	</div>

	<Navbar />
	<Sidebar currentStep={2} collapse="uncollapse" />
</div>

{#if transferFor}
	<div
		class="modal-backdrop-luma"
		on:click={() => (transferFor = null)}
		on:keydown={() => {}}
		role="button"
		tabindex="-1"
	>
		<div
			class="modal-panel"
			on:click|stopPropagation={() => {}}
			on:keydown={() => {}}
			role="dialog"
			tabindex="-1"
		>
			<div class="modal-head">
				<h5 class="modal-title">Hand off or swap</h5>
				<button class="btn-icon close-btn" on:click={() => (transferFor = null)}>&times;</button>
			</div>

			<p class="dialog-sub">
				{sessionLabel(transferFor, transferSessionCount)}
			</p>
			{#if transferFor.type === 'group'}
				<p class="dialog-sub warn-line">
					This is a group session — the whole room moves, all candidates together.
				</p>
			{/if}

			<div class="field">
				<label class="field-label" for="to-email">Give it to</label>
				<select id="to-email" class="form-select" bind:value={toEmail}>
					<option value="">Choose a teammate...</option>
					{#each members as m (m.email)}
						<option value={m.email}>{m.name || m.email}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<span class="field-label">Type</span>
				<label class="radio-row">
					<input type="radio" bind:group={transferKind} value="handoff" />
					<span><strong>Hand off</strong> — they take it, you get nothing back</span>
				</label>
				<label class="radio-row">
					<input type="radio" bind:group={transferKind} value="swap" />
					<span><strong>Swap</strong> — you take one of theirs in exchange</span>
				</label>
			</div>

			{#if transferKind === 'swap'}
				<div class="field">
					<label class="field-label" for="swap-with">Their interview you'll take</label>
					{#if !toEmail}
						<p class="muted note">Choose a teammate first.</p>
					{:else if theirSessions.length === 0}
						<p class="muted note">They have no interviews to swap.</p>
					{:else}
						<select id="swap-with" class="form-select" bind:value={swapWith}>
							<option value={null}>Choose one...</option>
							{#each theirSessions as x (sessionKey(x))}
								<option value={x.id}
									>{sessionLabel(
										x,
										theirInterviews.filter((y) => sessionKey(y) === sessionKey(x)).length
									)}</option
								>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			<div class="field">
				<label class="field-label" for="tnote">Note (optional)</label>
				<textarea
					id="tnote"
					class="form-control"
					rows="2"
					bind:value={note}
					placeholder="Anything they should know..."></textarea>
			</div>

			{#if actionError}<p class="alert-soft alert-error">{actionError}</p>{/if}

			<div class="modal-actions">
				<span class="progress-note">Nothing changes until they accept.</span>
				<button class="btn btn-quaternary" on:click={() => (transferFor = null)}>Cancel</button>
				<button
					class="btn btn-tertiary"
					disabled={busy || !toEmail || (transferKind === 'swap' && !swapWith)}
					on:click={submitTransfer}
				>
					{busy ? 'Sending...' : 'Send request'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../../../styles/col.scss' as *;

	.inbox {
		margin-bottom: 14px;
	}
	.req-row,
	.iv-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-top: 1px solid $border;
		flex-wrap: wrap;
	}
	.req-body,
	.iv-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.iv-body {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
	.req-who {
		font-size: 13px;
		font-weight: 700;
		color: $text;
	}
	.req-detail,
	.iv-when {
		font-size: 12px;
		color: $text-muted;
	}
	.swap-line {
		color: $yellow-primary;
	}
	.req-note {
		font-size: 12px;
		font-style: italic;
		color: $text-muted;
	}
	.req-actions {
		display: flex;
		gap: 6px;
	}
	.warn-line {
		color: $yellow-primary;
		font-weight: 600;
	}
	.dialog-sub {
		font-size: 13px;
		color: $text-muted;
		margin: 0 0 12px;
	}
	.radio-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		color: $text;
		margin: 5px 0;
		cursor: pointer;
	}
	.radio-row input {
		margin-top: 3px;
	}
	.note {
		font-size: 12px;
		margin: 0;
	}
	.close-btn {
		font-size: 24px;
		line-height: 1;
	}
	.progress-note {
		font-size: 12px;
		color: $text-muted;
		margin-right: auto;
	}

	.placeholder {
		padding: 20px;
	}
	.calendar-wrap {
		:global(.sx-svelte-calendar-wrapper) {
			width: 100%;
			height: 700px;
			max-height: 75vh;
		}
	}
</style>
