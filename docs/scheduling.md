# Scheduling System

## Overview

LUMA supports two modes of interview scheduling:

1. **Manual scheduling** — recruiters create/edit/delete interviews via a modal form on the schedule pages
2. **Auto-scheduling** — platform admins configure an algorithm per org from the admin panel, preview proposed interviews, and apply them in bulk

---

## Manual Scheduling

On the **Full Schedule** page (`/private/[slug]/schedule/full`):
- Click a time slot or the **Create Interview** button
- Select applicant, interviewer, date/time, location, and type (individual/group)
- Conflict detection warns if the interviewer or applicant already has an overlapping interview
- Edit or delete existing interviews from the calendar view

Manual interviews are stored with `source = 'manual'` and are never modified by auto-scheduling.

---

## Interviewer Availability

Interviewers submit their available windows at **My Availability** (`/private/[slug]/availability`):
- Weekly grid (Mon–Sun) with configurable time range (default 08:00–20:00)
- Click/drag to select available slots
- Saved to the `interviewer_availability` table

The auto-scheduler reads this data to find overlapping windows with applicant availability.

**Applicants with no availability data** are treated as available anytime — the scheduler matches them to any interviewer's open slot.

---

## Auto-Scheduling (Admin Panel)

### Setup

1. Go to **Admin** (`/admin`) → **Scheduling** tab
2. Select an organization
3. Choose an algorithm (greedy-first-available, round-robin, balanced-load, or batch-scheduler)
4. Configure algorithm parameters (slot duration, break time, max interviews per interviewer, location, etc.)

### Preview & Apply

1. Click **Preview** — the algorithm runs in the browser and shows:
   - Proposed interviews (applicant, interviewer, time, location)
   - Unmatched applicants (with reasons)
   - Warnings
   - Stats (for batch scheduler: per-round counts)
2. Review the results, then click **Apply Schedule** to bulk-insert interviews with `source = 'auto'`
3. Click **Send Emails** to open the email notification modal (see [email-notifications.md](email-notifications.md))
4. **Clear Auto-Scheduled** removes all `source = 'auto'` interviews for the org — manual interviews are never touched

### Send Emails

The **Send Emails** button is always available in the scheduling tab. It loads all interviews for the selected org into the `EmailGeneratorModal`, allowing you to send notification emails at any time (not just after applying a schedule).

---

## Algorithms

All algorithms are pure TypeScript modules in `src/lib/scheduling/algorithms/`. Each exports a standard `SchedulingAlgorithm` interface with `id`, `name`, `description`, `configSchema`, and `run()`.

### `greedy-first-available`

Sorts applicants by submission date, then for each applicant finds the first overlapping slot with any available interviewer. Simple, fast, predictable.

**Best for:** Small orgs, straightforward 1:1 scheduling.

### `balanced-load`

Same matching logic as greedy, but prioritizes the interviewer with the fewest assigned interviews. Distributes workload evenly.

**Best for:** Orgs with many interviewers who want fair distribution.

### `round-robin`

Cycles through interviewers in a fixed order. Each gets the next available applicant in sequence.

**Best for:** Strict interviewer rotation.

### `batch-scheduler`

Designed for large cohorts (100+ applicants) across multiple rooms and rounds.

**Best for:** Orgs running structured interview days with parallel rooms and sequential rounds (individual → group).

#### Batch Config

| Field | Type | Description |
|---|---|---|
| `rooms` | `string[]` | Room names used in parallel |
| `rounds` | `BatchRound[]` | Ordered list of interview rounds |
| `sessionWindows` | `BatchSessionWindow[]` | Date + time windows for scheduling |
| `slotStepMinutes` | `number` | Time between slot start times (e.g. 15 min) |
| `blockBreakMinutes` | `number` | Gap between sequential slots |
| `requireAllRounds` | `boolean` | Remove applicants who miss any round |

#### BatchRound Fields

| Field | Description |
|---|---|
| `id` | Unique identifier (e.g. `"individual"`) |
| `label` | Display name |
| `type` | `"individual"` or `"group"` |
| `durationMinutes` | Slot length |
| `groupSize` | Applicants per slot (1 for individual) |
| `interviewersPerRoom` | Interviewers per slot |

#### How It Works

1. **Slot generation** — creates all (room × time × round) slots from session windows
2. **Interviewer assignment** — assigns interviewers to slots based on availability (round-robin fallback if insufficient)
3. **Applicant matching** — sorts by constraint score (most-constrained first), places each in the first available slot
4. **Unmatched output** — missed applicants get `suggestedSlots` listing every slot they could attend

#### Batch Output

The batch scheduler provides additional output:

- `unmatchedDetails[]` — per-applicant: missed rounds + suggested alternative slots
- `stats[]` — per-round: scheduled count, missed count, total slots, filled slots

---

## Algorithm Interface

```typescript
interface SchedulingAlgorithm {
  id: string;
  name: string;
  description: string;
  configSchema: ConfigField[];
  run: (input: SchedulerInput) => SchedulerOutput;
}

interface SchedulerInput {
  applicants: { email: string; name: string; jobId: number; availability: TimeRange[] }[];
  interviewers: { email: string; availability: TimeRange[] }[];
  existingInterviews: { startTime: string; endTime: string; interviewer: string; applicant: string }[];
  config: SchedulerConfig;
}

interface SchedulerOutput {
  interviews: ProposedInterview[];
  unmatched: string[];
  warnings: string[];
  unmatchedDetails?: UnmatchedApplicant[];  // batch scheduler
  stats?: BatchRoundStat[];                 // batch scheduler
}
```

See `src/lib/scheduling/types.ts` for full type definitions.

---

## Database

### `scheduling_config`

Stores per-org (or per-job) scheduling preferences:

```sql
CREATE TABLE public.scheduling_config (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id bigint REFERENCES job_posting(id) ON DELETE CASCADE,
  algorithm_id text NOT NULL DEFAULT 'greedy-first-available',
  config jsonb NOT NULL DEFAULT '{}',
  last_run_at timestamptz,
  last_run_result jsonb,
  UNIQUE (org_id, job_id)
);
```

### `interviewer_availability`

```sql
CREATE TABLE public.interviewer_availability (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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

### `interviews.source`

```sql
-- values: 'manual' | 'auto'
ALTER TABLE public.interviews ADD COLUMN source text NOT NULL DEFAULT 'manual';
```

Auto-scheduling inserts with `source = 'auto'`. The "Clear" button only deletes `source = 'auto'` rows.

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/scheduling/types.ts` | Shared types and interfaces |
| `src/lib/scheduling/registry.ts` | Algorithm registry (exports all available algorithms) |
| `src/lib/scheduling/utils.ts` | Helpers: time overlap, slot generation, conflict checking |
| `src/lib/scheduling/algorithms/greedy-first-available.ts` | Greedy algorithm |
| `src/lib/scheduling/algorithms/balanced-load.ts` | Balanced-load algorithm |
| `src/lib/scheduling/algorithms/round-robin.ts` | Round-robin algorithm |
| `src/lib/scheduling/algorithms/batch-scheduler.ts` | Batch scheduler (multi-room, multi-round) |
| `src/routes/admin/+page.svelte` | Admin panel with scheduling tab |
| `src/routes/private/[slug]/availability/+page.svelte` | Interviewer availability page |
| `src/routes/private/[slug]/schedule/full/+page.svelte` | Full schedule with manual CRUD |

---

## Future Enhancements

See [scheduling-enhancements.md](scheduling-enhancements.md) for planned features:
- Relaxed constraint second pass (schedule unmatched with flagged violations)
- Attribute-based matching (pair applicants with interviewers by team/preference)
- Applicant priority weighting
- Custom algorithm editor (paste JS function)
- Edge Function for cron-triggered auto-scheduling
