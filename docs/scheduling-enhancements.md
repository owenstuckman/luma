# Scheduling Enhancements

Reference: [autoscheduler_prototype](https://github.com/bluescreenjay/autoscheduler_prototype)
— the original Python/OR-Tools scheduler used in Fall 2025 (154 applicants, 250+ interviews).

---

## Implemented Features

### 1. Relaxed Constraint Second Pass (DONE)

After the strict scheduling pass, a second pass runs for unmatched applicants with soft constraints:

- **Availability** is treated as a soft constraint — applicants are placed even outside their stated availability, with the violation recorded
- **Slot capacity** remains a hard constraint
- Placements are flagged with `violations[]` on the `ProposedInterview`

**Config:** `relaxedFallback: true` enables the pass, `relaxedAvailabilityPenalty: number` controls the score penalty (default 10).

**Scoring:** Each candidate slot gets `score = 100 - (penalty if unavailable) + attributeMatchBonus`. The highest-scoring non-full slot is picked.

**Files:** `src/lib/scheduling/algorithms/batch-scheduler.ts` (pickBestSlot function, relaxed pass loop)

### 2. Attribute-Based Matching (DONE)

Applicants express preferences via the question engine (e.g. "Which team interests you?"). Interviewers have attributes in `org_members.metadata`. The scheduler prefers placing applicants with matching interviewers.

**Config:**
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

- **Soft rules** (`hard: false`): prefer matching interviewers, allow fallback
- **Hard rules** (`hard: true`): restrict to matching interviewers if any exist, fall back to all if none match
- Mismatches logged as `ScheduleViolation { type: 'attribute_mismatch' }`

**Files:** `src/lib/scheduling/algorithms/batch-scheduler.ts` (normalizeAttr, slotAttributeScore, hasHardRuleMatch), `src/lib/scheduling/types.ts` (AttributeMatchRule)

### 3. Applicant Priority Weighting (DONE)

High-priority applicants are scheduled first, even if less constrained.

**Data:** `applicants[].priority` — `0` (or absent) = normal, `1` = high priority

**Sort order:** `(priority DESC, fewest available slots ASC)` — high-priority applicants go first, then most-constrained within the same priority tier.

**Files:** `src/lib/scheduling/algorithms/batch-scheduler.ts` (sortedApplicants sort)

---

## Remaining / Future

### Custom Algorithm Editor

Admin pastes a JS function body into a code editor in the browser. The function receives `SchedulerInput` and must return `SchedulerOutput`. Runs sandboxed (eval or Function constructor with timeout). For power users with unique constraints.

### Edge Function for Cron-Triggered Auto-Scheduling

A Supabase Edge Function that reads `scheduling_config` for orgs with an algorithm set, runs the algorithm, and inserts interviews with `source = 'auto'`. Triggered by `pg_cron`. Optional — the browser-based dry-run covers the primary use case.

---

## Types Reference

```typescript
interface ScheduleViolation {
  type: 'availability' | 'attribute_mismatch';
  detail: string;
}

interface AttributeMatchRule {
  applicantQuestionId: string;
  interviewerAttributeKey: string;
  weight: number;
  hard: boolean;
}
```

See `src/lib/scheduling/types.ts` for full definitions.
