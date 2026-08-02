# Path 5 — Dwell Tracking & Opportunity Cost

**Branch:** `path/5-dwell-tracking`
**Mission:** Compute the signal Spotify cannot get — how long you actually stood there, and what you gave up to do it.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts before writing code.**

---

## Why this path exists

This is the differentiator, stated as plainly as it can be:

> Wrapped is derived from a stream log. It has no notion of opportunity cost — playing a song costs you nothing. Attending a set costs you every other set in that window. Our stats are about sacrifice, and that is a genuinely different emotional register.

`concurrentSetsSkipped` is the single number that carries that whole argument. **You own it.** Everything else on this path exists to make that number honest.

You also own the integrity of the invariant at its most tempting failure point. It would be very easy to interpolate across a gap and produce nicer numbers. Do not. **If a fact cannot be derived from captured data, it does not appear.**

---

## Scope

**In**
- Grouping raw samples into contiguous dwell runs
- Gap handling, noise rejection, window intersection
- Threshold policy (5 / 10 min, 80% completion)
- All derived signals, including the opportunity-cost calculation
- A debug view that shows a user's day as a timeline of runs

**Out**
- Producing samples (`watchPosition`, throttling, IndexedDB) → **path 1**
- Resolving a point to a stage → **path 2** (you call `resolveStage`)
- The grid → **path 3**
- Persisting `dwellRuns` → **path 4** (they call your builder)
- Writing the Wrapped sentences → **path 8** (you hand them numbers)

---

## Files you own

```
lib/dwell/runs.ts             buildDwellRuns
lib/dwell/signals.ts          deriveSignals
lib/dwell/thresholds.ts       the constants, in one place, named
lib/dwell/__tests__/          unit tests over synthetic sample streams
app/debug/dwell/page.tsx      timeline visualiser (dev only)
```

**Do not edit:** `lib/types.ts`, `lib/geo/*`, `lib/offline/*`, `convex/*`.

---

## Contracts

### You publish

```ts
// lib/dwell/runs.ts
export interface DwellRun {
  stageId: StageId;
  setId: SetId | null;
  startTs: number;
  endTs: number;
  dwellSeconds: number;
  completionRate: number;    // clamped [0,1]
  sampleCount: number;
}

buildDwellRuns(
  samples: DwellSample[],
  grid: Grid,
  opts?: { maxGapMs?: number; minSamples?: number },   // defaults 5*60_000, 2
): DwellRun[]

// lib/dwell/signals.ts
deriveSignals(runs: DwellRun[], grid: Grid, priorArtistNames: string[]): DerivedSignals
```

`DerivedSignals` is fully specified in `docs/CONTRACTS.md` §4. **Both functions are pure** — no I/O, no async, no `Date.now()`. Callers pass everything in. This is what lets path 4 run them server-side and path 8 run them client-side over the same data and get identical answers.

### You consume
- `resolveStage(pt, stages)` from path 2
- `Grid` from path 3
- `DwellSample[]` from path 1 (or Convex, via path 4)

You are blocked on 2 and 3 for *real* data but not for *code*. Write against synthetic sample arrays from minute one — you can build and fully test this path before either upstream lands.

---

## Algorithm

### Sampling (path 1's side, stated here for context)
`geolocation.watchPosition` with a throttle to one stored sample per **60–90 seconds**. Continuous high-accuracy GPS would drain a phone that is already at 20% by mid-afternoon and is not needed — we are resolving meadows, not metres.

### Accumulation
```
1. Sort samples by ts.
2. Resolve each to stageId (or null).
3. Group into contiguous runs of the same stageId.
4. Drop runs shorter than 2 samples (noise).
5. Intersect each run with set windows for that stage.
   → dwellSeconds per (user, set)
```

Notes on step 5: a run can span two sets (you stayed through a changeover). Split it at the window boundary and emit one `DwellRun` per `(run × set)` intersection. Intersect against the **unpadded** window — the ±15 min grace belongs to mint eligibility, not to dwell arithmetic. Giving someone 15 free minutes of stated dwell time is a fabricated stat.

### Gap handling
If the gap between consecutive samples exceeds **5 minutes** (phone asleep, app backgrounded, tab suspended), **do not interpolate across it.** Close the run and open a new one. Inventing presence you did not observe would violate the invariant.

This is not a corner case — phones sleep constantly. Expect the seeded data to contain several. The correct behaviour is a slightly-lower dwell number that is true.

**Duration of a run:** `lastSampleTs - firstSampleTs`. Do not extrapolate half a sampling interval onto each end to "account for" the unobserved edges. It is tempting and it is wrong.

### Thresholds

| Purpose | Threshold |
|---|---|
| Card mint eligible | ≥ 5 min in polygon during set window |
| Counted as "attended" for Wrapped | ≥ 10 min |
| Counted as "stayed for the whole set" | ≥ 80% of set duration |

Put all three in `lib/dwell/thresholds.ts` as named constants. Path 6 imports the 5-minute one; do not let two copies drift.

### Derived signals

- `dwellSeconds` per set
- `concurrentSetsSkipped` — how many other sets ran during a set you attended. **This is the opportunity-cost number, the core of the Wrapped read.**
- `completionRate` — did you leave early, and how often
- `stageDiversity` — distinct stages visited
- `nightRatio` — share of dwell after 7PM
- `discoveryRate` — sets attended by artists with no prior card in your collection

**Defining `concurrentSetsSkipped` precisely** (do this deliberately, someone will ask):
For each attended set A, count the sets B where `B.stageId ≠ A.stageId` and B's window **overlaps** A's window, and the user has no dwell run for B. Sum across attended sets for the total; keep the per-set map too, because *"you chose Hozier over three other stages Friday night"* is a per-set claim.

Decide and document: does a set that overlaps by 4 minutes count as skipped? Recommendation — require **≥ 50% overlap** with A's window so a set that merely brushed the edge is not counted as sacrificed. Write the rule in a comment. Judges who care about rigour will ask, and having a defensible rule beats having a bigger number.

`nightRatio` uses **7PM local festival time** (`America/Los_Angeles`), computed from the grid's timezone field, not the device's.

`discoveryRate` needs `priorArtistNames` — the artists already in the collection *before* this event. Path 4 passes it. If it is empty, every artist is a discovery, which is correct for a first festival.

---

## Task list

### T+0 → T+20 · Test data before code
- [ ] `lib/dwell/__tests__/fixtures.ts` — hand-build sample streams: a clean 45-minute run; a run with a 12-minute gap in the middle; a two-sample blip; a run spanning two sets; a run that starts before a set and ends inside it.
- [ ] Write the expected `DwellRun[]` for each **by hand, on paper, before implementing.** These fixtures are the contract with reality.

### T+20 → T+55 · buildDwellRuns
- [ ] Sort, resolve each sample via path 2, group contiguous.
- [ ] Gap rule at 5 minutes — close and reopen.
- [ ] Drop runs with `sampleCount < 2`.
- [ ] Window intersection, splitting across set boundaries.
- [ ] `completionRate = dwellSeconds / setDurationSeconds`, clamped to `[0,1]`.

### T+55 → T+95 · deriveSignals
- [ ] Totals, `setsAttended` (≥10 min), `fullSetCount` (≥0.8), `stageDiversity`.
- [ ] `concurrentSetsSkipped` + `perSetSkipped` with the ≥50% overlap rule.
- [ ] `nightRatio` in festival-local time.
- [ ] `discoveryRate` against `priorArtistNames`.
- [ ] `longestRun` and `topArtistBySetTime` — path 8 needs both for headline lines.

### T+95 → T+120 · Debug timeline
- [ ] `app/debug/dwell/page.tsx` — horizontal timeline per day. Set windows as background bars, dwell runs as filled bars on top, gaps visibly empty.
- [ ] Print the signals as a JSON block underneath.
- [ ] This page is how you prove the numbers to a skeptical judge in five seconds, and how you catch your own bugs.

### T+120 → freeze · Validate against the seed
- [ ] Run against path 4's seeded weekend. Every signal must be sane: no 14-hour runs, no 120% completion, no negative durations.
- [ ] Hand-verify `concurrentSetsSkipped` for one Friday set against the real grid. Count the overlapping sets yourself. If your code disagrees with your arithmetic, your code is wrong.
- [ ] Give path 8 a frozen sample `DerivedSignals` JSON so they can build narrative prompts without waiting on you.

---

## Acceptance criteria

1. A clean 45-minute sample stream over one set yields exactly one run, ~2700 dwellSeconds, `completionRate ≈ 0.6` for a 75-minute set.
2. A stream with a 12-minute gap yields **two** runs, and their combined dwell **excludes** the gap.
3. A two-sample blip at a stage the user walked past yields **zero** runs.
4. Samples at Wine Lands produce no run and correctly break the surrounding run in two.
5. A run spanning a set changeover produces two runs, one per set, split at the boundary.
6. `concurrentSetsSkipped` for a seeded Friday-night set matches a hand count against the real grid.
7. Both functions are pure — calling twice with the same input returns deep-equal output, and neither reads the clock.

---

## Cut lines

Dwell is third on the global cut list — *"tasks first, then extra frame variants, then dwell."* If it comes to that:

1. `discoveryRate` and `nightRatio` → drop, they are flavour lines.
2. Set-boundary splitting → attribute a spanning run to the set with the larger overlap.
3. `perSetSkipped` → keep the global `concurrentSetsSkipped` only.

**Never cut:** `dwellSeconds`, the 5-minute gap rule, or `concurrentSetsSkipped`. Without the first, mint eligibility has no input. Without the second, the numbers are fiction. Without the third, we are Spotify Wrapped with photos.

---

## Demo responsibilities

- Own the strongest positioning sentence in the deck: *"Playing a song costs you nothing. Attending a set costs you every other set in that window. Our stats are about sacrifice."*
- Own the line *"You chose Hozier over three other stages Friday night"* — and be able to say, if asked, exactly how that three was computed.
- Have the debug timeline ready. If a judge says "how do you know they stayed 47 minutes," you show bars, not a claim.
- Own the honesty beat: *"If the phone slept, we don't interpolate. We'd rather under-report than invent presence."* Engineers on the panel will notice that.

---

## Gotchas

- Sample streams arrive out of order after an offline sync drain. **Sort first, always.** Do not assume insertion order.
- Duplicate `clientId`s can appear if a sync retry raced. Dedupe by `clientId` before grouping.
- `completionRate` can exceed 1 if a run overlaps the grace window or a set's listed end time is early. Clamp it. A 130% completion rate on screen is a credibility hole.
- Timezone: the 7PM cut for `nightRatio` is **festival local**, not UTC and not device-local. A judge in the room is in the same timezone, so an error here is invisible to you and obvious in the data.
- Do not import from `lib/mint/*`. Path 6 depends on you; the dependency does not go both ways, and a cycle will break the build at the worst possible moment.
- Resist every temptation to smooth, interpolate, or round up. The product's entire defensible claim is that the numbers are real.
