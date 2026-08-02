# Integration status — what's real, what's broken, how to fix it

Written 2026-08-02, verified against the live APIs with the trial key. Every fact
below was confirmed with an actual request, not read off documentation.

---

## TL;DR

| Piece | State |
|---|---|
| Capture → IndexedDB | **Works.** Real, offline, tested. |
| Stage geometry + resolution | **Works.** 40/40 tests, offline, deterministic. |
| Grid data on screen | **Works, but half-synthesized.** See §3. |
| JamBase client (`lib/grid/jambase.ts`) | **Cannot work as written.** Wrong host, wrong auth, wrong response shape. See §2. |
| Convex | **Does not exist.** Not installed, no code. See §4. |
| Sync | **Stubbed.** Acks everything, persists nothing. See §5. |
| Mint / shelf / card render / Wrapped | **No code.** Paths 6, 7, 8. |

---

## 1. Verified JamBase API facts

```
Spec      https://data.jambase.com/openapi.json   ("JamBase Concert Data API 3.1.0")
Base URL  https://api.data.jambase.com/v3
Auth      Authorization: Bearer <JAMBASE_API_KEY>
```

**The trap:** `https://data.jambase.com/v3/...` — the URL in the plan and in our
client — is the marketing SPA. It returns **HTTP 200 with HTML** for every path,
including nonsense ones. It never errors, so a broken client looks like a parsing
bug rather than a wrong host. `res.ok` is true. Check `content-type`.

The old `https://www.jambase.com/jb-api/v1` API rejects this key outright
(`api_key_invalid`) — different key generation, don't go down that road.

### Endpoints that matter

```
GET /festivals?name=Outside Lands
    → { success, pagination, festivalSeries: [...], request }
    Outside Lands → identifier "jambase:13969984", x-latestYear 2026,
                    x-apiUrl "/v3/festivals/13969984"

GET /festivals/13969984/events?perPage=100
    → { success, pagination, x-festivalSeries, events: [...] }
    19 events = one per edition (year), NOT one per performance.
    2026 edition → identifier "jambase:15738826",
                   startDate 2026-08-07, endDate 2026-08-09,
                   eventStatus "scheduled",
                   location.name "Golden Gate Park",
                   x-performerCount 94,
                   performer: [ ...94 entries... ]

GET /artists/id/jambase:49881
    → artist object with sameAs[] third-party links

GET /events?artistId=jambase:49881&perPage=5
    → 16 upcoming events with startDate, name, location.name,
      location.address.addressLocality
```

**Note the id formats.** The festival identifier comes back as `jambase:13969984`
but the events path takes the bare number `13969984` (see its own `x-apiUrl`).
The artist path, by contrast, takes the **prefixed** form: `/artists/id/jambase:49881`.
Strip for festivals, keep for artists.

### Performer shape — read this before planning around it

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

That is the complete field list across all 94 performers. There is **no stage
field and no start/end time.** Confirmed by union-ing keys across every entry.

2026 headliners per the live API: **Charli XCX** (Fri), **The Strokes**, **RÜFÜS DU SOL**.

### Third-party IDs — the sleeper feature works

`GET /artists/id/jambase:49881` returns:

```jsonc
"sameAs": [
  { "identifier": "facebook",    "url": "https://www.facebook.com/charlixcxmusic" },
  { "identifier": "instagram",   "url": "https://www.instagram.com/charli_xcx/" },
  { "identifier": "musicbrainz", "url": "https://musicbrainz.org/artist/260b6184-..." },
  { "identifier": "spotify",     "url": "https://open.spotify.com/artist/25uiPmTg16RbhZWAqwLBy5" }
]
```

Match on `identifier`, not on URL host — it's an exact string and it's stable.
Artist-name → Spotify-ID is joined for you. The final Wrapped card is cheap.

Tour dates work too: `/events?artistId=...` returns real upcoming shows with
venue and city, which is exactly the "they play Oakland in November" card.

---

## 2. Fixing `lib/grid/jambase.ts`

Four defects. The first two are one-line; the third is a rewrite.

| Line | Problem | Fix |
|---|---|---|
| [20](../lib/grid/jambase.ts#L20) | `https://data.jambase.com/v3` → SPA HTML | `https://api.data.jambase.com/v3` |
| [73](../lib/grid/jambase.ts#L73) | `?apikey=` query param | `Authorization: Bearer` header |
| [93](../lib/grid/jambase.ts#L93) | reads `data.festivals` | key is `data.festivalSeries` |
| [107–145](../lib/grid/jambase.ts#L107) | assumes flat per-performance slots with `location.name` + `startDate`/`endDate` | events are per-edition; performances live in `performer[]` with no stage or time |
| [151](../lib/grid/jambase.ts#L151) | `/artists/{id}` | `/artists/id/{id}` (keep `jambase:` prefix) |

### Drop-in replacements

```ts
const JAMBASE_BASE_URL = "https://api.data.jambase.com/v3";

async function getJson(path: string, params: Record<string, string> = {}) {
  const url = new URL(JAMBASE_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`JamBase ${path} → HTTP ${res.status} ${res.statusText}`);
  }
  // The marketing SPA answers 200/text-html on a wrong host. Fail loudly
  // instead of handing HTML to JSON.parse and blaming the parser.
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(
      `JamBase ${path} → non-JSON (${ct}). Wrong host? Base must be ` +
        `api.data.jambase.com, not data.jambase.com.`
    );
  }
  return res.json();
}

export async function findFestival(
  name: string,
  year: number
): Promise<{ festivalId: string; name: string }> {
  const data = await getJson("/festivals", { name });
  const first = data?.festivalSeries?.[0];
  if (!first) throw new Error(`No festival found for "${name}"`);
  // "jambase:13969984" → "13969984"; the events path takes the bare id.
  const festivalId = String(first.identifier).replace(/^jambase:/, "");
  return { festivalId, name: String(first.name ?? name) };
}

/**
 * Pull one festival edition and flatten its performers.
 *
 * IMPORTANT: /festivals/{id}/events returns one event per EDITION (year), not
 * per performance. Stage and set times are NOT in this feed — see §3 of
 * docs/INTEGRATION-STATUS.md. stageName and the time fields come back empty and
 * must be filled from the published stage schedule.
 */
export async function fetchGrid(
  festivalId: string,
  year = 2026
): Promise<RawJamBaseEvent[]> {
  const data = await getJson(`/festivals/${festivalId}/events`, {
    perPage: "100",
  });
  const edition = (data?.events ?? []).find((e: { name?: string }) =>
    String(e?.name ?? "").includes(String(year))
  );
  if (!edition) throw new Error(`No ${year} edition for festival ${festivalId}`);

  const status = String(edition.eventStatus ?? "scheduled").toLowerCase();
  const performers = (edition.performer ?? []) as Array<Record<string, unknown>>;

  return performers.map((p): RawJamBaseEvent => ({
    id: `${edition.identifier}:${p.identifier}`,
    artistName: String(p.name ?? "Unknown Artist"),
    jambaseArtistId: p.identifier != null ? String(p.identifier) : null,
    stageName: "",                                   // NOT in the feed
    startDate: String(p["x-performanceDate"] ?? ""), // DAY ONLY, no time
    endDate: "",                                     // NOT in the feed
    status: status.includes("cancel")
      ? "cancelled"
      : status.includes("reschedul")
        ? "rescheduled"
        : "scheduled",
    estimatedAudience: null,
    _provenance: "source:day-only",
  }));
}

export async function enrichArtist(jambaseArtistId: string): Promise<ArtistMeta> {
  // Keep the "jambase:" prefix here — this path wants the qualified id.
  const data = await getJson(`/artists/id/${jambaseArtistId}`);
  const a = (data?.artist ?? data ?? {}) as Record<string, unknown>;
  const links = (Array.isArray(a.sameAs) ? a.sameAs : []) as Array<{
    identifier?: string;
    url?: string;
  }>;
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
    nextTourDate: null, // fill via /events?artistId=... — see below
  };
}
```

### Tour dates for the last Wrapped card

```ts
export async function nextTourDate(jambaseArtistId: string) {
  const data = await getJson("/events", {
    artistId: jambaseArtistId,
    perPage: "20",
  });
  const now = Date.now();
  const upcoming = (data?.events ?? [])
    .map((e: Record<string, unknown>) => ({
      date: Date.parse(String(e.startDate)),
      venue: String((e.location as { name?: string })?.name ?? ""),
      city: String(
        ((e.location as { address?: { addressLocality?: string } })?.address
          ?.addressLocality) ?? ""
      ),
    }))
    .filter((e: { date: number }) => e.date > now)
    .sort((a: { date: number }, b: { date: number }) => a.date - b.date);
  // Prefer Bay Area, else the soonest anywhere.
  return (
    upcoming.find((e: { city: string }) =>
      /San Francisco|Oakland|Berkeley|San Jose/i.test(e.city)
    ) ?? upcoming[0] ?? null
  );
}
```

---

## 3. The stage-and-time gap — a decision, not a bug

**JamBase gives us artists and days. It does not give us stages or set times.**

What is genuinely real in [data/grid.sample.json](../data/grid.sample.json):
the artists, the three days, and the headliner assignments (Charli XCX /
The Strokes / RÜFÜS DU SOL match the live API exactly).

What is **synthesized**: every `startTime`, every `endTime`, every `stageId`.

This matters because set windows are the join key for every photo and every dwell
sample, and because the demo plan says a judge who knows the lineup will check.
The mechanic is unaffected — resolution is time-and-polygon arithmetic and does
not care where the grid came from — but "that's the real 2026 grid" is only half
true, and it's the checkable half.

Three ways to close it, best first:

1. **Ask Andy Gadiel** whether per-set stage and time data exists on another
   endpoint, another tier, or a different product. He is in the room. This is
   fifteen minutes of his time versus hours of ours, and it is the single
   highest-leverage question available today.
2. **Scrape the published stage schedule** from the Outside Lands site once the
   by-stage lineup drops, and join on artist name against the JamBase performer
   list (94 names, exact-match, no fuzzy matching needed).
3. **Keep the synthesized grid and say so.** "JamBase gave us the lineup and the
   days; the set grid is modeled until the schedule publishes." Honest, and it
   costs about four seconds of stage time.

Whatever you pick, keep `_provenance` on the records so the demo never
accidentally overclaims.

---

## 4. Convex — not started

Nothing exists. Not a directory, not a dependency.

```bash
npm install convex
npx convex dev        # links the project, writes CONVEX_DEPLOYMENT +
                      # NEXT_PUBLIC_CONVEX_URL into .env.local
```

Then build, in this order (path 4's README has the full spec):

1. `lib/types.ts` already exists — reconcile it against `docs/CONTRACTS.md` §§1–7.
2. `convex/schema.ts` — tables and indexes from CONTRACTS §8.
3. `convex/ingest.ts` — `photos` and `samples`, idempotent on `clientId`.
   Add a `clientId` index or every batch is a table scan.
4. `convex/queries.ts` — `shelf`, `mintableNow`.
5. `convex/mint.ts` — `claim`, deduped on `(userId, setId)`.

The reactive shelf is the demo beat that kills the Pokémon Go comparison, so
`useQuery` on the shelf matters more than any optimisation here.

---

## 5. Why a photo sits at "pending"

Not a bug. Three things stacked:

1. Capture writes to IndexedDB and bumps the counter. Sync deliberately never
   fires on capture — the shutter must never wait on anything.
2. The drain runs on a **30-second timer**
   ([sync.ts:232](../lib/offline/sync.ts#L232)), plus `online` and foreground
   events. So "1 pending" is expected to sit for up to 30s.
3. It is then acked by a **stub** ([sync.ts:52](../lib/offline/sync.ts#L52))
   that waits 200ms and acks every `clientId` without touching the network.
   Pending clears; nothing was persisted.

To make it real, implement `convex/ingest.ts` and swap the client:

```ts
// lib/offline/sync.ts already exposes the seam — see setIngestClient (line ~86)
setIngestClient({
  async photos(userId, eventId, photos) {
    const acked = await convex.mutation(api.ingest.photos, { userId, eventId, photos });
    return { acked };
  },
  async samples(userId, eventId, samples) {
    const acked = await convex.mutation(api.ingest.samples, { userId, eventId, samples });
    return { acked };
  },
});
```

`userId` / `eventId` are hardcoded to `"local-device"` / `"local-event"`
([sync.ts:70](../lib/offline/sync.ts#L70)) and need wiring to the real deviceId.

**Nothing renders after capture** because there is no card to render — paths 6
(mint/shelf) and 7 (card render) have no code. Photos accumulate in IndexedDB
and stop there. That is the current end of the pipeline.

---

## 6. Priority order

If the goal is the shortest path to a demo that tells the whole story:

1. **Fix `jambase.ts`** (§2) — 20 minutes, and it unblocks a real bootstrap.
2. **Ask Andy about stage/time data** (§3) — do this in parallel, it's a
   conversation not a task.
3. **Convex ingest + shelf** (§4) — this is what turns a camera into a product.
4. **Mint + spin** (path 6) — the live demo beat.
5. **Card render** (path 7) — can be built in parallel from the slot contract;
   it has no upstream dependency at all.
6. **Wrapped** (path 8) — pre-generate against seeded data, never live.

Cut order if the clock beats you, per the plan: tasks first, then extra frame
variants, then dwell. Never capture or resolution — those two are the trick, and
they already work.
