# Path 2 — Stage Geometry & Resolution

**Branch:** `path/2-geo-resolution`
**Mission:** Turn a coordinate and a timestamp into a stage and an artist. Offline, deterministically, every time.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts before writing code.**

---

## Why this path exists

This is the magic trick. A judge watches a photo become "Hozier, Lands End, 7:40 PM" with nothing typed and no network, and that is the moment the product lands.

It is also the load-bearing wall under the core invariant: **deterministic code decides what happened; the model only writes the sentence around it.** Every claim in a Wrapped traces back through your functions to a coordinate and a timestamp. If your polygons are sloppy, every downstream fact is a lie told confidently.

You own step 2 of the build order — the other step that must never be cut.

---

## Scope

**In**
- Five hand-drawn stage polygons plus non-stage zones, stored as coordinate arrays
- Ray-cast point-in-polygon, buffer handling, overlap tie-break
- Haversine distance
- Grid lookup: `(stageId, ts) → setId`, with the ±15 min grace window
- The combined `resolve()` entry point, plus a coordinate-spoof fixture set for the demo
- A visual debug page so everyone can see the polygons on a map

**Out**
- Fetching the grid from JamBase → **path 3** (you consume the cached `Grid`)
- Grouping samples into dwell runs → **path 5** (you resolve individual points; they group them)
- Mint eligibility → **path 6** (you supply the stage and set; they decide)
- IndexedDB → **path 1**

---

## Files you own

```
data/stages.json                the five polygons + non-stage zones
lib/geo/polygons.ts             loader, typed access, centroid computation
lib/geo/inPolygon.ts            ray casting, haversine, buffer math
lib/geo/resolve.ts              resolveStage, lookupSet, resolve
lib/geo/fixtures.ts             known-good coordinates for tests + demo spoof
app/debug/map/page.tsx          polygon visualiser (dev only)
lib/geo/__tests__/              unit tests
```

**Do not edit:** `lib/types.ts`, `convex/*`, `lib/offline/*`, `lib/grid/*`.

---

## Contracts

### You publish

```ts
// lib/geo/resolve.ts
resolveStage(pt: LatLng, stages: Stage[]): StageId | null
inPolygon(pt: LatLng, poly: PolyPoint[]): boolean
distanceMeters(a: LatLng, b: LatLng): number
lookupSet(stageId: StageId, ts: number, grid: Grid, graceMs?: number): SetId | null
resolve(pt: LatLng, ts: number, grid: Grid): { stageId: StageId | null; setId: SetId | null }

// lib/geo/fixtures.ts
export const STAGE_CENTROIDS: Record<string, LatLng>   // demo spoof targets
export const OFF_STAGE_POINTS: LatLng[]                // Wine Lands, paths, gates
```

Everything is **pure**. No I/O, no async, no fetch. It runs client-side so it works offline, and it runs server-side unchanged in the Convex resolver.

### You consume
- `Grid` from path 3. Until it exists, use `data/grid.sample.json` — coordinate a small hand-written stub with path 3 in the first ten minutes so you are not blocked.

---

## Polygon definition

Draw five polygons by hand from satellite imagery, stored as coordinate arrays. **This is a 20-minute task and it is worth doing carefully** — every downstream fact depends on it.

```js
stages = [
  { name: "Lands End",       polygon: [[lat,lng], ...], buffer: 30 },
  { name: "Twin Peaks",      polygon: [...],            buffer: 30 },
  { name: "Sutro",           polygon: [...],            buffer: 25 },
  { name: "SOMA",            polygon: [...],            buffer: 20 },
  { name: "Duboce Triangle", polygon: [...],            buffer: 45 },  // eucalyptus drift
]
```

Buffers in metres. **Duboce Triangle gets the largest** because tree canopy at McLaren Pass degrades GPS most. This is not a guess — it is the one venue fact that most directly changes a constant in the code, and saying so out loud in the demo reads as having actually thought about the park.

Stages sit in separate meadows — Polo Field, Hellman Hollow, Lindley Meadow, Marx Meadow — so point-in-polygon is unambiguous. **We are not disambiguating two tents 50m apart.** Draw generously around the crowd area, not tightly around the stage structure; people stand *in front of* a stage, sometimes 100m back.

### How to draw them
1. Open Google Maps satellite over Golden Gate Park, western half.
2. Find each meadow. Right-click → copy the coordinates at each corner of the crowd bowl.
3. 5–8 points per polygon is plenty. Trace the meadow edge, not the stage.
4. Paste into `data/stages.json` as `[lat, lng]` pairs, in order, going one direction around the shape.
5. Compute centroids programmatically — do not eyeball them; the overlap tie-break depends on them.

### Point-in-polygon

Standard ray casting. Runs client-side so it works offline.

```js
function inPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > pt.lng) !== (yj > pt.lng)) &&
      (pt.lat < (xj - xi) * (pt.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
```

**Overlap rule:** if a point falls in two buffered polygons, resolve to the nearer centroid. Meadows are far enough apart that this should be rare, but handle it rather than letting it be nondeterministic.

**Null is a valid answer.** A sample in transit, at Wine Lands, or at a food vendor resolves to `null`. Null samples break dwell continuity, which is correct — walking to get a drink should end your dwell streak. Do not "snap to nearest stage." That would manufacture presence, and manufacturing presence is the one thing this product cannot do.

### Buffer implementation

Simplest correct approach: test raw `inPolygon` first; if false, test whether the point is within `bufferMeters` of the polygon's nearest edge segment. Point-to-segment distance in metres via haversine on the projected foot of the perpendicular. If you are short on time, an approximation — inflate by converting metres to a degree delta at latitude 37.77 (`1° lat ≈ 111_320 m`, `1° lng ≈ 111_320 × cos(37.77°) ≈ 88_000 m`) — is acceptable and nobody will catch it.

---

## Grid lookup

```ts
lookupSet(stageId, ts, grid, graceMs = 15 * 60_000)
```

- Filter `grid.sets` to that `stageId`, find the set where `startTime - grace ≤ ts ≤ endTime + grace`.
- If two match inside the grace overlap (end of one, start of the next), prefer the one whose **unpadded** window contains `ts`; if neither does, prefer the nearer midpoint.
- Return `null` between sets and after the last set. Null is fine.

**Grace applies to mint eligibility only.** Dwell arithmetic (path 5) intersects with the *unpadded* window. Keep the two straight — a card you earned by arriving two minutes early is generous and good; 15 free minutes of dwell time is a fabricated stat.

**Event status matters:** a set that JamBase marks rescheduled or cancelled must re-resolve, not silently mismatch. If path 3 surfaces a status field, honour it.

---

## Task list

### T+0 → T+10 · Unblock everyone
- [ ] Agree a `Grid` stub shape with path 3 and commit `data/grid.sample.json` with 3–4 fake sets. Paths 5 and 6 are blocked on you; get something importable within ten minutes.

### T+10 → T+35 · Polygons
- [ ] Trace all five stage polygons from satellite imagery into `data/stages.json`.
- [ ] Add non-stage zones (Wine Lands, Beer Lands, Grass Lands, Dolores) — you do not need them to resolve, but having them makes the debug map legible and proves the null case is intentional.
- [ ] Compute and store centroids.
- [ ] Set buffers: Lands End 30, Twin Peaks 30, Sutro 25, SOMA 20, Duboce Triangle 45.

### T+35 → T+60 · Geometry core
- [ ] `inPolygon` (ray cast, from the snippet above — it is correct, do not rewrite it from memory).
- [ ] `distanceMeters` (haversine).
- [ ] Buffer test: point-to-polygon-edge distance.
- [ ] `resolveStage` with the nearer-centroid overlap tie-break.

### T+60 → T+80 · Grid lookup
- [ ] `lookupSet` with grace window and the boundary tie-break.
- [ ] `resolve()` combining both.
- [ ] `lib/geo/fixtures.ts` — one known-inside coordinate per stage, plus 4–5 known-outside points.

### T+80 → T+105 · Debug map
- [ ] `app/debug/map/page.tsx` — draw the polygons over a static map image or a plain SVG with a lat/lng projection. Plot the current device position as a dot.
- [ ] Show the live resolution result as text: `stage → set → artist`.
- [ ] This page is how the whole team sanity-checks geography, and it is a strong fallback demo artifact if something else breaks.

### T+105 → freeze · Tests and hardening
- [ ] Unit tests: every fixture point resolves to the expected stage; every off-stage point resolves to `null`.
- [ ] Boundary tests: a point 5m outside Duboce Triangle resolves *in* (45m buffer); a point 100m outside resolves `null`.
- [ ] Overlap test: construct two artificially overlapping polygons, confirm the nearer centroid wins deterministically.
- [ ] Time tests: mid-set → set; between sets → null; 10 min before start → set (grace); 20 min before → null.

---

## Acceptance criteria

1. `resolve(landsEndCentroid, midHozierSet, grid)` returns the Hozier set. No network involved.
2. `resolve(wineLandsPoint, anyTime, grid)` returns `{ stageId: null, setId: null }`.
3. A point 5m outside the Duboce Triangle polygon resolves inside; 100m outside resolves null.
4. Two runs on the same input always return the same answer — no randomness, no time-of-day dependence beyond the passed `ts`.
5. The debug map renders all five polygons in roughly the right places over Golden Gate Park's western half.
6. Every function is pure and runs unchanged in a browser and in a Convex action.

---

## Cut lines

1. Non-stage zones in `stages.json` → nice for the debug map, not needed to resolve.
2. Exact point-to-segment buffer math → the degree-delta approximation is fine.
3. The debug map's real basemap → a plain SVG with axis-scaled coordinates conveys it.

**Never cut:** the five polygons, `inPolygon`, `lookupSet`, or the null case. Snapping a null to the nearest stage to "make the demo cleaner" breaks the invariant and is worse than the demo showing null.

---

## Demo responsibilities

- Own the sentence: *"Stage resolution is point-in-polygon. Artist resolution is a table lookup. There is no model anywhere in this path."*
- Have the debug map open on a second tab. If a judge asks "how do you know they were there," you show polygons, not a paragraph.
- Own the Duboce Triangle detail: *"That one gets a 45-metre buffer because it sits in eucalyptus at McLaren Pass and the canopy wrecks GPS."* It is the line that proves you know the actual park.
- Make sure the spoof fixtures used in the live mint land unambiguously inside a polygon. Coordinate with paths 1 and 6.

---

## Gotchas

- The ray-cast snippet uses `lat` as x and `lng` as y. That is fine and self-consistent — **just do not mix conventions halfway through.** Latitude first, everywhere.
- Golden Gate Park is at ~37.77 N, ~122.49 W. Longitude is **negative**. A dropped minus sign puts you in Uzbekistan and every test still "passes" against equally wrong fixtures.
- Do not use a turf.js-style dependency for this. It is 40 lines, it must run offline, and the whole point is that you can explain it in one breath.
- Polygons must not self-intersect. Trace in one consistent direction.
- Set windows from JamBase are timezone-sensitive. Normalise to epoch ms at the boundary (path 3's job) and only ever compare numbers inside your code.
- Do not cache resolution results keyed by coordinate alone. The same coordinate at two different times is two different sets.
