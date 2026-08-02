# Convex Expansion Path B — Codex: Reactive Dwell Experience

## Objective

Expose Path 5's materialized dwell facts through reactive Convex queries and a judge-facing live panel. This path demonstrates that offline sample ingestion produces server-authoritative, real-time product state without polling or client-side recomputation.

This path owns read-only dwell presentation only. It must not add lifecycle tables, cron jobs, or edit any file assigned to Path A.

## Exclusive file ownership

Codex may create or edit only these implementation files:

```text
convex/dwellLive.ts
lib/dwell/liveSummary.ts
lib/dwell/__tests__/liveSummary.test.ts
components/dwell/LiveDwellPanel.tsx
app/debug/convex-dwell/page.tsx
```

Codex must not edit:

```text
convex/schema.ts
convex/crons.ts
convex/eventCompletion.ts
convex/wrapped.ts
convex/wrappedData.ts
convex/__tests__/eventCompletion.test.ts
docs/CONVEX_PATH_A_CLAUDE.md
```

Do not edit `convex/queries.ts`; the new module produces `api.dwellLive.*`, avoiding the most likely Path 4 merge hotspot. No package or provider changes are expected because Path 4 already supplies Convex and the app provider.

## Existing architecture to reuse

- `dwellSamples` exposes pending resolution through `resolvedStageId === undefined`.
- `dwellRuns` is already materialized by `internal.resolve.run` after ingestion.
- `sets`, `stages`, and `events` contain the presentation labels and windows.
- `cards` supplies minted state.
- `loadGrid` and existing indexes establish the database access pattern.
- Path 5 thresholds remain the only attendance and mint thresholds.

Do not resolve coordinates, rebuild dwell runs, or call `deriveSignals` in the browser. The UI reads server-authoritative materialized state.

## Data flow

```text
offline sample queue
        |
        v
api.ingest.samples
        |
        v
internal.resolve.run -----> dwellRuns
        |                       |
        +--- dwellSamples ------+
                                v
                api.dwellLive.summary (reactive)
                                |
                                +-- LiveDwellPanel rerenders
                                |
                api.dwellLive.leaderboard (reactive)
                                |
                                +-- anonymous event comparison
```

## Public API contracts

Implement two queries in `convex/dwellLive.ts`.

### `api.dwellLive.summary`

Arguments:

```ts
{ userId: Id<"users">; eventId: Id<"events"> }
```

Return type:

```ts
interface LiveDwellSummary {
  eventId: string;
  processing: "IDLE" | "RESOLVING" | "READY";
  sampleCount: number;
  unresolvedSampleCount: number;
  runCount: number;
  totalDwellSeconds: number;
  current: {
    setId: string;
    stageId: string;
    artistName: string;
    stageName: string;
    dwellSeconds: number;
    completionRate: number;
    mintEligible: boolean;
  } | null;
  attendedSets: Array<{
    setId: string;
    stageId: string;
    artistName: string;
    stageName: string;
    dwellSeconds: number;
    completionRate: number;
    minted: boolean;
  }>;
  updatedAt: number | null;
}
```

Processing is inferred from existing rows:

- `RESOLVING`: at least one event sample has `resolvedStageId === undefined`.
- `READY`: at least one sample exists and none are unresolved.
- `IDLE`: no event samples exist.

`updatedAt` is the maximum source timestamp, not `Date.now()`. This keeps results stable between database changes.

Aggregate split runs by set. Clamp aggregate completion to `[0,1]`. Select `current` as the latest observed set only while its last run is within a named recency window in `liveSummary.ts`; otherwise return `null`.

Mint eligibility here is informational: threshold dwell, a matching resolved photo, and no minted card. `mint.claim` remains authoritative and re-verifies every condition.

### `api.dwellLive.leaderboard`

Arguments:

```ts
{ eventId: Id<"events">; limit?: number }
```

Return type:

```ts
interface EventDwellLeaderboard {
  topArtists: Array<{
    setId: string;
    artistName: string;
    attendeeCount: number;
    totalDwellSeconds: number;
  }>;
  topStages: Array<{
    stageId: string;
    stageName: string;
    attendeeCount: number;
    totalDwellSeconds: number;
  }>;
}
```

Rules:

- Include only runs for sets in the requested event.
- Count one attendee once per set or stage despite split runs.
- Default `limit` to 5 and clamp it to 1–20.
- Sort by total dwell descending, then name ascending for deterministic ties.
- Return aggregates only; never return user IDs.

For demo scale, aggregate in memory. Add a `ponytail:` comment naming a materialized aggregate table as the upgrade path if measured event volume exceeds Convex query limits. Do not build that table now.

## Pure projection module

`lib/dwell/liveSummary.ts` contains plain TypeScript projection and aggregation functions. Convex queries load documents and pass normalized records into them.

Recommended exports:

```ts
export function summarizeLiveDwell(input: LiveSummaryInput): LiveDwellSummary;
export function buildEventLeaderboard(input: LeaderboardInput, limit?: number): EventDwellLeaderboard;
```

Keep Convex IDs typed as strings at this pure boundary. No Convex imports belong in the file. Reuse `MINT_ELIGIBLE_SECONDS`; never duplicate its numeric value.

## Query implementation

### Summary reads

1. User samples from `dwellSamples.by_userId_timestamp`, filtered to the event.
2. User runs from `dwellRuns.by_userId`, filtered through the event set IDs.
3. Event stages and sets through `loadGrid`.
4. User photos from `photos.by_userId_timestamp`, filtered to the event.
5. User cards from `cards.by_userId`, filtered to event sets.

Use maps for stage/set joins. Use `Promise.all` for independent reads where supported. Path B may not edit the schema.

### Leaderboard reads

The current schema has no event ID on `dwellRuns`. Load the event set IDs, collect runs, and retain matching rows. This is sufficient for seeded scale and keeps Path B independent from Path A's schema work.

If real seeded data hits a Convex query limit, report the measured count and propose a follow-up materialized aggregate. Do not add speculative infrastructure.

## UI design

### `components/dwell/LiveDwellPanel.tsx`

Create a client component driven by `useQuery(api.dwellLive.summary, ...)`.

Required states:

- Loading: compact skeleton or status text.
- `IDLE`: “Waiting for festival samples.”
- `RESOLVING`: accepted and unresolved sample counts.
- `READY`: current artist/stage, dwell minutes, completion, and mint state.

Accessibility:

- Use semantic headings and lists.
- Give progress visible text in addition to color.
- Use `aria-live="polite"` for processing and eligibility changes.
- Respect reduced-motion settings if transitions are added.

The component receives `userId` and `eventId` props. It does not discover identity, ingest samples, or claim cards.

### `app/debug/convex-dwell/page.tsx`

Create a development-only route using the existing debug route's production guard.

Display:

1. The live summary panel.
2. Samples, unresolved samples, runs, and total dwell counters.
3. The attended-sets table.
4. Top artists and stages from the leaderboard.
5. A pipeline legend: ingest → resolve → runs → reactive query.

Read `userId` and `eventId` from search parameters so judges can switch seed records without editing code. Validate both before rendering. Link to `/debug/dwell` rather than reproducing its arithmetic timeline.

## Test plan

Create `lib/dwell/__tests__/liveSummary.test.ts` for the pure projection functions.

Required cases:

1. No samples produces `IDLE` and zero totals.
2. Any unresolved sample produces `RESOLVING`.
3. Fully resolved samples produce `READY`.
4. Split runs aggregate by set and completion remains clamped.
5. Informal eligibility requires threshold dwell, a matching photo, and no card.
6. Current-set selection is deterministic and expires.
7. Leaderboard attendee counts deduplicate split runs.
8. Runs from another event are excluded.
9. Tie sorting is deterministic.
10. Limit defaulting and clamping work.

Run existing Path 5 tests, this test, TypeScript typecheck, Next build, and Convex codegen.

## Performance limits

- One summary subscription backs the whole panel; never subscribe per set.
- Join names through maps, not repeated linear searches.
- Do not place `Date.now()` in returned reactive state.
- Return only rendered fields.
- Keep leaderboard output bounded.

The first-iteration in-memory leaderboard is deliberate. Replace it only when measured query volume requires a materialized aggregate.

## Implementation sequence

1. Define projection types/functions in `liveSummary.ts`.
2. Write tests to lock processing and aggregation semantics.
3. Implement `api.dwellLive.summary` against existing tables.
4. Implement the bounded anonymous leaderboard.
5. Build `LiveDwellPanel` against generated API types.
6. Build the development-only debug route.
7. Run codegen, tests, typecheck, and build.
8. Use two browser tabs to prove updates occur without polling or refresh.

## Acceptance criteria

- Sample ingestion moves the panel from `RESOLVING` to `READY` through Convex subscriptions.
- Totals match the existing Path 5 timeline for the same seed.
- Mint presentation is explicitly non-authoritative; `mint.claim` remains authoritative.
- Leaderboards expose no user identity.
- No polling, custom WebSocket, or duplicate dwell reconstruction exists.
- The debug route is unavailable in production.
- Existing tests remain green.
- No Path A file is modified.

## Demo script

1. Open `/debug/convex-dwell?userId=...&eventId=...`.
2. Sync an offline sample batch.
3. Show the sample count update immediately.
4. Show `RESOLVING` while the scheduled resolver works.
5. Show the dwell run, completion, and eligibility appear without refresh.
6. Show the anonymous leaderboard update from the same source of truth.
7. Open `/debug/dwell` to explain the no-interpolation arithmetic.

## Not in scope

- Cron jobs or automatic Wrapped generation.
- New tables or indexes.
- A generic analytics platform.
- Historical charts or pagination.
- Client-side dwell reconstruction.
- Mint mutations or task verification.
- Production navigation to the debug route.

## Merge contract

This path has no source-file overlap with Path A. Merge either path first. After both merge, regenerate `convex/_generated/*` once instead of merging generated output manually. Path B does not read `wrappedJobs`, so it compiles and runs independently of Path A.
