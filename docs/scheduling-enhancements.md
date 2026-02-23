# Scheduling Enhancements Plan

Reference: [autoscheduler_prototype](https://github.com/bluescreenjay/autoscheduler_prototype)
— the original Python/OR-Tools scheduler used in Fall 2025 (154 applicants, 250+ interviews).

This doc plans two new capabilities for the batch scheduler:
1. **Relaxed constraint second pass** — schedule the ~10% who fail strict constraints anyway, flagging violations for human review
2. **Attribute-based matching** — pair applicants with interviewers that share relevant attributes (e.g. internal team preferences)

Plus a smaller supporting feature:
3. **Applicant priority weighting** — ensure high-priority applicants are placed first

---

## Background: What the Prototype Did

The prototype ran a two-round strategy with Google OR-Tools' CP-SAT solver:

| Round | Coverage | Notes |
|---|---|---|
| Strict scheduling | 68.8% → 90.9% | No constraint violations allowed |
| Relaxed scheduling | +9.1% | Availability/team violations penalized, not blocked |
| **Total** | **100%** | 28 remaining violations flagged for human review |

Key insight: **complete rejection is worse than a flagged soft placement**. Admins can review 28 flagged entries far faster than manually placing 14 people from scratch.

The current LUMA batch scheduler stops at the "strict" phase — unmatched applicants get `suggestedSlots` but are not actually scheduled.

---

## Feature 1: Relaxed Constraint Second Pass

### How It Works

After the strict scheduling pass in `batch-scheduler.ts`, a second pass runs for all remaining unmatched applicants. In this pass:

- **Availability** is treated as a soft constraint — the applicant is placed even if the slot falls outside their stated availability, but the violation is recorded.
- **Slot capacity** is still a hard constraint (can't over-pack a room).
- Placements from this pass are flagged with `source: 'relaxed'` and a `violations` array.

The objective mirrors the prototype's weighted approach:

| Criterion | Effect |
|---|---|
| Applicant placed | +100 (strongly preferred) |
| Availability violated | −10 per slot-hour outside window |
| Slot already at capacity | blocked (hard) |

Rather than implementing a full CP-SAT solver in TypeScript, the relaxed pass uses a greedy approach:
- Score each available slot for each unmatched applicant: `score = baseScore - violationPenalty`
- Pick the highest-scoring non-full slot
- This approximates the OR-Tools result without the dependency

### Config Changes

New optional fields on `BatchSchedulerConfig`:

```typescript
relaxedFallback?: boolean;           // default false — enable the second pass
relaxedAvailabilityPenalty?: number; // default 10 — penalty weight per availability violation
```

New `configSchema` entry for the batch scheduler:

```typescript
{ key: 'relaxedFallback', label: 'Relaxed fallback (schedule unmatched with flagged violations)', type: 'boolean', default: false }
```

### Type Changes

#### `ProposedInterview` — add violation info

```typescript
export interface ProposedInterview {
  startTime: string;
  endTime: string;
  applicant: string;
  interviewer: string;
  location: string;
  type: 'individual' | 'group';
  jobId: number;
  violations?: ScheduleViolation[]; // new — only present on relaxed placements
}

export type ScheduleViolationType = 'availability' | 'attribute_mismatch';

export interface ScheduleViolation {
  type: ScheduleViolationType;
  detail: string; // human-readable, e.g. "Applicant unavailable at this time"
}
```

#### `SchedulerOutput` — distinguish relaxed placements

```typescript
export interface SchedulerOutput {
  interviews: ProposedInterview[];
  unmatched: string[];
  warnings: string[];
  unmatchedDetails?: UnmatchedApplicant[];
  stats?: BatchRoundStat[];
  relaxedCount?: number; // how many were placed via relaxed pass
}
```

### Algorithm Changes (`batch-scheduler.ts`)

After the existing fill loop (line ~177), before building `unmatchedDetails`:

```
// ── Relaxed second pass ────────────────────────────────────────────────
if (cfg.relaxedFallback) {
  for each unmatched applicant:
    for each round they missed:
      for each slot in that round (sorted by fewest assigned applicants first):
        if slot is full: skip
        score = 100 - (availability violated ? penalty : 0)
        track best-scoring slot
      if best slot found:
        assign applicant with violations: [{ type: 'availability', ... }]
        mark as placed in round
}
```

Stats tracking: `BatchRoundStat` gains `relaxedCount: number`.

### UI Changes

1. **Schedule config panel** — add "Relaxed fallback" toggle in batch scheduler options.
2. **Run results panel** — show relaxed count: "42 scheduled (strict) + 4 flagged (relaxed)".
3. **Calendar / schedule view** — relaxed interviews shown with a distinct indicator (e.g. warning icon, different color, or a "Needs review" badge).
4. **Interview detail / manual edit** — show the violation reason so admins know why it was flagged.

The `source` column already exists on the `interviews` table (added in migration 00009). Add a `violations` JSONB column to store violation details:

```sql
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS violations jsonb;
```

---

## Feature 2: Attribute-Based Matching

### Concept

Applicants express preferences (e.g. "Which team interests you most?") via the question engine. Interviewers/org members belong to teams or have other attributes. The scheduler should prefer placing applicants with interviewers who match their stated preference.

This mirrors the prototype's team-preference matching, which reduced team-mismatch violations by ~71%.

### Data Model

#### Interviewer attributes — `org_members.metadata`

`org_members` currently has no metadata column. Add one:

```sql
ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
```

Admins set attributes per member in the settings UI. Example stored value:

```json
{ "teams": ["engineering", "design"], "seniority": "senior" }
```

This is a free-form `Record<string, string | string[]>` — the scheduler doesn't care about key names; they're configured in the scheduling config.

#### Applicant preference — `applicants.recruitInfo`

No schema change needed. `recruitInfo` is already `Record<string, string>` containing every form answer. If a question with id `team_interest` exists, the answer is at `recruitInfo.team_interest`.

Multi-select checkbox answers are stored as comma-separated strings (current behavior in `QuestionRenderer.svelte`) — the matcher should split on `,`.

### Config Schema

New optional section in `BatchSchedulerConfig`:

```typescript
attributeMatching?: {
  enabled: boolean;
  rules: AttributeMatchRule[];
};

export interface AttributeMatchRule {
  applicantQuestionId: string;    // question id in job_posting.questions, e.g. "team_interest"
  interviewerAttributeKey: string; // key in org_members.metadata, e.g. "teams"
  weight: number;                  // score bonus for a match (e.g. 20)
  hard: boolean;                   // if true, only consider matching interviewers (fall back if none)
}
```

Example config:

```json
{
  "attributeMatching": {
    "enabled": true,
    "rules": [
      {
        "applicantQuestionId": "team_interest",
        "interviewerAttributeKey": "teams",
        "weight": 20,
        "hard": false
      }
    ]
  }
}
```

### `SchedulerInput` Changes

Pass attribute data through to the algorithm:

```typescript
// applicants entry gains:
attributes?: Record<string, string | string[]>; // populated from recruitInfo for matched question IDs

// interviewers entry gains:
attributes?: Record<string, string | string[]>; // populated from org_members.metadata
```

The page server (or supabase util) that builds `SchedulerInput` is responsible for:
1. Reading `org_members.metadata` for each interviewer → `attributes`
2. Reading `applicants.recruitInfo[rule.applicantQuestionId]` for each applicant → `attributes`

### Matching Logic

In the batch scheduler's slot-filling loop, after finding available slots, score interviewers:

```
interviewerScore(applicant, interviewer, rules):
  score = 0
  for each rule:
    applicantValues = applicant.attributes[rule.applicantQuestionId]  // string | string[]
    interviewerValues = interviewer.attributes[rule.interviewerAttributeKey]
    if any overlap between applicantValues and interviewerValues:
      score += rule.weight
  return score
```

For **hard rules**: if no interviewer in the candidate set scores > 0 on any hard rule, fall back to the full set (don't leave the applicant unmatched just for preference reasons).

For **soft rules**: prefer higher-scoring interviewers but don't block on zero score.

This also integrates with the relaxed pass — attribute mismatches can be logged as `ScheduleViolation { type: 'attribute_mismatch' }`.

### UI Changes

#### Member settings page (`/private/[slug]/settings`)

Add an "Attributes" section per member:
- Key-value editor for `org_members.metadata`
- Suggest common keys (teams, role, seniority) but allow free-form

#### Scheduling config panel

Add "Attribute matching" accordion in batch scheduler config:
- Enable/disable toggle
- Add rule button → opens: applicant question selector (dropdown of question IDs from the job's question schema) + interviewer attribute key (text field) + weight (number) + hard/soft toggle
- List of current rules with delete button

---

## Feature 3: Applicant Priority Weighting

### Concept

In the prototype, returning/legacy applicants got +200 weight vs +100 for new applicants, ensuring they're placed in preferred slots. LUMA's batch scheduler already does "most-constrained-first" ordering, but has no concept of applicant tier/priority.

### Data Model

Priority is stored in `applicants.metadata.priority`:

```json
{ "priority": 1 }
```

- `0` (or absent) = normal
- `1` = high priority (scheduled first, even if less constrained)

Admins can set this manually on the review page, or it could be set automatically (e.g. all applicants in a certain status).

### `SchedulerInput` Changes

```typescript
// applicants entry gains:
priority?: number; // 0 = normal, 1 = high
```

### Algorithm Change

In the batch scheduler's applicant sort:

```typescript
// Current: sort by fewest available slots (most constrained first)
// New: sort by (priority DESC, fewest slots ASC)
const sortedApplicants = [...applicants].sort((a, b) => {
  const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  return aSlotCount - bSlotCount; // most constrained first within same priority
});
```

### UI Changes

- Review page: add priority badge/toggle per applicant card
- Scheduling results: show priority tier in stats breakdown

---

## Implementation Order

| Phase | Work | Files Touched |
|---|---|---|
| 1 | Add `violations` to types + `ProposedInterview` | `src/lib/scheduling/types.ts` |
| 2 | Implement relaxed pass in batch scheduler | `src/lib/scheduling/algorithms/batch-scheduler.ts` |
| 3 | Add `relaxedFallback` config field + UI toggle | `batch-scheduler.ts` configSchema, schedule settings UI |
| 4 | DB migration: `org_members.metadata`, `interviews.violations` | new migration file |
| 5 | Thread interviewer + applicant attributes through `SchedulerInput` | `src/lib/utils/supabase.ts`, schedule page server |
| 6 | Attribute matching logic in batch scheduler | `batch-scheduler.ts` |
| 7 | Attribute matching config UI (rule builder) | schedule settings UI |
| 8 | Member attribute editor in settings | `/private/[slug]/settings/+page.svelte` |
| 9 | Priority field + sort | `batch-scheduler.ts`, `src/lib/types/index.ts`, review page |
| 10 | Calendar: show violation badges on flagged interviews | `/private/[slug]/schedule/full/+page.svelte` |

Phase 1–3 (relaxed pass) is self-contained and highest impact — deliverable independently.
Phase 4–8 (attribute matching) requires a DB migration and more UI surface.
Phase 9 (priority) is the simplest and can be slotted anywhere.
