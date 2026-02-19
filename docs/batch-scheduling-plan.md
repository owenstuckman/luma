# Batch Scheduling — Implementation Plan

## Problem

The existing scheduling algorithms (greedy, balanced-load, round-robin) each schedule one round, using a single location string. They don't support:

- Multiple rooms running in parallel (e.g. 10 rooms simultaneously)
- Multiple rounds in sequence (e.g. individual interview → group interview)
- Large-scale throughput (100s of applicants)
- Useful output for applicants the algo misses

## Real-World Model (from Archimedes data)

From the production data in Supabase:
- **178 individual interviews** across 6+ rooms in parallel (20 min each, one applicant + one interviewer per room)
- **712 group interview rows** = 178 applicants × 4 interviewers, in large group sessions (~9 applicants per room)
- Individual → group rounds were scheduled back-to-back on the same evening
- Rooms used: MCB230, MCB231, MCB232, MCB233, MCB304, MCB316, MCB321, MCB328, MCB332, MCB134, MCB136

## Design Decisions

1. **Rounds are scheduled independently** — individual and group rounds don't have to be back-to-back. Applicants are matched to available slots per round, which gives maximum flexibility (individual interviews Tuesday, group interviews Thursday, etc.). An ordering constraint (`roundOrderConstraint`) can enforce that applicants complete rounds in sequence if needed.

2. **Slots are generated per room × time window** — the admin provides a list of rooms and session windows (date + start/end time). The algo fills all rooms in parallel.

3. **Group slots aggregate multiple applicants** — a group slot has capacity=groupSize; multiple applicants fill the same slot/room/time.

4. **Interviewers are optional** — if interviewer availability isn't loaded, slots are still generated and interviewers assigned round-robin from the provided list. "Any available" mode works for orgs that assign interviewers manually after scheduling.

5. **Misses are surfaced, not hidden** — unmatched applicants get a list of slots they *could* attend (even if full), so recruiters can manually override. They're returned in `unmatchedDetails` with structured data.

6. **Backward compatible** — existing `SchedulingAlgorithm` interface is kept. `SchedulerOutput` gets optional `unmatchedDetails` and `stats` fields.

---

## Changes

### 1. `src/lib/scheduling/types.ts`

Add:
- `BatchRound` — one round's config (type, duration, group size, interviewers per room)
- `BatchSessionWindow` — a date + time window when scheduling can happen
- `BatchSchedulerConfig` — full config for the batch algorithm (extends SchedulerConfig via index signature)
- `UnmatchedApplicant` — richer unmatched output with missed rounds + suggested slots
- Extend `SchedulerOutput` with optional `unmatchedDetails?` and `stats?`

### 2. `src/lib/scheduling/utils.ts`

Add:
- `applicantAvailableAt(availability, date, startMins, endMins)` — checks if a TimeRange[] covers a specific slot
- `generateRoomSlots(config)` — generates all (room, date, startTime, endTime) slots from session windows

### 3. `src/lib/scheduling/algorithms/batch-scheduler.ts` (NEW)

Core algorithm:
1. Parse `BatchSchedulerConfig` from input config
2. Generate all slots per round (room × session window × time steps)
3. Assign interviewers to each slot (by availability or round-robin)
4. For each round, sort applicants by constraint score (fewest available slots first)
5. Fill slots: for each applicant, find first slot with capacity and matching availability
6. Collect unmatched: for each missed applicant per round, enumerate slots they could attend
7. Apply `requireAllRounds`: if an applicant misses any round and this flag is set, remove all their assignments
8. Return `SchedulerOutput` with `unmatchedDetails` and `stats`

### 4. `src/lib/scheduling/registry.ts`

Register `batchScheduler` in the `algorithms` array.

### 5. `docs/scheduling.md`

Add documentation for the batch scheduler, its config schema, and how to use it.

---

## Batch Config Schema

```json
{
  "rooms": ["MCB230", "MCB231", "MCB232"],
  "rounds": [
    {
      "id": "individual",
      "label": "Individual Interview",
      "type": "individual",
      "durationMinutes": 20,
      "breakBeforeMinutes": 0,
      "groupSize": 1,
      "interviewersPerRoom": 1
    },
    {
      "id": "group",
      "label": "Group Interview",
      "type": "group",
      "durationMinutes": 40,
      "breakBeforeMinutes": 10,
      "groupSize": 8,
      "interviewersPerRoom": 3
    }
  ],
  "sessionWindows": [
    { "date": "2025-09-13", "startTime": "09:00", "endTime": "17:00" }
  ],
  "slotStepMinutes": 15,
  "blockBreakMinutes": 5,
  "requireAllRounds": false
}
```

## Unmatched Applicant Output

```typescript
{
  email: "student@vt.edu",
  name: "Jane Smith",
  missedRounds: ["individual"],
  suggestedSlots: [
    {
      roundId: "individual",
      date: "2025-09-13",
      startTime: "14:00",
      endTime: "14:20",
      room: "MCB232",
      isFull: false
    }
  ]
}
```
