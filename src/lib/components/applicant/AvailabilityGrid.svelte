<script lang="ts">
	import { onMount } from 'svelte';

	import type { AvailabilityDay } from '$lib/types';

	type Range = { date: string; start: string; end: string };
	type SlotId = `${string}|${string}`;
	type SupabaseRow = {
		user_id?: string | null;
		date: string;
		start_time: string;
		end_time: string;
		timezone: string;
	};

	let {
		startDate,
		endDate,
		days = [] as AvailabilityDay[],
		dayStart = '09:00',
		dayEnd = '17:00',
		stepMinutes = 30,
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
		initialRanges = [] as Range[],
		dense = false,
		showDayNames = false,
		onchange
	}: {
		startDate?: Date | string;
		endDate?: Date | string;
		/**
		 * Explicit days, each with its own optional window. Overrides
		 * startDate/endDate when non-empty — that is the only way to express a
		 * schedule with a gap in it, or one where Sunday runs different hours
		 * from the weekdays around it.
		 */
		days?: AvailabilityDay[];
		dayStart?: string;
		dayEnd?: string;
		stepMinutes?: number;
		timezone?: string;
		initialRanges?: Range[];
		dense?: boolean;
		showDayNames?: boolean;
		onchange?: (detail: { slots: string[]; ranges: Range[] }) => void;
	} = $props();

	let selected = $state(new Set<SlotId>());
	let isDown = $state(false);
	let dragged = $state(false);
	let addMode = $state(true);
	let startCell = $state<SlotId | null>(null);
	let appliedStartOnDrag = $state(false);
	let focusId = $state<SlotId | null>(null);

	const fmt2 = (n: number) => String(n).padStart(2, '0');
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const monthNames = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	function formatDateHeader(dateStr: string): string {
		if (showDayNames) return dayNames[parseDate(dateStr).getDay()];
		const custom = dayMap.get(dateStr)?.label;
		if (custom) return custom;
		// An explicit day list is usually a handful of scattered dates, where a
		// bare "2026-09-13" makes the reader do calendar arithmetic to notice
		// it is the Sunday. Name the day when we know we picked the days.
		if (days.length) {
			const d = parseDate(dateStr);
			return `${dayNames[d.getDay()]} ${monthNames[d.getMonth()]} ${d.getDate()}`;
		}
		return dateStr;
	}

	/** 24h value in, human label out: `17:00` → `5 PM`, `09:30` → `9:30 AM`. */
	function formatTimeLabel(t: string): string {
		const [h, m] = t.split(':').map(Number);
		const suffix = h < 12 ? 'AM' : 'PM';
		const hour12 = h % 12 === 0 ? 12 : h % 12;
		return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${fmt2(m)} ${suffix}`;
	}

	function parseDate(input: Date | string): Date {
		if (input instanceof Date)
			return new Date(input.getFullYear(), input.getMonth(), input.getDate());
		const [y, m, d] = input.split('-').map(Number);
		return new Date(y, (m as number) - 1, d);
	}

	function minutesBetween(a: string, b: string) {
		const [ah, am] = a.split(':').map(Number);
		const [bh, bm] = b.split(':').map(Number);
		return bh * 60 + bm - (ah * 60 + am);
	}

	function addMinutes(t: string, mins: number) {
		const [h, m] = t.split(':').map(Number);
		const total = h * 60 + m + mins;
		return `${fmt2(Math.floor(total / 60))}:${fmt2(total % 60)}`;
	}

	/**
	 * The rows span every day's window put together, so a Sunday 10–5 block and
	 * weekday 5–9 blocks share one 10 AM–9 PM column of times. Cells outside a
	 * given day's own window are rendered blocked rather than omitted, which
	 * keeps every row aligned across the days.
	 */
	function buildTimes() {
		const starts = days.length ? days.map((d) => d.dayStart ?? dayStart) : [dayStart];
		const ends = days.length ? days.map((d) => d.dayEnd ?? dayEnd) : [dayEnd];
		const from = starts.reduce((a, b) => (a < b ? a : b));
		const to = ends.reduce((a, b) => (a > b ? a : b));
		const out: string[] = [];
		const span = minutesBetween(from, to);
		for (let m = 0; m < span; m += stepMinutes) out.push(addMinutes(from, m));
		return out;
	}

	function buildDates() {
		if (days.length) return days.map((d) => d.date).sort();
		if (!startDate || !endDate) return [];
		const s = parseDate(startDate);
		const e = parseDate(endDate);
		const out: string[] = [];
		for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
			out.push(`${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`);
		}
		return out;
	}

	const dayMap = $derived(new Map(days.map((d) => [d.date, d])));
	const times = $derived(buildTimes());
	const dates = $derived(buildDates());

	/** Is this slot actually on offer, or is it outside that day's window? */
	function isOffered(date: string, time: string): boolean {
		const day = dayMap.get(date);
		const from = day?.dayStart ?? dayStart;
		const to = day?.dayEnd ?? dayEnd;
		return time >= from && time < to;
	}

	$effect(() => {
		if (initialRanges && times.length && dates.length) setFromRanges(initialRanges);
	});

	function slotId(date: string, time: string): SlotId {
		return `${date}|${time}`;
	}

	function setFromRanges(ranges: Range[]) {
		const next = new Set<SlotId>();
		for (const r of ranges) {
			for (let t = r.start; t < r.end; t = addMinutes(t, stepMinutes)) {
				// A saved draft can outlive an edit to the offered days, so drop
				// anything that is no longer on the grid rather than restoring a
				// selection the applicant has no way to see or clear.
				if (times.includes(t) && isOffered(r.date, t)) next.add(slotId(r.date, t));
			}
		}
		selected = next;
	}

	function currentRanges(): Range[] {
		const byDate: Record<string, string[]> = {};
		for (const id of selected) {
			const [date, time] = id.split('|');
			(byDate[date] ||= []).push(time);
		}
		const out: Range[] = [];
		for (const date of Object.keys(byDate)) {
			const ts = byDate[date].sort();
			let start: string | null = null;
			let prev: string | null = null;
			for (const t of ts) {
				if (!start) {
					start = t;
					prev = t;
					continue;
				}
				const expected = addMinutes(prev!, stepMinutes);
				if (t === expected) {
					prev = t;
				} else {
					out.push({ date, start, end: addMinutes(prev!, stepMinutes) });
					start = t;
					prev = t;
				}
			}
			if (start && prev) out.push({ date, start, end: addMinutes(prev, stepMinutes) });
		}
		return out.sort((a, b) =>
			a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1
		);
	}

	function emitChange() {
		onchange?.({ slots: Array.from(selected).sort(), ranges: currentRanges() });
	}

	export function getSelectedRanges(): Range[] {
		return currentRanges();
	}

	export function toSupabaseRows(user_id?: string | null): SupabaseRow[] {
		return currentRanges().map((r) => ({
			user_id: user_id ?? null,
			date: r.date,
			start_time: r.start + ':00',
			end_time: r.end + ':00',
			timezone
		}));
	}

	function applyPaint(date: string, time: string) {
		if (!isOffered(date, time)) return;
		const id = slotId(date, time);
		const next = new Set(selected);
		if (addMode) {
			if (!next.has(id)) next.add(id);
		} else {
			if (next.has(id)) next.delete(id);
		}
		selected = next;
	}

	function pointerDown(e: PointerEvent, date: string, time: string) {
		if (!isOffered(date, time)) return;
		isDown = true;
		dragged = false;
		appliedStartOnDrag = false;
		startCell = slotId(date, time);
		addMode = !selected.has(startCell);
		(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
	}

	function pointerEnter(date: string, time: string) {
		if (!isDown) return;
		if (!appliedStartOnDrag && startCell) {
			const [sd, st] = startCell.split('|');
			applyPaint(sd, st);
			appliedStartOnDrag = true;
		}
		dragged = true;
		applyPaint(date, time);
	}

	function pointerUp() {
		if (!isDown) return;
		isDown = false;
		if (!dragged && startCell) {
			const [d, t] = startCell.split('|');
			applyPaint(d, t);
		}
		startCell = null;
		emitChange();
	}

	function clearAll() {
		selected = new Set();
		emitChange();
	}

	function keyToggle(e: KeyboardEvent, date: string, time: string) {
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			if (!isOffered(date, time)) return;
			const id = slotId(date, time);
			const next = new Set(selected);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			selected = next;
			emitChange();
		}
	}

	onMount(() => {
		const move = (e: PointerEvent) => {
			if (!isDown) return;
			if (!appliedStartOnDrag && startCell) {
				const [sd, st] = startCell.split('|');
				applyPaint(sd, st);
				appliedStartOnDrag = true;
				dragged = true;
			}
			const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
			if (el?.dataset?.slot) {
				const [d, t] = el.dataset.slot.split('|');
				applyPaint(d, t);
				dragged = true;
			}
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', pointerUp);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', pointerUp);
		};
	});
</script>

<div class="controls">
	{#if showDayNames}
		<div class="grid-pill">Weekly Schedule</div>
	{:else if days.length}
		<div class="grid-pill">{dates.length} day{dates.length === 1 ? '' : 's'} offered</div>
	{:else}
		<div class="grid-pill">{dates[0]} → {dates[dates.length - 1]}</div>
	{/if}
	<div class="grid-pill">
		{stepMinutes % 60 === 0 ? `${stepMinutes / 60}h` : `${stepMinutes}m`} blocks
	</div>
	<button class="btn btn-quaternary btn-sm" onclick={clearAll} aria-label="Clear selection">
		Clear
	</button>
	<div class="legend">
		<span class="swatch"></span> Selected (available)
		{#if days.length}<span class="swatch swatch-off"></span> Not offered{/if}
	</div>
</div>

<div class="grid" style={`--cols:${dates.length}`}>
	<div class="row hdr">
		<div class="time" aria-hidden="true">Time</div>
		{#each dates as d}
			<div class="datehdr">{formatDateHeader(d)}</div>
		{/each}
	</div>

	{#each times as t}
		<div class="row">
			<div class="time">{formatTimeLabel(t)}</div>
			{#each dates as d}
				{#key `${d}|${t}`}
					{#if isOffered(d, t)}
						<div
							class="cell {dense ? 'dense' : ''} {selected.has(`${d}|${t}`) ? 'sel' : ''}"
							role="button"
							aria-pressed={selected.has(`${d}|${t}`)}
							aria-label={`Toggle ${formatDateHeader(d)} ${formatTimeLabel(t)}`}
							tabindex="0"
							data-slot={`${d}|${t}`}
							onpointerdown={(e) => pointerDown(e, d, t)}
							onpointerenter={() => pointerEnter(d, t)}
							onkeydown={(e) => keyToggle(e, d, t)}
							onfocus={() => (focusId = `${d}|${t}` as SlotId)}
						></div>
					{:else}
						<!-- Outside this day's window. Kept in the DOM, without a
						     data-slot, so the drag handler cannot paint it and the
						     rows stay aligned across days with different hours. -->
						<div class="cell off {dense ? 'dense' : ''}" aria-hidden="true"></div>
					{/if}
				{/key}
			{/each}
		</div>
	{/each}
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	// The grid layout below is genuinely bespoke — nothing in ui.scss paints a
	// drag-to-select availability matrix. Only the colours come from tokens.
	$slot-fill: rgba($success, 0.35);

	.grid {
		overflow: auto;
		border: 1px solid $border;
		border-radius: $radius-lg;
		user-select: none;
	}
	.hdr {
		position: sticky;
		top: 0;
		background: $surface;
		z-index: 2;
	}
	.row {
		display: grid;
		grid-template-columns: 100px repeat(var(--cols), 1fr);
	}
	.time {
		color: $text-body;
		border-right: 1px solid $border;
		font-size: 12px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 8px;
	}
	.cell {
		height: 36px;
		border-right: 1px solid $border;
		border-bottom: 1px dotted $border;
		cursor: pointer;
		position: relative;
		touch-action: none;
	}
	.cell.dense {
		height: 24px;
	}
	.cell.sel {
		background: $slot-fill;
	}
	// Hatched, not merely tinted. A flat tint against a white cell is a contrast
	// difference an applicant has to squint at to read; the stripes say "nothing
	// to click here" at a glance and survive a colour-blind or dimmed screen.
	.cell.off {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 4px,
				rgba($dark-primary, 0.07) 4px,
				rgba($dark-primary, 0.07) 8px
			),
			$surface-sunken;
		cursor: default;
	}
	.cell:focus {
		outline: 2px solid $success;
		outline-offset: -2px;
	}
	.datehdr {
		padding: 10px;
		text-align: center;
		font-weight: 600;
		border-right: 1px solid $border;
	}
	.controls {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
		flex-wrap: wrap;
	}
	// Named `grid-pill`, not `pill`: `.pill` is a shared uppercase badge in
	// ui.scss and would otherwise restyle these range labels.
	.grid-pill {
		border: 1px solid $border;
		padding: 6px 10px;
		border-radius: $radius-pill;
		font-size: 12px;
	}
	.legend {
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 12px;
		color: $text-body;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: $radius-sm;
		background: $slot-fill;
		border: 1px solid $success;
	}
	.swatch-off {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 2px,
				rgba($dark-primary, 0.25) 2px,
				rgba($dark-primary, 0.25) 4px
			),
			$surface-sunken;
		border-color: $border;
		margin-left: 10px;
	}
</style>
