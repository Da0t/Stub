# Path 3 — JamBase Grid & Now-Playing

**Branch:** `path/3-jambase-grid`
**Mission:** Pull the real Outside Lands 2026 grid once, enrich it, cache it whole, and never call JamBase again.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts before writing code.**

---

## Why this path exists

**JamBase decides what is true.** Every artist name, stage, and set window on screen comes from you. A judge who knows the 2026 lineup will read the screen and check — real data is the difference between a prototype and a product.

You also own the sleeper feature. Artist name → Spotify ID is normally the ugliest part of any music project: fuzzy matching, disambiguation, remaster duplicates, three bands called the same thing. **JamBase has already joined it.** That single field is what makes the final Wrapped card — *"they play Oakland in November, hear them first"* — nearly free. Surface it loudly.

And you own the one thing that makes offline resolution possible: **the grid is cached whole.**

---

## Scope

**In**
- JamBase v3 bootstrap: resolve festival → pull grid → enrich artists
- Normalisation into the `Grid` contract (epoch ms, stage IDs matched to path 2's polygons)
- Writing `sets` and `stages` into Convex; shipping the whole grid to the client
- Grid caching on the client and staleness handling
- The minimal navigation surface: stage list with now-playing and next
- Rarity inputs: estimated audience, festival debut, final show, headliner flags

**Out**
- Point-in-polygon and the `(stage, ts) → set` lookup → **path 2** (you provide the data; they query it)
- Convex schema definition → **path 4** (you write rows into their tables)
- IndexedDB mechanics → **path 1** (you call `saveGrid` / `loadGrid`)
- Anything resembling wayfinding, routing, or a map — see the scope note below

---

## Files you own

```
lib/grid/jambase.ts             API client: festivals, events, artist enrichment
lib/grid/normalize.ts           JamBase payload → Grid contract
lib/grid/cache.ts               client-side grid load/refresh, staleness
lib/grid/nowPlaying.ts          now/next computation from a Grid + ts
app/now/page.tsx                stage list surface
scripts/bootstrap-grid.ts       one-shot: pull, enrich, write to Convex, dump JSON
data/grid.sample.json           the cached real pull, committed
```

**Do not edit:** `lib/types.ts`, `convex/schema.ts`, `lib/geo/*`, `lib/offline/db.ts`.

---

## Contracts

### You publish

```ts
// lib/grid/jambase.ts
findFestival(name: string, year: number): Promise<{ festivalId: string; name: string }>
fetchGrid(festivalId: string): Promise<RawJamBaseEvent[]>
enrichArtist(jambaseArtistId: string): Promise<ArtistMeta>

// lib/grid/normalize.ts
toGrid(raw: RawJamBaseEvent[], stages: Stage[], meta: Record<string, ArtistMeta>): Grid

// lib/grid/cache.ts
ensureGrid(): Promise<Grid>          // IndexedDB first, network only if absent/stale
getGridSync(): Grid | null           // in-memory, for hot paths

// lib/grid/nowPlaying.ts
nowPlaying(grid: Grid, ts: number): Array<{ stage: Stage; now: SetRecord|null; next: SetRecord|null }>
```

`Grid`, `SetRecord`, `Stage` are defined in `docs/CONTRACTS.md` §1. **Do not redefine them.**

### You consume
- `Stage[]` from path 2's `data/stages.json` — you need their stage IDs to key sets correctly. Agree the five stage IDs with path 2 in the **first ten minutes**. This is the single highest-risk coordination point on the whole build.
- `saveGrid` / `loadGrid` from path 1.
- Convex mutations from path 4 for the write.

### You unblock
Paths 2, 5, 6 and 8 all read the grid. Ship `data/grid.sample.json` — even hand-faked with four real artists — **within the first 20 minutes.** A stub that lands early beats a perfect pull that lands at 4PM.

---

## JamBase integration

Base URL `https://data.jambase.com/v3`. Reference at `data.jambase.com/api/reference`. Free trial, no card required. An MCP server also exists if agent-style querying is preferred over REST.

> **Andy Gadiel (JamBase founder/CEO) is mentoring in the room. Ask him directly rather than fighting docs — this is the single highest-leverage thing available today.** Go find him in the first thirty minutes. Bring specific questions: festival ID for Outside Lands 2026, the exact field carrying stage name, whether estimated audience is exposed per performance, and how to get tour dates for a matched artist.

### Bootstrap (once, at event start)

```
1. Resolve the festival
   GET /festivals?name=Outside Lands&year=2026
   → festivalId

2. Pull the full grid
   GET /festivals/{festivalId}/events
   → [{ artist, stage, startTime, endTime, ... }]

3. Enrich each artist
   → third-party IDs (Spotify, MusicBrainz, Ticketmaster)
   → genre tags
   → upcoming tour dates near SF

4. Write to Convex `sets` + `stages`. Ship the whole grid to the client.
```

**Cache the grid whole. Never call JamBase per photo.** Offline resolution depends on the lookup being local. The grid for a three-day festival is small enough to hold in memory on a phone.

### Fields that matter most

- **Set windows** — the join key for every photo and dwell sample. Get these exactly right; everything downstream is an interval intersection against them.
- **Third-party ID matching** — the sleeper feature described above. Carry `spotifyId` through to `SetRecord` even if nothing consumes it until 5PM.
- **Estimated audience / venue capacity** — feeds rarity honestly. Without it, path 6 has to invent tiers, and invented tiers make the product feel cheap.
- **Event status** (rescheduled / cancelled) — a set that moved must re-resolve, not silently mismatch. Carry the field even if you only log it.

### Normalisation rules
- All times → **epoch ms, UTC**. Festival timezone is `America/Los_Angeles`; convert at this boundary and nowhere else.
- `slotIndex` — order sets per stage per day by `startTime`; index 0 is the opener. Path 6 uses this for the "catch the opener" task and it exists nowhere in the JamBase payload, so you compute it.
- `isHeadliner` — last slot of the day on Lands End / Twin Peaks, or infer from estimated audience. Document whichever rule you pick.
- Missing fields become `null`, never `0` and never `""`. Path 6's rarity function must be able to tell "small crowd" from "unknown crowd."

---

## Navigation — deliberately minimal

The festival's own app does wayfinding, and a half-built map loses to a team that built only a map.

**What ships:**
- Stage list with now-playing and next, read from the cached grid
- Which cards are currently mintable near you (that list comes from path 6; you render the stage context around it)
- Nothing else

**No routing, no turn-by-turn, no crowd density, no heatmap.** If you find yourself reaching for a map library, stop — that is scope drift into the lane we explicitly do not claim.

**Say this to the judges:** *"We didn't build navigation. The festival app already does that. We built the part nobody owns."* That reads as judgment, not omission — and it beats shipping a weak map.

---

## Task list

### T+0 → T+15 · Unblock and get credentials
- [ ] Get a JamBase API key (free trial, no card).
- [ ] Agree the five stage IDs with path 2. Write them down where everyone can see them.
- [ ] Commit a hand-written `data/grid.sample.json` with 4 real artists across 3 stages so paths 2, 5, 6 can start.

### T+15 → T+30 · Talk to Andy
- [ ] Find Andy Gadiel. Ask the four questions above. This will save you more time than any code you write in the same 15 minutes.

### T+30 → T+70 · The pull
- [ ] `findFestival('Outside Lands', 2026)` → festivalId.
- [ ] `fetchGrid(festivalId)` → raw events. Dump the raw payload to disk before parsing so you can iterate without re-hitting the API.
- [ ] Inspect the actual shape. Do not code against the shape you assumed — code against the JSON in front of you.
- [ ] `toGrid()` — normalise times, map stage names to path 2's stage IDs, compute `slotIndex`, set `isHeadliner`.

### T+70 → T+95 · Enrichment
- [ ] Per-artist enrichment: `spotifyId`, `genreTags`, `nextTourDate`.
- [ ] Batch it, rate-limit politely, and cache to disk. You are running this once, not in a loop.
- [ ] Carry `estimatedAudience`, `isFestivalDebut`, `isFinalShow` if available. If a field is not exposed, tell path 6 immediately so their rarity function degrades gracefully rather than silently scoring everything the same.
- [ ] Commit the enriched `data/grid.sample.json`. **This file is the demo.**

### T+95 → T+120 · Persist and cache
- [ ] `scripts/bootstrap-grid.ts` — writes `stages` and `sets` into Convex via path 4's mutations.
- [ ] `ensureGrid()` — IndexedDB first via path 1's `loadGrid`, network only if absent or older than the event start. Never blocks a render.
- [ ] Preload the grid at app boot and hold it in memory.

### T+120 → T+150 · Now-playing surface
- [ ] `nowPlaying(grid, ts)` — per stage, current set and next set.
- [ ] `app/now/page.tsx` — five rows, stage name, who is on now, who is next, set window. Nothing else.
- [ ] Add a demo time-override (`?t=`) so the page shows a live Saturday evening rather than an empty Sunday afternoon in August. **You will need this in the demo** — the festival has not happened yet.

### T+150 → freeze
- [ ] Verify every set has a stage ID that path 2's polygons actually contain.
- [ ] Verify no set window is inverted or zero-length.
- [ ] Spot-check three artists' Spotify IDs by hand. A wrong ID on the final Wrapped card is a bad look.

---

## Acceptance criteria

1. `data/grid.sample.json` contains the **real** Outside Lands 2026 lineup with correct set times.
2. Every `SetRecord.stageId` matches a stage ID in `data/stages.json`.
3. All times are epoch ms and sort correctly across the three festival days.
4. At least the headliners carry a real `spotifyId` and a `nextTourDate` where one exists.
5. `ensureGrid()` returns a grid with the network off, from IndexedDB, in under 50ms.
6. `/now` shows a plausible now/next for all five stages given a `?t=` override.
7. Zero JamBase calls happen after bootstrap. Grep the codebase to prove it.

---

## Cut lines

1. `nextTourDate` for every artist → do the top 10 only; the Wrapped needs one.
2. `isFestivalDebut` / `isFinalShow` → tell path 6 to drop those rarity terms.
3. The `/now` page → the grid data matters far more than the surface rendering it.

**Never cut:** the real grid pull, correct set windows, or whole-grid caching. Fake set times are the fastest way to lose a judge who knows the lineup.

---

## Demo responsibilities

- Own the sentence: *"That's the real 2026 grid, pulled from JamBase and cached whole. After bootstrap we never call them again — that's why resolution works offline."*
- Own the last Wrapped card: *"The artist you spent the most time with plays Oakland in November"* — that is your Spotify ID + tour data, and it is the quietest, most convincing thirty seconds of the whole pitch.
- Have the JamBase reference open. If Andy is in the room, name the specific endpoints you used.
- Own the navigation answer: *"We didn't build navigation. The festival app already does that."*

---

## Gotchas

- Do not code against remembered API shapes. Fetch once, dump the JSON, read it, then write the parser.
- Stage names in a feed will not exactly match your polygon names ("Twin Peaks Stage" vs "Twin Peaks"). Normalise with a small explicit alias map, not fuzzy matching — five stages does not need Levenshtein.
- Timezone conversion errors show up as sets that look 7 or 8 hours off. If your Friday headliner starts at 3AM, that is the bug.
- If the 2026 grid is not published yet, use 2025's lineup with 2026 dates and **say so** in the demo rather than being caught. Honest beats fake.
- The API key goes in `JAMBASE_API_KEY` server-side. Do not ship it to the client — the client reads the cached grid, never the API.
- Do not add a map. Not even a small one.
