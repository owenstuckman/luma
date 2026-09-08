# Fall 2026 interview rooms — Archimedes

Room bookings for the 2026 Fall Recruitment cycle (job posting `7`, org `archimedes`).
Supplied by Owen 2026-09-07. **These are the authoritative bookings** — the scheduler must
not place an interview in a room/time that does not appear below.

The windows here line up with the interview availability applicants were asked for
(`interview_availability` on job 7): weekday evenings and Sunday daytime, no Saturday.

## ⚠️ Read before running the scheduler

**The batch scheduler takes ONE flat room list and applies every room to every session
window** (`generateRoomSlots()` in `src/lib/scheduling/utils.ts` — `rooms: string[]` crossed
with `sessionWindows`). It has no concept of a room being booked on some days and not
others, or of two rooms on the same day having different start times.

Both of those are true here. MCB 134 exists only on the 11th and 13th; MCB 238 is not booked
on the 11th or 14th; the 9th has two different start times; the 14th ends at 8:30, not 9.

Pasting itself is now forgiving — the Rooms box takes the blocks below verbatim,
`September 9th:` heading and `@ 5-9PM` annotations included, and strips them (see
`parseRoomList()`). What it cannot do is infer which day a room belongs to.

So **do not paste the union of all rooms into one run** — it will book rooms that were never
reserved. Until the scheduler understands per-day rooms, **run it once per day**, using that
day's room list and that day's single session window. The paste-ready lists below are
arranged for exactly that.

## Capacity

| Date       |            Rooms | Window              | Room-hours |    Applicants free that day |
| ---------- | ---------------: | ------------------- | ---------: | --------------------------: |
| Wed Sep 9  |               12 | 5:00/5:30 – 9:00 PM |       43.5 |                         156 |
| Thu Sep 10 |               14 | 5:00 – 9:00 PM      |       56.0 |                         174 |
| Fri Sep 11 |               15 | 5:00 – 9:00 PM      |       60.0 |                         174 |
| Sun Sep 13 |               20 | 10:00 AM – 5:00 PM  |      140.0 |                         190 |
| Mon Sep 14 |                5 | 5:30 – 8:30 PM      |       15.0 |                         161 |
| **Total**  | **66 room-days** |                     |  **314.5** | **235 distinct applicants** |

At 30-minute interviews that is **~629 slots for 235 applicants** — roughly 2.7× headroom on
rooms. Rooms are not the binding constraint; **interviewers are**. 43 org members covering
four hours each is ~172 interviewer-hours against 314.5 room-hours, so expect interviewer
availability to cap the schedule well before rooms do.

**Schedule the narrow-availability applicants first.** By how many of the five days each
applicant can do:

| Days free  |      1 |   2 |   3 |   4 |   5 |
| ---------- | -----: | --: | --: | --: | --: |
| Applicants | **31** |  24 |  38 |  48 |  94 |

The 31 single-day applicants have exactly one chance each; if the scheduler fills their day
with flexible people first, they cannot be placed at all.

## Bookings

### Wednesday, September 9 — 12 rooms

Two different start times. If you run this day as one window, use **5:30–9:00 PM** and treat
the three 5:00 rooms as a bonus half-hour to place manually; a single 5:00–9:00 window would
let the scheduler book the nine 5:30 rooms half an hour early.

| Window         | Rooms                                           |
| -------------- | ----------------------------------------------- |
| 5:00 – 9:00 PM | MCB 238, 308, 316                               |
| 5:30 – 9:00 PM | MCB 210, 216, 240, 304, 318, 321, 322, 329, 332 |

```
MCB 210
MCB 216
MCB 240
MCB 304
MCB 318
MCB 321
MCB 322
MCB 329
MCB 332
```

### Thursday, September 10 — 14 rooms, 5:00 – 9:00 PM

```
MCB 207
MCB 209
MCB 216
MCB 226
MCB 230
MCB 233
MCB 238
MCB 240
MCB 304
MCB 308
MCB 316
MCB 318
MCB 321
MCB 322
```

### Friday, September 11 — 15 rooms, 5:00 – 9:00 PM

```
MCB 134
MCB 204
MCB 207
MCB 210
MCB 216
MCB 219
MCB 223
MCB 224
MCB 226
MCB 230
MCB 233
MCB 240
MCB 302
MCB 304
MCB 308
```

### Sunday, September 13 — 20 rooms, 10:00 AM – 5:00 PM

The single biggest day: 140 of the 314.5 room-hours, and the day the most applicants (190)
are free.

```
MCB 134
MCB 136
MCB 204
MCB 207
MCB 209
MCB 210
MCB 212
MCB 216
MCB 218
MCB 219
MCB 223
MCB 224
MCB 226
MCB 230
MCB 231
MCB 232
MCB 233
MCB 238
MCB 240
MCB 302
```

### Monday, September 14 — 5 rooms, 5:30 – 8:30 PM

Note the earlier finish: **8:30 PM**, not 9:00. Applicants were asked about 5–9 PM on this
day, so some will have offered times you cannot actually use.

```
MCB 207
MCB 209
MCB 216
MCB 218
MCB 224
```

## Rooms by day, at a glance

Useful when a room double-books or you need to move someone.

| Room    | Sep 9 | Sep 10 | Sep 11 | Sep 13 | Sep 14 |
| ------- | :---: | :----: | :----: | :----: | :----: |
| MCB 134 |       |        |   ✅   |   ✅   |        |
| MCB 136 |       |        |        |   ✅   |        |
| MCB 204 |       |        |   ✅   |   ✅   |        |
| MCB 207 |       |   ✅   |   ✅   |   ✅   |   ✅   |
| MCB 209 |       |   ✅   |        |   ✅   |   ✅   |
| MCB 210 |  ✅   |        |   ✅   |   ✅   |        |
| MCB 212 |       |        |        |   ✅   |        |
| MCB 216 |  ✅   |   ✅   |   ✅   |   ✅   |   ✅   |
| MCB 218 |       |        |        |   ✅   |   ✅   |
| MCB 219 |       |        |   ✅   |   ✅   |        |
| MCB 223 |       |        |   ✅   |   ✅   |        |
| MCB 224 |       |        |   ✅   |   ✅   |   ✅   |
| MCB 226 |       |   ✅   |   ✅   |   ✅   |        |
| MCB 230 |       |   ✅   |   ✅   |   ✅   |        |
| MCB 231 |       |        |        |   ✅   |        |
| MCB 232 |       |        |        |   ✅   |        |
| MCB 233 |       |   ✅   |   ✅   |   ✅   |        |
| MCB 238 |  ✅   |   ✅   |        |   ✅   |        |
| MCB 240 |  ✅   |   ✅   |   ✅   |   ✅   |        |
| MCB 302 |       |        |   ✅   |   ✅   |        |
| MCB 304 |  ✅   |   ✅   |   ✅   |        |        |
| MCB 308 |  ✅   |   ✅   |   ✅   |        |        |
| MCB 316 |  ✅   |   ✅   |        |        |        |
| MCB 318 |  ✅   |   ✅   |        |        |        |
| MCB 321 |  ✅   |   ✅   |        |        |        |
| MCB 322 |  ✅   |   ✅   |        |        |        |
| MCB 329 |  ✅   |        |        |        |        |
| MCB 332 |  ✅   |        |        |        |        |
