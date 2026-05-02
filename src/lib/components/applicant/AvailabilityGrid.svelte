<script lang="ts">
  import { onMount } from 'svelte';

  type Range = { date: string; start: string; end: string };
  type SlotId = `${string}|${string}`;
  type SupabaseRow = { user_id?: string | null; date: string; start_time: string; end_time: string; timezone: string };

  let {
    startDate,
    endDate,
    dayStart = '09:00',
    dayEnd = '17:00',
    stepMinutes = 30,
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    initialRanges = [] as Range[],
    dense = false,
    showDayNames = false,
    onchange
  }: {
    startDate: Date | string;
    endDate: Date | string;
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

  function formatDateHeader(dateStr: string): string {
    if (!showDayNames) return dateStr;
    const d = parseDate(dateStr);
    return dayNames[d.getDay()];
  }

  function parseDate(input: Date | string): Date {
    if (input instanceof Date) return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, (m as number) - 1, d);
  }

  function minutesBetween(a: string, b: string) {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
  }

  function addMinutes(t: string, mins: number) {
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${fmt2(Math.floor(total / 60))}:${fmt2(total % 60)}`;
  }

  function buildTimes() {
    const out: string[] = [];
    const span = minutesBetween(dayStart, dayEnd);
    for (let m = 0; m < span; m += stepMinutes) out.push(addMinutes(dayStart, m));
    return out;
  }

  function buildDates() {
    const s = parseDate(startDate);
    const e = parseDate(endDate);
    const out: string[] = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      out.push(`${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`);
    }
    return out;
  }

  const times = $derived(buildTimes());
  const dates = $derived(buildDates());

  $effect(() => {
    if (initialRanges && times.length && dates.length) setFromRanges(initialRanges);
  });

  function slotId(date: string, time: string): SlotId { return `${date}|${time}`; }

  function setFromRanges(ranges: Range[]) {
    const next = new Set<SlotId>();
    for (const r of ranges) {
      for (let t = r.start; t < r.end; t = addMinutes(t, stepMinutes)) {
        if (times.includes(t)) next.add(slotId(r.date, t));
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
        if (!start) { start = t; prev = t; continue; }
        const expected = addMinutes(prev!, stepMinutes);
        if (t === expected) { prev = t; }
        else { out.push({ date, start, end: addMinutes(prev!, stepMinutes) }); start = t; prev = t; }
      }
      if (start && prev) out.push({ date, start, end: addMinutes(prev, stepMinutes) });
    }
    return out.sort((a, b) => a.date === b.date ? (a.start < b.start ? -1 : 1) : (a.date < b.date ? -1 : 1));
  }

  function emitChange() {
    onchange?.({ slots: Array.from(selected).sort(), ranges: currentRanges() });
  }

  export function getSelectedRanges(): Range[] { return currentRanges(); }

  export function toSupabaseRows(user_id?: string | null): SupabaseRow[] {
    return currentRanges().map(r => ({
      user_id: user_id ?? null,
      date: r.date,
      start_time: r.start + ':00',
      end_time: r.end + ':00',
      timezone
    }));
  }

  function applyPaint(date: string, time: string) {
    const id = slotId(date, time);
    const next = new Set(selected);
    if (addMode) { if (!next.has(id)) next.add(id); }
    else { if (next.has(id)) next.delete(id); }
    selected = next;
  }

  function pointerDown(e: PointerEvent, date: string, time: string) {
    isDown = true; dragged = false; appliedStartOnDrag = false;
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

  function clearAll() { selected = new Set(); emitChange(); }

  function keyToggle(e: KeyboardEvent, date: string, time: string) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const id = slotId(date, time);
      const next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
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

<style>
  :root { --cell: 36px; --border: #e5e7eb; --muted:#6b7280; --sel:#a7f3d0; --selEdge:#10b981; }
  .grid { overflow:auto; border:1px solid var(--border); border-radius: 14px; user-select: none; }
  .hdr { position: sticky; top: 0; background: white; z-index: 2; }
  .row { display: grid; grid-template-columns: 100px repeat(var(--cols), 1fr); }
  .time { color: var(--muted); border-right: 1px solid var(--border); font-size: 12px; display:flex; align-items:center; justify-content:flex-end; padding-right:8px; }
  .cell { height: var(--cell); border-right: 1px solid var(--border); border-bottom: 1px dotted var(--border); cursor: pointer; position: relative; touch-action: none; }
  .cell.dense { height: 24px; }
  .cell.sel { background: var(--sel); }
  .cell:focus { outline: 2px solid var(--selEdge); outline-offset: -2px; }
  .datehdr { padding: 10px; text-align:center; font-weight:600; border-right: 1px solid var(--border); }
  .controls { display:flex; gap:8px; align-items:center; margin-bottom: 8px; flex-wrap: wrap; }
  .pill { border:1px solid var(--border); padding: 6px 10px; border-radius: 999px; font-size: 12px; }
  .btn { padding: 8px 12px; border:1px solid var(--border); border-radius: 10px; background: #111827; color: white; font-weight:600; }
  .btn.ghost { background: white; color: #111827; }
  .legend { display:flex; gap:10px; align-items:center; font-size:12px; color: var(--muted); }
  .swatch { width:14px; height:14px; border-radius:4px; background: var(--sel); border: 1px solid var(--selEdge); }
</style>

<div class="controls">
  {#if showDayNames}
    <div class="pill">Weekly Schedule</div>
  {:else}
    <div class="pill">{dates[0]} → {dates[dates.length - 1]}</div>
  {/if}
  <div class="pill">{dayStart}–{dayEnd} / {stepMinutes}m</div>
  <button class="btn ghost" onclick={clearAll} aria-label="Clear selection">Clear</button>
  <div class="legend"><span class="swatch"></span> Selected (available)</div>
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
      <div class="time">{t}</div>
      {#each dates as d}
        {#key `${d}|${t}`}
          <div
            class="cell {dense ? 'dense' : ''} {selected.has(`${d}|${t}`) ? 'sel' : ''}"
            role="button"
            aria-pressed={selected.has(`${d}|${t}`)}
            aria-label={`Toggle ${d} ${t}`}
            tabindex="0"
            data-slot={`${d}|${t}`}
            onpointerdown={(e) => pointerDown(e, d, t)}
            onpointerenter={() => pointerEnter(d, t)}
            onkeydown={(e) => keyToggle(e, d, t)}
            onfocus={() => (focusId = `${d}|${t}` as SlotId)}
          ></div>
        {/key}
      {/each}
    </div>
  {/each}
</div>
