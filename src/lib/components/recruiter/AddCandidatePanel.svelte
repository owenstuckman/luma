<!--
	Add ONE candidate to a schedule that already exists.

	The batch scheduler builds a schedule from nothing; once it's live, a late
	addition can't go back through it without moving everyone else. This finds
	openings next to the sessions already running — a seat in a group session and
	an individual slot either side of it — and writes only that candidate's rows.
	The search itself is `findPlacements` in `$lib/scheduling/addToSchedule`.
-->
<script lang="ts">
	import {
		getAllApplicants,
		getInterviewsByOrg,
		getInterviewerAvailability,
		bulkCreateInterviews,
		bulkUpdateApplicantStatus
	} from '$lib/utils/supabase';
	import {
		findPlacements,
		parseApplicantAvailability,
		localToISO,
		describePlacement,
		formatDay,
		formatRange,
		handle,
		type AddToScheduleResult,
		type PlacementOption
	} from '$lib/scheduling/addToSchedule';
	import type { Applicant, Interview, JobPosting } from '$lib/types';

	export let orgId: number;
	export let jobs: JobPosting[] = [];
	export let jobId: number | null = null;

	let loading = false;
	let loadedFor: number | null = null;
	let applicants: Applicant[] = [];
	/** Every application in the org — a candidate's other teams may sit under other postings. */
	let allApplicants: Applicant[] = [];
	let interviews: Interview[] = [];
	let hours: { email: string; date: string; start: string; end: string }[] = [];

	let email = '';
	let preferredDate = '';
	let maxGroupSize: number | null = null;

	let result: AddToScheduleResult | null = null;
	let writing = false;
	let error = '';
	let placed: { name: string; option: PlacementOption } | null = null;
	let copied = false;

	$: if (jobId === null && jobs.length === 1) jobId = jobs[0].id;
	$: if (jobId) ensureLoaded(jobId);

	function ensureLoaded(id: number) {
		if (id !== loadedFor) load(id);
	}

	async function load(id: number) {
		loadedFor = id;
		loading = true;
		error = '';
		result = null;
		try {
			const [apps, ivs, avail] = await Promise.all([
				getAllApplicants(orgId),
				getInterviewsByOrg(orgId),
				getInterviewerAvailability(orgId, id)
			]);
			allApplicants = apps;
			applicants = apps.filter((a) => a.job === id);
			interviews = ivs.filter((iv) => iv.job === id);
			hours = avail.map((h) => ({
				email: h.email,
				date: h.date,
				start: h.start_time,
				end: h.end_time
			}));
		} catch (e) {
			loadedFor = null; // allow a retry
			error = e instanceof Error ? e.message : 'Could not load the schedule.';
		}
		loading = false;
	}

	$: scheduledEmails = new Set(interviews.map((iv) => (iv.applicant ?? '').toLowerCase()));

	/** One entry per person — applications are stored per team. */
	$: people = Array.from(
		applicants
			.reduce(
				(m, a) => (m.has(a.email.toLowerCase()) ? m : m.set(a.email.toLowerCase(), a)),
				new Map<string, Applicant>()
			)
			.values()
	).sort((a, b) => a.name.localeCompare(b.name));
	$: unscheduled = people.filter((a) => !scheduledEmails.has(a.email.toLowerCase()));
	$: onSchedule = people.filter((a) => scheduledEmails.has(a.email.toLowerCase()));
	$: chosen = people.find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null;

	const pad = (n: number) => String(n).padStart(2, '0');
	function nowLocal(): string {
		const d = new Date();
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	/** Days that still have interviews on them — the only days an opening can be on. */
	$: upcomingDays = [
		...new Set(
			interviews
				.filter((iv) => new Date(iv.start_time) > new Date())
				.map((iv) => {
					const d = new Date(iv.start_time);
					return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
				})
		)
	].sort();

	function search(rows: Interview[] = interviews): AddToScheduleResult | null {
		if (!chosen) return null;
		return findPlacements({
			applicantEmail: chosen.email,
			availability: parseApplicantAvailability(chosen.recruitInfo),
			rows,
			interviewerHours: hours,
			options: {
				preferredDate: preferredDate || null,
				maxGroupSize: maxGroupSize || null,
				notBefore: nowLocal()
			}
		});
	}

	function findOpenings() {
		error = '';
		placed = null;
		result = search();
	}

	const optionKey = (o: PlacementOption) =>
		JSON.stringify([o.individual, o.group && [o.group.date, o.group.start, o.group.location]]);

	async function schedule(option: PlacementOption) {
		if (!chosen || !jobId) return;
		const person = chosen;
		const summary = describePlacement(person.name, option);
		if (!confirm(`Add this to the schedule?\n\n${summary}\n\nNo email is sent.`)) return;

		writing = true;
		error = '';
		try {
			// Someone else may have changed the schedule since the search ran — a
			// transfer accepted, another late addition into the same seat. Search
			// again on fresh rows and only write if this exact option survives.
			const fresh = (await getInterviewsByOrg(orgId)).filter((iv) => iv.job === jobId);
			const recheck = search(fresh);
			if (!recheck?.options.some((o) => optionKey(o) === optionKey(option))) {
				interviews = fresh;
				result = recheck;
				throw new Error(
					'The schedule changed since you searched and that opening is gone. The list below is up to date.'
				);
			}

			const base = {
				job: jobId,
				applicant: person.email,
				applicant_id: person.id,
				org_id: orgId,
				source: 'auto'
			};
			const rows = [];
			if (option.individual) {
				const i = option.individual;
				rows.push({
					...base,
					start_time: localToISO(i.date, i.start),
					end_time: localToISO(i.date, i.end),
					location: i.location,
					type: 'individual',
					interviewer: i.interviewer
				});
			}
			if (option.group) {
				const g = option.group;
				// Group interviews are one row per (candidate × interviewer).
				for (const interviewer of g.interviewers) {
					rows.push({
						...base,
						start_time: localToISO(g.date, g.start),
						end_time: localToISO(g.date, g.end),
						location: g.location,
						type: 'group',
						interviewer
					});
				}
			}
			await bulkCreateInterviews(rows);

			// Interviewing is per person, so every one of their team applications
			// moves to Interview — except any already accepted.
			const siblings = allApplicants
				.filter((a) => a.email.toLowerCase() === person.email.toLowerCase())
				.filter((a) => a.status !== 'accepted' && a.status !== 'interview')
				.map((a) => a.id);
			if (siblings.length) await bulkUpdateApplicantStatus(siblings, 'interview');

			placed = { name: person.name, option };
			result = null;
			email = '';
			await load(jobId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not add them to the schedule.';
		}
		writing = false;
	}

	async function copy() {
		if (!placed) return;
		await navigator.clipboard.writeText(describePlacement(placed.name, placed.option));
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="panel">
	<div class="panel-head">
		<h6 class="panel-title">Add a candidate to the schedule</h6>
	</div>
	<p class="field-hint intro">
		For someone advanced after the schedule went out. Finds a seat in an upcoming group session and
		an individual slot right next to it, using rooms and interviewers that are free — without moving
		anyone already scheduled.
	</p>

	<div class="add-grid">
		{#if jobs.length > 1}
			<div class="field">
				<label class="field-label" for="add-job">Job posting</label>
				<select id="add-job" class="form-select" bind:value={jobId}>
					<option value={null} disabled>Choose a posting</option>
					{#each jobs as job (job.id)}
						<option value={job.id}>{job.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<div class="field">
			<label class="field-label" for="add-person">Candidate</label>
			<select
				id="add-person"
				class="form-select"
				bind:value={email}
				disabled={!jobId || loading}
				on:change={() => (result = null)}
			>
				<option value="">{loading ? 'Loading…' : 'Choose a candidate'}</option>
				<optgroup label="Not on the schedule">
					{#each unscheduled as a (a.email)}
						<option value={a.email}>{a.name} — {a.status}</option>
					{/each}
				</optgroup>
				{#if onSchedule.length}
					<optgroup label="Already scheduled">
						{#each onSchedule as a (a.email)}
							<option value={a.email} disabled>{a.name}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
		</div>

		<div class="field">
			<label class="field-label" for="add-day">Preferred day</label>
			<select id="add-day" class="form-select" bind:value={preferredDate}>
				<option value="">No preference</option>
				{#each upcomingDays as d (d)}
					<option value={d}>{formatDay(d)}</option>
				{/each}
			</select>
		</div>

		<div class="field">
			<label class="field-label" for="add-cap">Max group size</label>
			<input
				id="add-cap"
				class="form-control"
				type="number"
				min="1"
				placeholder={result ? `Auto (${result.groupCap})` : 'Auto'}
				bind:value={maxGroupSize}
			/>
		</div>
	</div>

	<button class="btn btn-primary" on:click={findOpenings} disabled={!chosen || loading || writing}>
		Find openings
	</button>

	{#if error}<p class="alert-soft alert-error spaced">{error}</p>{/if}

	{#if placed}
		<div class="alert-soft alert-success spaced">
			<div class="placed-head">
				<strong>{placed.name} — {formatDay(placed.option.date)}</strong>
				<button class="btn btn-quaternary btn-sm" on:click={copy}>
					{copied ? 'Copied' : 'Copy details'}
				</button>
			</div>
			<p class="placed-note">Added to the schedule and marked Interview. No email was sent.</p>
		</div>
		<div class="table-scroll">
			<table class="data-table">
				<tbody>
					{#if placed.option.individual}
						{@const i = placed.option.individual}
						<tr>
							<th class="slot-label">Individual</th>
							<td
								><strong>{formatRange(i.start, i.end)}, {i.location}</strong> — with {handle(
									i.interviewer
								)}</td
							>
						</tr>
					{/if}
					{#if placed.option.group}
						{@const g = placed.option.group}
						<tr>
							<th class="slot-label">Group</th>
							<td
								><strong>{formatRange(g.start, g.end)}, {g.location}</strong> — with {g.interviewers
									.map(handle)
									.join(', ')}</td
							>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{/if}

	{#if result}
		{#each result.warnings as w (w)}
			<p class="alert-soft alert-warning spaced">{w}</p>
		{/each}

		{#each result.options as option (optionKey(option))}
			<div class="option">
				<div class="option-head">
					<strong>{formatDay(option.date)}</strong>
					{#if option.preferredDay}<span class="pill pill-success">Preferred day</span>{/if}
					{#if option.outsideAvailability}
						<span class="pill pill-warning">Outside their availability</span>
					{/if}
					<button
						class="btn btn-primary btn-sm option-go"
						on:click={() => schedule(option)}
						disabled={writing}
					>
						{writing ? 'Adding…' : 'Schedule this'}
					</button>
				</div>
				<div class="table-scroll">
					<table class="data-table">
						<tbody>
							{#if option.individual}
								{@const i = option.individual}
								<tr>
									<th class="slot-label">Individual</th>
									<td>{formatRange(i.start, i.end)}</td>
									<td>{i.location}</td>
									<td>with {handle(i.interviewer)}</td>
								</tr>
							{/if}
							{#if option.group}
								{@const g = option.group}
								<tr>
									<th class="slot-label">Group</th>
									<td>{formatRange(g.start, g.end)}</td>
									<td>{g.location}</td>
									<td>
										with {g.interviewers.map(handle).join(', ')}
										<span class="muted">· {g.currentSize} → {g.currentSize + 1} candidates</span>
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.intro {
		margin: 0 0 12px;
	}
	.add-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0 12px;
	}
	.spaced {
		margin: 12px 0 0;
	}
	.placed-head,
	.option-head {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.placed-head {
		justify-content: space-between;
	}
	.placed-note {
		margin: 4px 0 0;
	}
	.option {
		margin-top: 12px;
		border: 1px solid $border;
		border-radius: $radius;
		padding: 10px 12px;
	}
	.option-head {
		margin-bottom: 6px;
	}
	.option-go {
		margin-left: auto;
	}
	.slot-label {
		width: 110px;
	}
</style>
