# Path 4 — Convex Data Layer & Demo Seed

**Branch:** `path/4-convex-backend`
**Mission:** Hold what people collected, make the shelf update live, and build the seeded weekend that wins the room.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **You own that file's §8 — keep it true.**

---

## Why this path exists

**Convex holds what you collected.** Two jobs make it visible in the pitch rather than buried:

1. **Reactive subscriptions drive the live shelf.** A judge mints a card and the shelf updates without a refresh — and when a second judge mints from the same set on another device, the first judge's screen moves. That is a two-second demo moment you get for free from Convex and cannot get from a REST backend.
2. **Persistence carries the collection across events.** The shelf is not a session; it is a collection that grows across festivals. JamBase covers 20,000 festivals and 5M performances, so every show anyone attends can mint into the same shelf.

You also own the **demo seed**, and the demo seed is the payoff. The festival is Aug 7–9. The demo is Aug 2. **You are demoing a weekend that has not happened yet** — and it is your synthetic user that makes Sunday night exist.

---

## Scope

**In**
- `convex/schema.ts` — every table, every index
- `lib/types.ts` — the canonical shared types (mirrors `docs/CONTRACTS.md`)
- Ingest mutations (idempotent), mint mutation (deduped), task verification, wrapped storage
- Reactive queries: `grid`, `shelf`, `mintableNow`, `taskProgress`, `wrapped`
- Blob storage for photos and the rendered strip
- The server-side resolution pass that stamps `resolvedStageId` / `resolvedSetId` onto ingested rows
- `scripts/seed-demo.ts` — the synthetic three-day weekend

**Out**
- The geometry itself → **path 2** (you *call* `resolve()`, you do not implement it)
- The grid pull → **path 3** (you accept their writes)
- Eligibility rules and rarity → **path 6** (you call their pure functions)
- OpenAI calls → **path 8**

---

## Files you own

```
convex/schema.ts                tables + indexes
convex/ingest.ts                photos, samples
convex/mint.ts                  claim, dedupe
convex/queries.ts               grid, shelf, mintableNow, taskProgress, wrapped
convex/tasks.ts                 task verification queries/mutations
convex/wrapped.ts               compute + store
convex/resolve.ts               server-side resolution pass
convex/_generated/              (generated — commit it)
lib/types.ts                    canonical shared types
lib/convex/client.tsx           provider + hooks wrapper
scripts/seed-demo.ts            synthetic weekend
```

**Do not edit:** `lib/geo/*`, `lib/grid/*`, `lib/dwell/*`, `lib/mint/*`, `lib/render/*`, `lib/offline/*`, `app/*` (except the provider mount in `layout.tsx`, coordinated with path 1).

---

## Contracts

### You publish — frozen at T+30

**Mutations**
```ts
api.ingest.photos({ userId, eventId, photos: PhotoUpload[] })     // idempotent on clientId
api.ingest.samples({ userId, eventId, samples: SampleUpload[] })  // idempotent on clientId
api.mint.claim({ userId, setId, photoClientId, frameVariant })    // → cardId; dedupes on (userId,setId)
api.tasks.verify({ userId, taskId })                              // → completion | null
api.wrapped.compute({ userId, eventId })                          // → wrappedId
```

**Queries (reactive)**
```ts
api.queries.grid({ eventId })                  // → Grid
api.queries.shelf({ userId })                  // → Card[]
api.queries.mintableNow({ userId, lat, lng })  // → Mintable[]
api.queries.taskProgress({ userId })           // → TaskProgress[]
api.queries.wrapped({ userId, eventId })       // → Wrapped | null
```

Names are frozen. You may add optional arguments; you may not rename or remove. Five other paths are typed against this.

### You consume
- `resolveStage`, `lookupSet`, `resolve` from path 2 (pure, runs unchanged server-side)
- `buildDwellRuns`, `deriveSignals` from path 5
- `checkEligibility`, `rarityScore`, `pickFrameVariant` from path 6
- `classifyBurst`, `writeWrapped` from path 8

**All of these are pure functions or clearly-bounded async calls.** Import and call them. Do not reimplement their logic in Convex — the single source of truth for a rule is the path that owns it.

---

## Data model

```
users            _id, deviceId, createdAt, displayName?
events           _id, jambaseFestivalId, name, themePack, startDate, endDate, timezone
stages           _id, eventId, name, polygon: [[lat,lng]...], bufferMeters, centroid, jambaseStageRef
sets             _id, eventId, stageId, artistName, jambaseArtistId, spotifyId,
                 startTime, endTime, slotIndex, isHeadliner, estimatedAudience,
                 isFestivalDebut, isFinalShow, genreTags[]
photos           _id, userId, eventId, clientId, timestamp, lat, lng, blobRef,
                 resolvedStageId?, resolvedSetId?, visionSubject?, visionQualityScore?, isBestFrame?
dwellSamples     _id, userId, eventId, clientId, timestamp, lat, lng, resolvedStageId?
dwellRuns        _id, userId, setId, startTs, endTs, dwellSeconds, completionRate   // materialised
cards            _id, userId, setId, photoId, frameVariant, dwellSeconds, rarityScore, state, mintedAt
tasks            _id, eventId, setId?, artistName, type, params, description,
                 rewardType, rewardPayload, activeFrom, activeUntil
taskCompletions  _id, userId, taskId, verifiedAt, proofCardId
wrapped          _id, userId, eventId, computedAt, stats, narrative, stripBlobRef
```

### Indexes that matter
- `photos` by `(userId, timestamp)` — resolution scan
- `dwellSamples` by `(userId, timestamp)` — run grouping
- `cards` by `(userId, setId)` — dedupe on mint
- `sets` by `(eventId, stageId, startTime)` — the grid lookup

Add a `photos` by `clientId` and `dwellSamples` by `clientId` index too — idempotent ingest needs it and without it every batch is a table scan.

---

## Identity

No login. `deviceId` is a UUID in `localStorage`, created on first open, exchanged for a `users` row. That is the entire auth story and it is the right one for a festival — nobody is typing an email address at 9PM in a field.

Provide a way to **switch to the seeded demo user** (a query param or a hidden tap target). The demo depends on it. Coordinate the exact mechanism with path 1 and rehearse it.

---

## Resolution pass

Runs opportunistically. Nothing here is real-time critical.

```
1. photo.{lat,lng} → inPolygon(stages)        → stageId
2. (stageId, photo.ts) → gridLookup(sets)     → setId
3. samples → contiguous runs → intersect windows → dwellRuns
4. eligibility(stageId, setId, dwell, photo)  → mint AVAILABLE
5. setId → JamBase metadata (already cached)  → spotifyId, tour
```

**All five steps are deterministic. No model in this path.** The vision pass runs *beside* this, never inside it — it writes `visionSubject`, `visionQualityScore`, `isBestFrame` onto already-resolved rows and can fail entirely without affecting a single fact.

Trigger the pass at the end of an ingest mutation (scheduled, not inline — do not make the phone wait for it).

---

## The demo seed — treat this as a feature, not a fixture

Generate a synthetic user with photos, coordinates, and dwell across all three days.

**Make the dwell numbers plausible and slightly uneven, since perfectly clean data looks fake.** Nobody stays exactly 45:00. Somebody leaves a set 8 minutes early. Somebody's phone slept for 20 minutes at 4PM.

Seed requirements:
- 3 days, 11 sets attended across 4 of the 5 stages
- ~49 photos: heavily weighted toward `people`, a handful of `stage` — this is what makes *"you shot 43 photos of your friends and 6 of the stage"* true rather than invented
- Dwell samples at realistic 60–90s spacing, with **at least one >5 minute gap** so the gap rule visibly does its job
- One set where the user stayed 47 minutes against a 20-minute intention — the *"you meant to stay 20"* line
- At least one Friday-night set with three concurrent sets skipped — the opportunity-cost headline
- Four artists with no prior card in the collection, all with high completion — the *"you saw four artists you had never heard of, you stayed for all four"* line
- A night-weighted distribution so `nightRatio` is high
- Real photos. Grab 12–15 usable concert-ish images so the strip is not grey rectangles. **This matters more than any query optimisation you will do today.**

Run the seed against the **real grid from path 3**, not fabricated sets. The artists on the Wrapped must be artists actually playing Outside Lands 2026.

---

## Task list

### T+0 → T+30 · Schema and types (everyone is blocked on this)
- [ ] `npx convex dev`, link the project, share `NEXT_PUBLIC_CONVEX_URL` with the team.
- [ ] `lib/types.ts` — transcribe `docs/CONTRACTS.md` §§1–7 exactly. Publish to `main` immediately. **This is the highest-priority 30 minutes on the entire build.**
- [ ] `convex/schema.ts` — all tables and indexes above.

### T+30 → T+60 · Ingest
- [ ] `ingest.photos` — idempotent upsert on `clientId`, blob to Convex file storage, return the accepted ids.
- [ ] `ingest.samples` — idempotent bulk upsert on `clientId`.
- [ ] Stub both to accept and store before resolution exists, so path 1 can integrate at T+60.

### T+60 → T+90 · Resolution pass
- [ ] `convex/resolve.ts` — import path 2's pure functions, stamp `resolvedStageId` / `resolvedSetId`.
- [ ] Materialise `dwellRuns` using path 5's `buildDwellRuns`.
- [ ] Schedule the pass from ingest; make it re-runnable and idempotent.

### T+90 → T+120 · Queries and mint
- [ ] `queries.shelf` — cards for a user, newest first, joined to set + artist.
- [ ] `queries.mintableNow` — resolve the passed coordinate, call path 6's `checkEligibility`.
- [ ] `mint.claim` — check `cards` by `(userId, setId)`, insert, return the card. **Dedupe hard**; a double-mint on stage is embarrassing.
- [ ] Verify the reactive path: two browser windows, mint in one, watch the other update.

### T+120 → T+180 · Seed
- [ ] `scripts/seed-demo.ts` per the spec above. Idempotent — you will run it fifteen times.
- [ ] Verify the derived numbers by hand against path 5's signals. Every line in the Wrapped must be arithmetically true of the seed.
- [ ] Re-run after any schema change and **before the freeze**.

### T+180 → freeze
- [ ] `wrapped.compute` — assemble stats, call path 8's narrative, store `stripBlobRef`.
- [ ] `tasks.verify` — a query over existing cards (see path 8; no new verification code paths).
- [ ] Back up the seeded state. If Convex hiccups at 5:45, you want a one-command restore.

---

## Acceptance criteria

1. Two browser windows on the same user: minting in one updates the shelf in the other with no refresh.
2. Ingesting the same batch twice produces zero duplicate rows.
3. `mint.claim` called twice for the same `(userId, setId)` returns the same card, not two.
4. `mintableNow` returns `AVAILABLE` for a spoofed coordinate inside a polygon during a set window and `LOCKED` outside it.
5. The seeded user shows 11 cards on the shelf with real artist names from the real 2026 grid.
6. Every number in the Wrapped copy is reproducible by hand from seeded rows.
7. `npx convex dev` starts clean, no type errors, no schema warnings.

---

## Cut lines

1. `taskProgress` reactivity → recompute on read.
2. `wrapped.compute` as a mutation → compute client-side and store the result.
3. Blob storage for photos → data URLs in the seed. Ugly, works.

**Never cut:** the schema, mint dedupe, or the seed. The seed *is* the payoff of the demo.

---

## Demo responsibilities

- Own the live reactive moment: two devices, one set, shelf updating on both. **This is the beat that kills the Pokémon Go comparison** — two people at the same set walk away with different objects, and the judges watch it happen.
- Own the switch to the seeded account. **Rehearse the seam between live capture and seeded Wrapped.** That transition is where demos die. Know exactly which taps get you there and do not improvise it in front of ten judges.
- Own the sentence: *"The collection persists across events. JamBase covers 20,000 festivals — every show anyone attends mints into the same shelf."*

---

## Gotchas

- Convex queries are reactive by default; make sure the shelf component actually uses `useQuery` and is not fetching once in an effect. If the live update does not happen, that whole demo beat evaporates.
- Do not put geometry or eligibility logic inside a Convex function. Import the pure function. When path 2 fixes a polygon at 4PM you want one place to change.
- Schema changes with existing data will error. Design for a wipe-and-reseed loop and keep the seed fast.
- File storage: photos are blobs from the client. Store the storage id in `blobRef`, and generate URLs at query time.
- `Date.now()` on the server is not the device's capture time. **Always trust the device timestamp for facts** and record server arrival time separately if you want it at all.
- Freeze `lib/types.ts` at T+30 and mean it. A rename at 4PM breaks five branches simultaneously.
