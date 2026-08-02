# Convex Expansion Path A — Claude: Automated Event Lifecycle

## Objective

Make Convex automatically generate each attendee's Wrapped artifact after an event ends. This path demonstrates cron scheduling, internal queries/actions/mutations, durable database state, retry-safe work claiming, AI orchestration, and Convex file storage.

This path owns backend lifecycle automation only. It must not build the reactive dwell dashboard or edit any file assigned to Path B.

## Exclusive file ownership

Claude may create or edit only these implementation files:

```text
convex/schema.ts
convex/crons.ts
convex/eventCompletion.ts
convex/wrapped.ts
convex/wrappedData.ts
convex/__tests__/eventCompletion.test.ts
```

Claude must not edit:

```text
convex/dwellLive.ts
lib/dwell/liveSummary.ts
lib/dwell/__tests__/liveSummary.test.ts
components/dwell/LiveDwellPanel.tsx
app/debug/convex-dwell/page.tsx
docs/CONVEX_PATH_B_CODEX.md
```

No package changes are expected. Use the installed Convex and Vitest versions. If an unavoidable change outside the allowlist is discovered, stop and document it instead of editing another path's file.

## Existing architecture to reuse

- `wrapped.compute` already gathers facts, calls the narrative model, renders a strip, stores it, and persists the result.
- `wrappedData.gatherStats` and `wrappedData.persist` already isolate database work from the Node action runtime.
- `wrapped.by_userId_eventId` already makes persistence idempotent.
- `events.endDate`, `dwellSamples.eventId`, and `photos.eventId` identify ended events and participants.
- Convex cron jobs and the scheduler are the only new execution mechanisms needed.

Do not create a second Wrapped computation pipeline. Extract one shared implementation from `wrapped.compute`, then call it from both the public action and the internal scheduled action.

## Data flow

```text
Convex cron (every 15 minutes)
        |
        v
eventCompletion.scanEndedEvents [internal mutation]
        |
        +-- find ended events with unfinished participants
        +-- atomically create/claim one job per (user,event)
        +-- scheduler.runAfter(0, processJob)
                              |
                              v
eventCompletion.processJob [internal Node action]
        |
        +-- shared wrapped computation
        |      +-- gather deterministic Path 5 signals
        |      +-- write AI narrative
        |      +-- render strip
        |      +-- Convex storage.store(PNG)
        |      +-- persist wrapped row
        |
        v
markSucceeded / markFailed [internal mutation]
```

## Schema change

Add one table. A job row is both the deduplication key and the operational record.

```ts
wrappedJobs: defineTable({
  userId: v.id("users"),
  eventId: v.id("events"),
  state: v.union(
    v.literal("PENDING"),
    v.literal("RUNNING"),
    v.literal("SUCCEEDED"),
    v.literal("FAILED"),
  ),
  attempts: v.number(),
  updatedAt: v.number(),
  lastError: v.optional(v.string()),
})
  .index("by_userId_eventId", ["userId", "eventId"])
  .index("by_state_updatedAt", ["state", "updatedAt"])
```

Do not add event status, user session, queue, or lock tables. `wrappedJobs` covers uniqueness, retries, and judge-visible operational state.

## Function design

### `convex/crons.ts`

Register one interval cron:

```ts
crons.interval(
  "complete ended events",
  { minutes: 15 },
  internal.eventCompletion.scanEndedEvents,
);
```

The scan mutation accepts no arguments. It should use `Date.now()` server-side and process a bounded batch so one invocation cannot grow without limit.

### `eventCompletion.scanEndedEvents`

Responsibilities:

1. Query events whose `endDate <= now`. Add an event end-date index only if Convex requires it for a bounded query.
2. Determine participants from event-scoped `dwellSamples` and `photos`.
3. Deduplicate user IDs in memory.
4. For each participant, query `wrappedJobs.by_userId_eventId`.
5. Skip `SUCCEEDED` and fresh `RUNNING` jobs.
6. Insert a `PENDING` row when absent, or reclaim `FAILED`/stale `RUNNING` jobs while `attempts < 3`.
7. Mark the claimed row `RUNNING`, increment `attempts`, clear `lastError`, and schedule `processJob` with its job ID.

Recommended bounds:

- At most 10 events per scan.
- At most 100 participants per event per scan.
- A `RUNNING` job is stale after 30 minutes.
- Maximum 3 attempts.

These constants stay in `eventCompletion.ts`; they do not need configuration until production scale demands it.

### Participant discovery indexes

Prefer event-first indexes rather than table scans:

```text
dwellSamples.by_eventId_userId -> [eventId, userId]
photos.by_eventId_userId       -> [eventId, userId]
events.by_endDate              -> [endDate]
```

Add these in `schema.ts`. Existing indexes remain unchanged.

### Shared Wrapped computation

Refactor `wrapped.ts` so the public action and scheduled internal action call one local async function:

```ts
async function computeWrapped(ctx, userId, eventId): Promise<Id<"wrapped">>
```

Preserve the existing invariant:

- `deriveSignals` is the deterministic fact path.
- Narrative and strip generation may fail independently.
- A model failure must not erase stats.
- A render failure must not prevent Wrapped persistence.

Export:

- Existing `compute` public action with its frozen signature.
- New `computeInternal` internal action, or call the shared implementation directly from `eventCompletion.processJob` if Convex's module/runtime constraints permit it cleanly.

Do not duplicate AI calls or rendering code.

### `eventCompletion.processJob`

This is an `internalAction` in the Node runtime because Wrapped rendering requires Node APIs.

1. Read the job through an internal query/mutation helper.
2. Exit if it is no longer `RUNNING`.
3. Invoke the shared Wrapped computation.
4. Mark the job `SUCCEEDED` and clear `lastError`.
5. On failure, mark `FAILED`, save a sanitized error string, and rethrow so Convex records the failure.

Never store stack traces, prompts, tokens, or secrets in `lastError`. Cap the message at 500 characters.

## Idempotency and concurrency

- `(userId,eventId)` has exactly one job row.
- Wrapped persistence remains an upsert using `wrapped.by_userId_eventId`.
- Convex mutation transactions provide the atomic claim. Do not implement a custom distributed lock.
- Multiple cron invocations may inspect the same work, but only one transaction can successfully move the job to `RUNNING` without retrying against the updated row.
- A retry may regenerate narrative or a strip, but it cannot create duplicate Wrapped rows.

## Failure behavior

| Failure | Required outcome |
|---|---|
| No participants | No jobs created |
| No dwell runs | Persist valid zero-valued deterministic stats |
| Narrative provider fails | Persist stats with empty narrative |
| Strip rendering fails | Persist stats without `stripBlobRef` |
| Entire action fails | Job becomes `FAILED`; later scan retries up to 3 times |
| Worker dies while running | Job reclaimed after 30 minutes |
| Third attempt fails | Leave `FAILED`; do not retry forever |

## Test plan

Create `convex/__tests__/eventCompletion.test.ts`. Keep orchestration decisions in small exported pure helpers where practical, then test them without mocking Convex internals.

Required cases:

1. Absent job is claimable.
2. `SUCCEEDED` job is never claimable.
3. Fresh `RUNNING` job is not claimable.
4. Stale `RUNNING` job is reclaimable.
5. `FAILED` job below three attempts is retryable.
6. Three-attempt job is terminal.
7. Participant IDs from photos and samples are deduplicated.
8. Error sanitization truncates and excludes stack data.

Also run the existing dwell, seed-plan, typecheck, and Convex codegen checks.

## Implementation sequence

1. Add indexes and `wrappedJobs` to `schema.ts`; run Convex codegen.
2. Add and test pure claim/retry helpers in `eventCompletion.ts`.
3. Implement internal job mutations and participant scan.
4. Refactor `wrapped.ts` to one shared computation path.
5. Add the Node job processor.
6. Register `crons.ts`.
7. Seed an ended event and verify one job and one Wrapped row are produced.
8. Run the cron/scan twice and prove no duplicate job or Wrapped row appears.

## Acceptance criteria

- An ended event automatically creates one job per participating user.
- A successful job creates or updates exactly one Wrapped row.
- Running the scan repeatedly is idempotent.
- Failures are bounded, observable, and retryable.
- Existing manual `api.wrapped.compute({ userId, eventId })` still works.
- Existing mint, ingest, resolution, and Path 5 tests remain green.
- No Path B file is modified.

## Demo script

1. Show an ended seeded event and a participant with dwell runs.
2. Invoke the scan or wait for the cron.
3. Show the `wrappedJobs` row move from `RUNNING` to `SUCCEEDED` in the Convex dashboard.
4. Show the resulting `wrapped` row and stored PNG.
5. Explain that deterministic dwell facts survive AI or render failure.

## Not in scope

- Push notifications or email delivery.
- Manual admin retry UI.
- A generic workflow engine.
- Per-stage jobs or live processing state.
- Changes to Path 5 dwell arithmetic.
- Changes to the reactive dashboard owned by Path B.

## Merge contract

This path has no source-file overlap with Path B. Merge either path first. After both merge, regenerate `convex/_generated/*` once and commit generated output according to the repository's existing convention. Resolve generated-file differences by regeneration, never by hand editing.
