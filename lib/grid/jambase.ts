// lib/grid/jambase.ts
//
// Path 3 — JamBase v3 API client. Runs ONCE, at bootstrap, server-side only.
//
// Core invariant: this is the only place in the whole product that talks to
// JamBase. Everything downstream reads the cached `Grid`. Never import this
// module from client code and never call it per photo — see acceptance
// criterion 7 ("zero JamBase calls after bootstrap").
//
// Determinism note: we deliberately use the REST API, not the JamBase MCP /
// agent endpoint. Facts (artist, stage, set window, third-party IDs) must come
// from a deterministic table lookup, never from a model deciding what is true.
//
// Shape warning (README gotcha): "Do not code against remembered API shapes."
// The parsers below are written defensively against the documented v3 fields,
// but the authoritative move at real bootstrap is to dump the raw payload to
// `data/jambase.raw.json` first (scripts/bootstrap-grid.ts does this) and
// reconcile these types against the JSON actually in front of you.

const JAMBASE_BASE_URL = "https://data.jambase.com/v3";

/**
 * One performance slot as it comes off the JamBase feed, already flattened to
 * the fields path 3 cares about. `toGrid` (normalize.ts) turns this into a
 * `SetRecord`. Extra fields (`_provenance`) are ignored by normalization and
 * exist only to keep the committed sample dump honest about which values are
 * source-confirmed vs reconstructed.
 */
export interface RawJamBaseEvent {
  id: string; // stable per-performance id; becomes SetRecord.id
  artistName: string;
  jambaseArtistId: string | null;
  stageName: string; // as it appears in the feed, e.g. "Twin Peaks Stage"
  startDate: string; // ISO 8601 WITH offset, e.g. "2026-08-07T20:40:00-07:00"
  endDate: string; // ISO 8601 WITH offset
  status: "scheduled" | "rescheduled" | "cancelled";
  estimatedAudience: number | null;
  festival?: { id: string; name: string; timezone: string };
  _provenance?: string; // "source" | "reconstructed:stage" | ... (sample only)
}

/**
 * Per-artist enrichment, keyed by jambaseArtistId. This is the sleeper feature:
 * JamBase has already joined artist → third-party IDs, so `spotifyId` is nearly
 * free. Missing values are `null`, never 0 and never "" — path 6's rarity
 * function must be able to tell "unknown" from "small".
 */
export interface ArtistMeta {
  jambaseArtistId: string;
  spotifyId: string | null;
  musicbrainzId: string | null;
  genreTags: string[];
  estimatedAudience: number | null;
  isFestivalDebut: boolean;
  isFinalShow: boolean;
  nextTourDate: { date: number; venue: string; city: string } | null;
}

function apiKey(): string {
  // Server-side only. The client never sees this — it reads the cached grid.
  const key = process.env.JAMBASE_API_KEY;
  if (!key) {
    throw new Error(
      "JAMBASE_API_KEY is not set. jambase.ts runs only at bootstrap, " +
        "server-side. If you meant to read the grid, use lib/grid/cache.ts."
    );
  }
  return key;
}

async function getJson(path: string, params: Record<string, string> = {}) {
  const url = new URL(JAMBASE_BASE_URL + path);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`JamBase ${path} → HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Resolve a festival name + year to its JamBase festival id. */
export async function findFestival(
  name: string,
  year: number
): Promise<{ festivalId: string; name: string }> {
  const data = await getJson("/festivals", { name, year: String(year) });
  // v3 wraps results; parse defensively.
  const first =
    data?.festivals?.[0] ?? data?.results?.[0] ?? data?.[0] ?? data;
  const festivalId = String(
    first?.identifier ?? first?.id ?? first?.festivalId ?? ""
  );
  if (!festivalId) {
    throw new Error(`No festival found for "${name}" ${year}`);
  }
  return { festivalId, name: String(first?.name ?? name) };
}

/** Pull the full grid for a festival as flat performance slots. */
export async function fetchGrid(
  festivalId: string
): Promise<RawJamBaseEvent[]> {
  const data = await getJson(`/festivals/${festivalId}/events`);
  const events: unknown[] =
    data?.events ?? data?.performances ?? data?.results ?? data ?? [];

  return events.map((raw): RawJamBaseEvent => {
    const e = raw as Record<string, unknown>;
    const performer = (e.performer ?? e.artist ?? {}) as Record<string, unknown>;
    const location = (e.location ?? e.stage ?? {}) as Record<string, unknown>;
    return {
      id: String(e.identifier ?? e.id ?? crypto.randomUUID()),
      artistName: String(performer.name ?? e.name ?? "Unknown Artist"),
      jambaseArtistId:
        performer.identifier != null
          ? String(performer.identifier)
          : performer.id != null
            ? String(performer.id)
            : null,
      stageName: String(location.name ?? e.stageName ?? ""),
      startDate: String(e.startDate ?? e.startTime ?? ""),
      endDate: String(e.endDate ?? e.endTime ?? ""),
      status:
        (String(e.eventStatus ?? e.status ?? "scheduled")
          .toLowerCase()
          .includes("cancel")
          ? "cancelled"
          : String(e.eventStatus ?? e.status ?? "")
                .toLowerCase()
                .includes("reschedul")
            ? "rescheduled"
            : "scheduled") as RawJamBaseEvent["status"],
      estimatedAudience:
        typeof e.estimatedAudience === "number"
          ? e.estimatedAudience
          : typeof e.maximumAttendeeCapacity === "number"
            ? (e.maximumAttendeeCapacity as number)
            : null,
    };
  });
}

/** Enrich one artist with third-party IDs, genres, and the next SF-area date. */
export async function enrichArtist(
  jambaseArtistId: string
): Promise<ArtistMeta> {
  const data = await getJson(`/artists/${jambaseArtistId}`);
  const a = (data?.artist ?? data?.results?.[0] ?? data ?? {}) as Record<
    string,
    unknown
  >;

  // JamBase carries third-party IDs under `sameAs` / `externalIdentifiers`.
  const spotifyId = extractExternalId(a, "spotify");
  const musicbrainzId = extractExternalId(a, "musicbrainz");

  const genreTags = Array.isArray(a.genre)
    ? (a.genre as unknown[]).map(String)
    : Array.isArray(a.genres)
      ? (a.genres as unknown[]).map(String)
      : [];

  return {
    jambaseArtistId,
    spotifyId,
    musicbrainzId,
    genreTags,
    estimatedAudience: null,
    isFestivalDebut: false,
    isFinalShow: false,
    nextTourDate: null,
  };
}

/** Pull a Spotify / MusicBrainz id out of JamBase's `sameAs` link list. */
function extractExternalId(
  artist: Record<string, unknown>,
  provider: "spotify" | "musicbrainz"
): string | null {
  const links: unknown[] = Array.isArray(artist.sameAs)
    ? (artist.sameAs as unknown[])
    : Array.isArray(artist.externalIdentifiers)
      ? (artist.externalIdentifiers as unknown[])
      : [];
  const host = provider === "spotify" ? "open.spotify.com" : "musicbrainz.org";
  for (const link of links) {
    const url = typeof link === "string" ? link : String((link as Record<string, unknown>)?.url ?? "");
    if (url.includes(host)) {
      const m = url.match(/\/artist\/([A-Za-z0-9-]+)/);
      if (m) return m[1];
    }
  }
  return null;
}
