# JamBase — complete implementation brief

**One person owns this end to end.** Everything you need is in this document; you should not have to read the other docs to do the work.

Every API fact below was verified with a live request against the trial key on 2026-08-02. Nothing here is from documentation or memory.

---

## 1. What you are building and why it matters

The product is a Spotify Wrapped for a music festival, built on presence instead of streams. Someone walks around Outside Lands, takes photos, stands in front of stages. We turn that into artist cards and a Sunday-night Wrapped.

The core invariant of the whole system:

> **Deterministic code decides what happened. The model only writes the sentence around it.**

Your piece is the "what is true" half. The division of labour across the three sponsors:

- **JamBase decides what is true** — who played, where, when. ← **you**
- **Convex holds what you collected.**
- **OpenAI describes what it sees and says it well.**

Two things make your path high-stakes:

**A judge will fact-check you.** The demo shows real artists at real times. Someone in that room knows the Outside Lands lineup. If the grid is wrong, it is the most checkable thing on screen.

**You own the sleeper feature.** Artist name → Spotify ID is normally the ugliest part of any music project: fuzzy matching, disambiguation, three bands with the same name. JamBase has already joined it. That single field makes the final Wrapped card — *"the artist you spent the most time with plays Oakland in November, one tap to hear them first"* — nearly free. It is the quietest and most convincing moment in the pitch, and it is yours.

**One hard rule:** the grid is fetched **once**, at bootstrap, and cached whole. Never call JamBase per photo. Offline resolution depends entirely on the lookup being local — the network at a 75,000-person festival is functionally gone, and everything downstream reads the cache.

---

## 2. Credentials

Already in `.env.local` (gitignored, verified absent from all commits):

```
JAMBASE_API_KEY=jbd_trial_...
```

Server-side only. The client never sees this key — it reads the cached grid. If you find yourself importing `lib/grid/jambase.ts` from a client component, stop.

---

## 3. Verified API facts

```
Spec      https://data.jambase.com/openapi.json     ("JamBase Concert Data API 3.1.0")
Base URL  https://api.data.jambase.com/v3
Auth      Authorization: Bearer <JAMBASE_API_KEY>
```

### The trap that will cost you an hour if you skip this

`https://data.jambase.com/v3/...` — the URL written in the original architecture plan, and the one currently hardcoded in our client — is the **marketing SPA**. It returns **HTTP 200 with `text/html`** for every path, including nonsense ones. `res.ok` is `true`. Nothing throws. Your JSON parser gets a `<!doctype html>` and you spend an hour debugging a parser that is fine.

Always assert `content-type` includes `application/json`. Code for it is in §6.

The old `https://www.jambase.com/jb-api/v1` API is a different product and rejects this key outright with `api_key_invalid`. Don't go down that road.

### Endpoints and real response shapes

**Resolve the festival**
```
GET /festivals?name=Outside Lands
→ { success, pagination, festivalSeries: [...], request }
```
```jsonc
{
  "@type": "FestivalSeries",
  "identifier": "jambase:13969984",
  "name": "Outside Lands",
  "x-editionCount": 19,
  "x-latestYear": 2026,
  "x-latestCity": "San Francisco",
  "x-apiUrl": "/v3/festivals/13969984"
}
```

**Note the id formats — this bites.** The identifier is `jambase:13969984`, but the events path takes the **bare number** `13969984` (see its own `x-apiUrl`). The artist path, by contrast, takes the **prefixed** form. Strip for festivals, keep for artists.

**Pull the editions**
```
GET /festivals/13969984/events?perPage=100
→ { success, pagination, x-festivalSeries, events: [...] }   // 19 events
```

Nineteen events = **one per edition (year)**, not one per performance. This is the single biggest shape surprise. Find the 2026 one:

```jsonc
{
  "identifier": "jambase:15738826",
  "name": "Outside Lands 2026",
  "startDate": "2026-08-07",
  "endDate": "2026-08-09",
  "eventStatus": "scheduled",
  "location": { "@type": "MusicVenue", "name": "Golden Gate Park",
                "address": { "addressLocality": "San Francisco", "addressRegion": "California" } },
  "x-performerCount": 94,
  "performer": [ /* 94 entries */ ]
}
```

**Performer entry — this is the complete field list**, union-ed across all 94:

```jsonc
{
  "@type": "MusicGroup",
  "name": "Charli XCX",
  "identifier": "jambase:49881",
  "image": "https://...",
  "genre": ["indie", "pop"],
  "x-performanceDate": "2026-08-07",   // DAY ONLY
  "x-performanceRank": 1,
  "x-isHeadliner": true
}
```

**There is no stage field and no start/end time.** See §5 — this is the one real decision on your path.

Real 2026 headliners per the live API: **Charli XCX** (Fri), **The Strokes**, **RÜFÜS DU SOL**.

**Enrich an artist — the sleeper feature**
```
GET /artists/id/jambase:49881          // keep the "jambase:" prefix here
```
```jsonc
"sameAs": [
  { "identifier": "facebook",    "url": "https://www.facebook.com/charlixcxmusic" },
  { "identifier": "instagram",   "url": "https://www.instagram.com/charli_xcx/" },
  { "identifier": "musicbrainz", "url": "https://musicbrainz.org/artist/260b6184-8828-48eb-945c-bc4cb6fc34ca" },
  { "identifier": "officialSite","url": "http://www.charlixcxmusic.com/" },
  { "identifier": "spotify",     "url": "https://open.spotify.com/artist/25uiPmTg16RbhZWAqwLBy5" }
]
```

Match on the `identifier` field, **not** on the URL host. It is an exact string and it is stable.

**Tour dates for the last Wrapped card**
```
GET /events?artistId=jambase:49881&perPage=20
→ 16 upcoming events
   2026-08-07  Outside Lands         Golden Gate Park — San Francisco
   2026-08-27  Reading Festival      Richfield Avenue — Reading
   2026-09-11  Charli XCX at ...     Xfinity Mobile Arena — Philadelphia
```

Fields you want: `startDate`, `name`, `location.name`, `location.address.addressLocality`.

---

## 4. What already exists in the repo

Phase 1 built the scaffolding. Your job is to make it correct and run it.

| File | State |
|---|---|
| `lib/grid/jambase.ts` | API client. **Cannot work as written** — four defects, see §6. |
| `lib/grid/normalize.ts` | `toGrid(raw, stages, meta)` → `Grid`. Written against the assumed shape; needs reconciling with §3. |
| `lib/grid/cache.ts` | Client-side cache. Reads `data/grid.sample.json`, falls back through IndexedDB. **Works.** |
| `lib/grid/nowPlaying.ts` | now/next per stage. **Works**, drives `/now`. |
| `scripts/bootstrap-grid.ts` | Orchestrates pull → enrich → `toGrid` → Convex → writes `data/grid.sample.json`. |
| `data/grid.sample.json` | The committed grid the whole app currently reads. Artists real, times synthesized (§5). |
| `data/stages.json` | Five hand-traced polygons. **Canonical geometry — do not duplicate it.** |
| `convex/grid.ts` | Exports `upsertEvent`, `upsertStages`, `upsertSets`. |
| `lib/types.ts` | `Grid`, `SetRecord`, `Stage` contracts. Do not redefine these locally. |

**A mismatch to fix:** `scripts/bootstrap-grid.ts` expects a mutation called `api.grid.bootstrap`, but `convex/grid.ts` actually exports three separate mutations. Either add a `bootstrap` wrapper in `convex/grid.ts` or call the three in sequence from the script. Pick one and make them agree.

The `Grid` shape you must produce (from `lib/types.ts`):

```ts
interface Grid {
  festivalId: string;
  eventName: string;      // "Outside Lands 2026"
  timezone: string;       // "America/Los_Angeles"
  fetchedAt: number;
  stages: Stage[];        // from data/stages.json — NOT hand-made
  sets: SetRecord[];
}

interface SetRecord {
  id: string; stageId: string; artistName: string;
  startTime: number; endTime: number;      // epoch ms, UTC
  slotIndex: number;                       // 0 = opener of the day on that stage
  isHeadliner: boolean;
  estimatedAudience: number | null;
  isFestivalDebut: boolean; isFinalShow: boolean;
  genreTags: string[];
  jambaseArtistId: string | null;
  spotifyId: string | null;
  nextTourDate: { date: number; venue: string; city: string } | null;
}
```

**Missing values are `null`, never `0` and never `""`.** The rarity scorer must be able to tell "small crowd" from "unknown crowd" — if you write `0`, every card silently scores identically.

---

## 5. The one real decision: stages and set times

**JamBase gives us artists and days. It does not give us stages or set times.**

What is genuinely real in `data/grid.sample.json` today: the artists, the three days, and the headliner assignments (they match the live API exactly).

What is **synthesized**: every `startTime`, every `endTime`, every `stageId`.

This matters because set windows are the join key for every photo and every dwell sample, and because the demo says a judge who knows the lineup will check. The mechanic is unaffected — resolution is time-and-polygon arithmetic and does not care where the grid came from — but *"that's the real 2026 grid"* is only half true, and it is the checkable half.

Three ways to close it, best first:

1. **Ask Andy Gadiel.** JamBase's founder/CEO is mentoring in the room. Ask whether per-set stage and time data exists on another endpoint, another tier, or a different product. Fifteen minutes of his time beats hours of ours, and this is the highest-leverage thing available to you today. Bring specific questions: *is there a per-performance endpoint with stage and set times for a festival edition, and if not, what do partners typically join against?*
2. **Scrape the published stage schedule** from the Outside Lands site once the by-stage lineup drops, and join on artist name against the 94-name JamBase performer list. Exact match, no fuzzy matching needed at that size.
3. **Keep the synthesized grid and say so.** *"JamBase gave us the lineup and the days; the set grid is modeled until the schedule publishes."* Honest, costs four seconds of stage time, and is far better than being caught.

Whichever you pick, keep a `_provenance` field on each record so the demo never accidentally overclaims. `RawJamBaseEvent` already has the field.

---

## 6. The four defects in `lib/grid/jambase.ts`

| Line | Problem | Fix |
|---|---|---|
| 20 | `https://data.jambase.com/v3` → SPA HTML | `https://api.data.jambase.com/v3` |
| 73 | `?apikey=` query param | `Authorization: Bearer` header |
| 93 | reads `data.festivals` | the key is `data.festivalSeries` |
| 107–145 | assumes flat per-performance slots with `location.name` and `startDate`/`endDate` | events are per-edition; performances are in `performer[]` |
| 151 | `/artists/{id}` | `/artists/id/{id}` — and keep the `jambase:` prefix |

### Drop-in replacements

```ts
const JAMBASE_BASE_URL = "https://api.data.jambase.com/v3";

async function getJson(path: string, params: Record<string, string> = {}) {
  const url = new URL(JAMBASE_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`JamBase ${path} → HTTP ${res.status} ${res.statusText}`);

  // The marketing SPA answers 200/text-html on a wrong host. Fail loudly instead
  // of handing HTML to JSON.parse and then blaming the parser.
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(
      `JamBase ${path} → non-JSON (${ct}). Wrong host? Base must be ` +
      `api.data.jambase.com, not data.jambase.com.`
    );
  }
  return res.json();
}

export async function findFestival(name: string, year: number) {
  const data = await getJson("/festivals", { name });
  const first = data?.festivalSeries?.[0];
  if (!first) throw new Error(`No festival found for "${name}"`);
  // "jambase:13969984" → "13969984"; the events path takes the bare id.
  return {
    festivalId: String(first.identifier).replace(/^jambase:/, ""),
    name: String(first.name ?? name),
  };
}

/**
 * Pull one festival edition and flatten its performers.
 *
 * /festivals/{id}/events returns one event per EDITION (year), not per
 * performance. Stage and set times are NOT in this feed — see §5. stageName and
 * the time fields come back empty and must be filled from the stage schedule.
 */
export async function fetchGrid(festivalId: string, year = 2026): Promise<RawJamBaseEvent[]> {
  const data = await getJson(`/festivals/${festivalId}/events`, { perPage: "100" });
  const edition = (data?.events ?? []).find((e: { name?: string }) =>
    String(e?.name ?? "").includes(String(year)));
  if (!edition) throw new Error(`No ${year} edition for festival ${festivalId}`);

  const status = String(edition.eventStatus ?? "scheduled").toLowerCase();
  const performers = (edition.performer ?? []) as Array<Record<string, unknown>>;

  return performers.map((p): RawJamBaseEvent => ({
    id: `${edition.identifier}:${p.identifier}`,
    artistName: String(p.name ?? "Unknown Artist"),
    jambaseArtistId: p.identifier != null ? String(p.identifier) : null,
    stageName: "",                                    // NOT in the feed
    startDate: String(p["x-performanceDate"] ?? ""),  // DAY ONLY, no time
    endDate: "",                                      // NOT in the feed
    status: status.includes("cancel") ? "cancelled"
          : status.includes("reschedul") ? "rescheduled" : "scheduled",
    estimatedAudience: null,
    _provenance: "source:day-only",
  }));
}

export async function enrichArtist(jambaseArtistId: string): Promise<ArtistMeta> {
  // Keep the "jambase:" prefix — this path wants the qualified id.
  const data = await getJson(`/artists/id/${jambaseArtistId}`);
  const a = (data?.artist ?? data ?? {}) as Record<string, unknown>;
  const links = (Array.isArray(a.sameAs) ? a.sameAs : []) as Array<{ identifier?: string; url?: string }>;
  const idFrom = (provider: string) => {
    const hit = links.find((l) => l.identifier === provider);
    const m = hit?.url?.match(/\/artist\/([A-Za-z0-9-]+)/);
    return m ? m[1] : null;
  };

  return {
    jambaseArtistId,
    spotifyId: idFrom("spotify"),
    musicbrainzId: idFrom("musicbrainz"),
    genreTags: Array.isArray(a.genre) ? (a.genre as unknown[]).map(String) : [],
    estimatedAudience: null,
    isFestivalDebut: false,
    isFinalShow: false,
    nextTourDate: null,   // filled by nextTourDate() below
  };
}

/** The last Wrapped card: "they play Oakland in November." */
export async function nextTourDate(jambaseArtistId: string) {
  const data = await getJson("/events", { artistId: jambaseArtistId, perPage: "20" });
  const now = Date.now();
  const upcoming = (data?.events ?? [])
    .map((e: Record<string, unknown>) => ({
      date: Date.parse(String(e.startDate)),
      venue: String((e.location as { name?: string })?.name ?? ""),
      city: String(((e.location as { address?: { addressLocality?: string } })?.address?.addressLocality) ?? ""),
    }))
    .filter((e: { date: number }) => Number.isFinite(e.date) && e.date > now)
    .sort((a: { date: number }, b: { date: number }) => a.date - b.date);
  // Prefer Bay Area, else the soonest anywhere.
  return upcoming.find((e: { city: string }) =>
    /San Francisco|Oakland|Berkeley|San Jose/i.test(e.city)) ?? upcoming[0] ?? null;
}
```

---

## 7. Normalisation rules

These are yours to enforce and nobody downstream can fix them for you.

- **All times → epoch ms, UTC.** The festival timezone is `America/Los_Angeles`. Convert at this boundary and nowhere else. If your Friday headliner starts at 3AM, this is your bug.
- **`slotIndex`** — order sets per stage per day by `startTime`; index 0 is the opener. This does not exist in the JamBase payload; you compute it. The "catch the opener" task depends on it.
- **`isHeadliner`** — the API gives you `x-isHeadliner` directly. Use it.
- **`stageId`** must match an id in `data/stages.json`: `lands-end`, `twin-peaks`, `sutro`, `soma`, `duboce-triangle`. Stage names in any schedule you scrape will not match exactly ("Twin Peaks Stage" vs "Twin Peaks") — use a small explicit alias map, not fuzzy matching. Five stages does not need Levenshtein.
- **`Grid.stages` must come from `data/stages.json`**, loaded via `loadStages()` in `lib/geo/polygons.ts`. Do **not** hand-write polygons into the grid. This exact bug already happened once: `grid.sample.json` carried its own coarse 4-point polygons while `stages.json` had the traced 6-point ones, and because `cache.ts` uses the bundled grid verbatim, the app resolved photos against the wrong geometry. One source of truth.
- **Event status** — a set that JamBase marks rescheduled or cancelled must re-resolve, not silently mismatch. Carry the field even if you only log it.

---

## 8. Step by step

1. **Talk to Andy** (§5). Do this first; it may change everything below.
2. **Fix `lib/grid/jambase.ts`** with §6. Twenty minutes.
3. **Dump the raw payload before parsing.** `scripts/bootstrap-grid.ts` already writes `data/jambase.raw.json`. Read the JSON in front of you rather than the shape you assumed — that habit is why we caught the per-edition surprise.
4. **Reconcile `lib/grid/normalize.ts`** against the real shape. It was written for flat performance slots.
5. **Enrich.** Batch politely, cache to disk. You are running this once, not in a loop. Do the headliners first — if you run out of time, ten enriched artists beats ninety-four unenriched.
6. **Resolve the stage/time gap** per whichever §5 option you chose.
7. **Write to Convex.** Fix the `api.grid.bootstrap` vs `upsertEvent`/`upsertStages`/`upsertSets` mismatch (§4).
8. **Commit the enriched `data/grid.sample.json`.** This file *is* the demo — the app reads it today and will keep reading it as the offline fallback.
9. **Verify against the geo tests.** `npm test` — the geo suite asserts every set's `stageId` exists in the polygons and that Lands End is programmed. If you break the grid, those 82 tests tell you immediately.

---

## 9. Acceptance criteria

1. `data/grid.sample.json` contains the real Outside Lands 2026 lineup — verifiable against jambase.com.
2. Every `SetRecord.stageId` matches a stage id in `data/stages.json`.
3. `Grid.stages` is byte-identical to `loadStages()` output — no duplicated geometry.
4. All times are epoch ms and sort correctly across the three festival days; no set window is inverted or zero-length.
5. At least the three headliners carry a real `spotifyId`, spot-checked by hand against open.spotify.com.
6. At least one artist has a real `nextTourDate` — the final Wrapped card needs exactly one.
7. `ensureGrid()` returns a grid with the network off, from cache, in under 50ms.
8. **Zero JamBase calls happen after bootstrap.** Grep the codebase to prove it.
9. `npm test` still passes 82/82.

---

## 10. Gotchas

- **Do not code against remembered API shapes.** Fetch once, dump the JSON, read it, then write the parser. Every surprise in this document was found that way.
- **The SPA returns 200.** Assert `content-type`. This is the single most likely hour you will lose.
- **Id prefixes are inconsistent** — bare number for festivals, `jambase:`-prefixed for artists. Both are correct; they are just different.
- **Timezone errors are invisible to you** and obvious in the data. A 7–8 hour offset means you skipped the UTC conversion.
- **The key is server-side only.** The client reads the cached grid, never the API.
- **Do not add a map.** Not even a small one. The festival's own app does wayfinding; we deliberately do not compete there, and the line *"We didn't build navigation — we built the part nobody owns"* reads as judgment rather than omission.
- If the 2026 grid is ever unavailable, use 2025's lineup with 2026 dates **and say so** rather than being caught. Honest beats fake.

---

## 11. What to say in the demo

- *"That's the real 2026 grid, pulled from JamBase and cached whole. After bootstrap we never call them again — that's why resolution works offline."*
- *"Artist resolution is a table lookup against that cached grid. There's no model anywhere in the fact path."*
- And the closer, which is your field doing the work: *"The artist you spent the most time with plays Oakland in November. One tap to hear them first."*
