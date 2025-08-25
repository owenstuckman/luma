<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
  
    /**
     * AvailabilityGrid.svelte — pointer-based interactions
     * Supports: single click/tap, click-drag/pen-drag paint/erase
     * Avoids double-toggles by applying action on pointerup when no drag
     */
  
    type Range = { date: string; start: string; end: string };
    type SlotId = `${string}|${string}`; // date|HH:mm
    type SupabaseRow = { user_id?: string | null; date: string; start_time: string; end_time: string; timezone: string };
  
    export let startDate: Date | string;
    export let endDate: Date | string;
    export let dayStart = '09:00';
    export let dayEnd = '17:00';
    export let stepMinutes = 30;
    export let timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
    export let initialRanges: Range[] = [];
    export let dense = false; // tighter row height
  
    const dispatch = createEventDispatcher();
  
    let dates: string[] = []; // YYYY-MM-DD
    let times: string[] = []; // HH:mm across the day window
    let selected = new Set<SlotId>();
  
    // Pointer interaction state
    let isDown = false;
    let dragged = false;
    let addMode = true; // painting adds (true) or removes (false)
    let startCell: SlotId | null = null;
    let appliedStartOnDrag = false;
  
    const fmt2 = (n: number) => String(n).padStart(2, '0');
  
    function toISODate(d: Date) {
      const y = d.getFullYear();
      const m = fmt2(d.getMonth() + 1);
      const day = fmt2(d.getDate());
      return `${y}-${m}-${day}`;
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
      for (let m = 0; m < span; m += stepMinutes) {
        out.push(addMinutes(dayStart, m));
      }
      return out;
    }
  
    function buildDates() {
      const s = parseDate(startDate);
      const e = parseDate(endDate);
      const out: string[] = [];
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        out.push(toISODate(d));
      }
      return out;
    }
  
    function slotId(date: string, time: string): SlotId { return `${date}|${time}`; }
  
    function setFromRanges(ranges: Range[]) {
      selected.clear();
      for (const r of ranges) {
        for (let t = r.start; t < r.end; t = addMinutes(t, stepMinutes)) {
          if (times.includes(t)) selected.add(slotId(r.date, t));
        }
      }
      selected = new Set(selected); // force reactivity
    }
  
    function currentRanges(): Range[] {
      // compress contiguous slots per date
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
          if (t === expected) {
            prev = t;
          } else {
            out.push({ date, start, end: addMinutes(prev!, stepMinutes) });
            start = t; prev = t;
          }
        }
        if (start && prev) out.push({ date, start, end: addMinutes(prev, stepMinutes) });
      }
      // stable sort by date then start
      return out.sort((a,b) => a.date === b.date ? (a.start < b.start ? -1 : 1) : (a.date < b.date ? -1 : 1));
    }
  
    function emitChange() {
      dispatch('change', { slots: Array.from(selected).sort(), ranges: currentRanges() });
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
  
    // ===== Pointer logic =====
    function applyPaint(date: string, time: string) {
      const id = slotId(date, time);
      if (addMode) {
        if (!selected.has(id)) { selected.add(id); selected = new Set(selected); }
      } else {
        if (selected.has(id)) { selected.delete(id); selected = new Set(selected); }
      }
    }
  
    function pointerDown(e: PointerEvent, date: string, time: string) {
      isDown = true;
      dragged = false;
      appliedStartOnDrag = false;
      startCell = slotId(date, time);
      const exists = selected.has(startCell);
      addMode = !exists; // if cell empty, we'll add; if filled, we'll erase
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
      // If no drag happened, this was a simple click: toggle start cell
      if (!dragged && startCell) {
        const [d, t] = startCell.split('|');
        // Toggle once according to addMode
        applyPaint(d, t);
      }
      startCell = null;
      emitChange();
    }
  
    function clearAll() {
      selected = new Set();
      emitChange();
    }
  
    // keyboard support: space/enter toggles focused cell
    let focusId: SlotId | null = null;
    function keyToggle(e: KeyboardEvent, date: string, time: string) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const id = slotId(date, time);
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        selected = new Set(selected);
        emitChange();
      }
    }
  
    $: times = buildTimes();
    $: dates = buildDates();
    $: if (initialRanges && times.length && dates.length) { setFromRanges(initialRanges); }
  
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
        if (el && el.dataset && el.dataset.slot) {
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
    <div class="pill">{dates[0]} → {dates[dates.length - 1]}</div>
    <div class="pill">{dayStart}–{dayEnd} / {stepMinutes}m</div>
    <button class="btn ghost" on:click={clearAll} aria-label="Clear selection">Clear</button>
    <div class="legend"><span class="swatch"></span> Selected (available)</div>
  </div>
  
  <div class="grid" style={`--cols:${dates.length}`}> 
    <!-- Header row -->
    <div class="row hdr">
      <div class="time" aria-hidden>Time</div>
      {#each dates as d}
        <div class="datehdr">{d}</div>
      {/each}
    </div>
  
    <!-- Time rows -->
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
              on:pointerdown={(e) => pointerDown(e, d, t)}
              on:pointerenter={() => pointerEnter(d, t)}
              on:keydown={(e) => keyToggle(e, d, t)}
              on:focus={() => (focusId = `${d}|${t}` as SlotId)}
            ></div>
          {/key}
        {/each}
      </div>
    {/each}
  </div>
  