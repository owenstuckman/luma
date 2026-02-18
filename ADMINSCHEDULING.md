# Admin Scheduling Plan

## Context

LUMA currently has:
- An `interviews` table with `startTime`, `endTime`, `location`, `type`, `job`, `applicant`, `interviewer`, `org_id`
- CRUD functions (`createInterview`, `updateInterview`, `deleteInterview`) that **no UI calls yet**
- Read-only calendar views on the schedule pages (@schedule-x)
- An `AvailabilityGrid` component applicants use during applications — availability is stored as JSON ranges inside `recruitInfo` but not in a dedicated table
- A `job_posting.schedule` JSON field that is currently empty/unused
- No scheduling algorithm, no conflict detection, no manual creation UI

## Two Capabilities

### 1. Manual Scheduling (Recruiter Dashboard)

Recruiters can create/edit/delete interviews by hand from within their org dashboard. This is a straightforward UI task — a modal form on the schedule page that calls the existing `createInterview`/`updateInterview`/`deleteInterview` functions. Not covered in this document (separate implementation task).

### 2. Algorithm-Based Scheduling (Admin View) — this document

Platform admins configure **how** interviews get auto-scheduled for each organization. The admin panel gets a new "Scheduling" tab where admins can pick an algorithm per org (or per job posting) and tune its parameters.

---

## Design Goals

1. **Pluggable** — new algorithms can be added without touching the core scheduler runner
2. **Transparent** — admins can see what the algorithm will do before committing (dry-run / preview)
3. **Safe** — auto-scheduling never overwrites manually-created interviews
4. **Org-scoped** — each org (or job posting) can use a different algorithm
5. **No external infra** — everything runs either in the browser or in a Supabase Edge Function (no separate scheduler service)

---

## Architecture Decision: Where Algorithms Run

| Approach | Pros | Cons |
|----------|------|------|
| **A. Browser-side (client JS)** | Zero infra, instant preview, easy to iterate, user can inspect/tweak results before saving | Limited by browser memory for huge datasets, can't run on a timer/cron |
| **B. Supabase Edge Function** | Can run on cron, handles large datasets, keeps logic server-side | Harder to preview, deploy step required, 50s execution limit |
| **C. Codebase module (imported JS)** | Shared between browser and Edge Function, testable with unit tests | Needs a clean interface so the same code works in both contexts |

### Recommendation: **C → A+B**

Write algorithms as **pure TypeScript modules** in the codebase (`src/lib/scheduling/algorithms/`). Each module exports a function with a standard signature. These modules can be:
- Imported **in the browser** for instant dry-run previews in the admin UI
- Imported **in an Edge Function** for cron-triggered auto-scheduling

This gives maximum flexibility with no external infra.

---

## Algorithm Interface

```typescript
// src/lib/scheduling/types.ts

export interface SchedulerInput {
  applicants: {
    email: string;
    name: string;
    jobId: number;
    availability: TimeRange[];   // from their application
  }[];
  interviewers: {
    email: string;
    availability: TimeRange[];   // from interviewer availability table
  }[];
  existingInterviews: {
    startTime: string;
    endTime: string;
    interviewer: string;
    applicant: string;
  }[];
  config: SchedulerConfig;
}

export interface SchedulerConfig {
  slotDurationMinutes: number;     // e.g. 30
  breakBetweenMinutes: number;     // e.g. 10
  maxInterviewsPerInterviewer: number;
  interviewType: 'individual' | 'group';
  groupSize?: number;              // for group interviews
  location: string;
  [key: string]: unknown;          // algorithm-specific params
}

export interface SchedulerOutput {
  interviews: ProposedInterview[];
  unmatched: string[];             // applicant emails that couldn't be scheduled
  warnings: string[];
}

export interface ProposedInterview {
  startTime: string;
  endTime: string;
  applicant: string;
  interviewer: string;
  location: string;
  type: 'individual' | 'group';
  jobId: number;
}

export interface TimeRange {
  date: string;      // YYYY-MM-DD
  start: string;     // HH:mm
  end: string;       // HH:mm
}

// Every algorithm exports this shape
export interface SchedulingAlgorithm {
  id: string;
  name: string;
  description: string;
  configSchema: ConfigField[];     // describes the tunable params for the admin UI
  run: (input: SchedulerInput) => SchedulerOutput;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  default: unknown;
  options?: { label: string; value: unknown }[];  // for select type
}
```

---

## Built-in Algorithms

### 1. `greedy-first-available`
- Sorts applicants by submission date
- For each applicant, finds the first overlapping slot with any available interviewer
- Assigns it, marks both as busy for that slot
- Simple, fast, predictable
- **Best for**: small orgs, straightforward scheduling

### 2. `balanced-load`
- Same matching logic but prioritizes even distribution across interviewers
- Picks the interviewer with the fewest assigned interviews who has an overlapping slot
- **Best for**: orgs with many interviewers who want fair workload

### 3. `round-robin`
- Cycles through interviewers in a fixed order
- Each interviewer gets the next available applicant in sequence
- Skips if no overlapping availability, moves to next interviewer
- **Best for**: orgs that want strict rotation

### 4. `custom` (future)
- Admin pastes a JS function body into a code editor in the browser
- Function receives `SchedulerInput`, must return `SchedulerOutput`
- Runs in a sandboxed `new Function()` or Web Worker
- **Best for**: power users with unique constraints

---

## File Structure

```
src/lib/scheduling/
  types.ts                          — shared types (above)
  registry.ts                       — exports array of all available algorithms
  algorithms/
    greedy-first-available.ts       — algorithm #1
    balanced-load.ts                — algorithm #2
    round-robin.ts                  — algorithm #3
```

### Registry

```typescript
// src/lib/scheduling/registry.ts
import { greedyFirstAvailable } from './algorithms/greedy-first-available';
import { balancedLoad } from './algorithms/balanced-load';
import { roundRobin } from './algorithms/round-robin';
import type { SchedulingAlgorithm } from './types';

export const algorithms: SchedulingAlgorithm[] = [
  greedyFirstAvailable,
  balancedLoad,
  roundRobin,
];

export function getAlgorithm(id: string): SchedulingAlgorithm | undefined {
  return algorithms.find(a => a.id === id);
}
```

---

## Database Changes

### 1. `scheduling_config` table

Stores per-org or per-job scheduling preferences.

```sql
CREATE TABLE public.scheduling_config (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id bigint REFERENCES job_posting(id) ON DELETE CASCADE,
  algorithm_id text NOT NULL DEFAULT 'greedy-first-available',
  config jsonb NOT NULL DEFAULT '{}',
  last_run_at timestamptz,
  last_run_result jsonb,
  UNIQUE (org_id, job_id)
);
```

- `job_id = NULL` means org-wide default
- `config` stores the algorithm-specific parameters (slot duration, break time, etc.)
- `last_run_result` stores summary of the most recent auto-schedule run

### 2. `interviewer_availability` table

Interviewers need to specify when they're free (mirroring applicant availability).

```sql
CREATE TABLE public.interviewer_availability (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  UNIQUE (org_id, user_id, date, start_time)
);
```

### 3. Add `source` column to `interviews`

Track whether an interview was manually created or auto-scheduled.

```sql
ALTER TABLE public.interviews
  ADD COLUMN source text NOT NULL DEFAULT 'manual';
  -- values: 'manual', 'auto'
```

---

## Admin UI

New section in the admin panel (`/admin` page) — or a dedicated `/admin/scheduling` route.

### Tab: "Scheduling"

#### Per-Org Config Panel

1. **Org selector** — dropdown of all orgs (reuse existing admin org list)
2. **Algorithm picker** — radio cards showing each algorithm's `name` and `description` from the registry
3. **Config form** — dynamically rendered from the algorithm's `configSchema` (number inputs, selects, toggles)
4. **Save** — writes to `scheduling_config` table

#### Dry Run / Preview

1. **"Preview" button** — fetches applicants + interviewer availability for the selected org/job, runs the algorithm **in the browser**, displays:
   - Proposed interviews in a table (applicant, interviewer, time, location)
   - Unmatched applicants list
   - Warnings
2. **"Apply" button** — bulk-inserts the proposed interviews into the `interviews` table with `source = 'auto'`
3. **"Clear Auto-Scheduled" button** — deletes all interviews where `source = 'auto'` for the org/job (safe undo)

#### Flow

```
Admin picks org → picks algorithm → tweaks config → clicks Preview
  → sees proposed schedule in a table
  → clicks Apply to commit
  → interviews appear on recruiter calendar pages
```

---

## Recruiter-Side: Interviewer Availability

For algorithms to work, interviewers need to submit their availability. Two options:

### Option A: Reuse AvailabilityGrid

Add an "My Availability" section to the recruiter's "My Schedule" page (`schedule/my/+page.svelte`). Reuse the existing `AvailabilityGrid` component (same one applicants use). On save, write rows to `interviewer_availability`.

### Option B: Calendar Click-to-Add

Let interviewers click empty slots on their @schedule-x calendar to mark themselves as available. More integrated but requires custom calendar interaction code.

**Recommendation**: Option A — reuse AvailabilityGrid. It already works, handles drag-select, and exports structured ranges. Minimal new code.

---

## Edge Function (Optional, Phase 2)

For orgs that want auto-scheduling on a cron (e.g. "schedule all pending applicants every night"):

```
supabase/functions/auto-schedule/index.ts
```

- Reads `scheduling_config` for orgs with `algorithm_id` set
- Imports the same algorithm modules
- Runs the algorithm, inserts interviews with `source = 'auto'`
- Triggered by Supabase cron or a pg_cron job

This is optional — the browser-based dry-run covers the primary use case. Cron is a nice-to-have for large orgs.

---

## Implementation Phases

### Phase A: Foundation
- [ ] Create `scheduling_config` and `interviewer_availability` tables (migration)
- [ ] Add `source` column to `interviews`
- [ ] Define `src/lib/scheduling/types.ts`
- [ ] Implement `greedy-first-available` algorithm
- [ ] Create algorithm registry

### Phase B: Admin UI
- [ ] Add "Scheduling" section to admin panel
- [ ] Org selector + algorithm picker + config form
- [ ] Preview (dry-run) button — runs algorithm in browser, shows results table
- [ ] Apply button — bulk insert proposed interviews
- [ ] Clear auto-scheduled button

### Phase C: Interviewer Availability
- [ ] Add AvailabilityGrid to recruiter "My Schedule" page
- [ ] CRUD functions for `interviewer_availability`
- [ ] Wire availability data into scheduler input

### Phase D: More Algorithms
- [ ] Implement `balanced-load`
- [ ] Implement `round-robin`
- [ ] (Optional) Custom JS editor for power users

### Phase E: Edge Function (Optional)
- [ ] Deploy Edge Function that runs scheduling on cron
- [ ] Admin UI toggle to enable/disable cron per org

---

## Key Decisions Still Open

1. **Applicant availability persistence** — currently lives in `recruitInfo` JSON. Should it be extracted into a dedicated table for easier querying, or is parsing from JSON acceptable?
2. **Group interviews** — how should the algorithm handle group slots (multiple applicants per slot)? Separate algorithm or a config toggle?
3. **Notifications** — should auto-scheduling trigger email notifications to applicants/interviewers? (Requires email integration, possibly out of scope for MVP.)
4. **Timezone handling** — store all times in UTC and convert on display, or store with timezone offset?
