// Path 3 — JamBase v3 API client. This module is server-only and is used once
// during grid bootstrap; the application reads the cached Grid afterwards.

const JAMBASE_BASE_URL = "https://api.data.jambase.com/v3";

export interface RawJamBaseEvent {
  id: string;
  artistName: string;
  jambaseArtistId: string | null;
  stageName: string;
  startDate: string;
  endDate: string;
  status: "scheduled" | "rescheduled" | "cancelled";
  estimatedAudience: number | null;
  isHeadliner?: boolean;
  performanceRank?: number | null;
  genreTags?: string[];
  festival?: { id: string; name: string; timezone: string };
  _provenance?: string;
}

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
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `JamBase ${path} → HTTP ${response.status} ${response.statusText}`
    );
  }

  // data.jambase.com is a marketing SPA that returns 200/text-html even for
  // nonsense paths. Guard the media type so a wrong host fails explicitly.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `JamBase ${path} → non-JSON (${contentType}). Wrong host? Base must be ` +
        "api.data.jambase.com, not data.jambase.com."
    );
  }
  return response.json();
}

/** Resolve a festival series. The edition endpoint requires its bare id. */
export async function findFestival(
  name: string,
  _year: number
): Promise<{ festivalId: string; name: string }> {
  const data = await getJson("/festivals", { name });
  const first = data?.festivalSeries?.[0];
  if (!first?.identifier) {
    throw new Error(`No festival found for "${name}"`);
  }
  return {
    festivalId: String(first.identifier).replace(/^jambase:/, ""),
    name: String(first.name ?? name),
  };
}

/**
 * Select one yearly festival edition and flatten its performer array.
 * JamBase supplies only performance day here: stage and clock times must be
 * joined from the published stage schedule later in bootstrap.
 */
export async function fetchGrid(
  festivalId: string,
  year = 2026
): Promise<RawJamBaseEvent[]> {
  // Be tolerant if a caller passes findFestival's source identifier directly.
  const bareFestivalId = festivalId.replace(/^jambase:/, "");
  const data = await getJson(`/festivals/${bareFestivalId}/events`, {
    perPage: "100",
  });
  const edition = (Array.isArray(data?.events) ? data.events : []).find(
    (candidate: { name?: unknown; startDate?: unknown }) =>
      String(candidate?.name ?? "").includes(String(year)) ||
      String(candidate?.startDate ?? "").startsWith(`${year}-`)
  );
  if (!edition) {
    throw new Error(`No ${year} edition for festival ${bareFestivalId}`);
  }

  const editionId = String(edition.identifier ?? `${bareFestivalId}:${year}`);
  const eventStatus = String(edition.eventStatus ?? "scheduled").toLowerCase();
  const status: RawJamBaseEvent["status"] = eventStatus.includes("cancel")
    ? "cancelled"
    : eventStatus.includes("reschedul")
      ? "rescheduled"
      : "scheduled";
  const performers = Array.isArray(edition.performer) ? edition.performer : [];

  return performers.map((performer: Record<string, unknown>, index: number) => {
    const artistId =
      performer.identifier == null ? null : String(performer.identifier);
    return {
      id: `${editionId}:${artistId ?? `performer-${index}`}`,
      artistName: String(performer.name ?? "Unknown Artist"),
      jambaseArtistId: artistId,
      stageName: "",
      startDate: String(performer["x-performanceDate"] ?? ""),
      endDate: "",
      status,
      estimatedAudience: null,
      isHeadliner: performer["x-isHeadliner"] === true,
      performanceRank:
        typeof performer["x-performanceRank"] === "number"
          ? performer["x-performanceRank"]
          : null,
      genreTags: Array.isArray(performer.genre)
        ? performer.genre.map(String)
        : [],
      festival: {
        id: bareFestivalId,
        name: String(edition.name ?? `Festival ${year}`),
        timezone: "America/Los_Angeles",
      },
      _provenance: "source:day-only",
    };
  });
}

/** Enrich an artist using the qualified `jambase:` identifier. */
export async function enrichArtist(
  jambaseArtistId: string
): Promise<ArtistMeta> {
  const data = await getJson(`/artists/id/${jambaseArtistId}`);
  const artist = (data?.artist ?? data ?? {}) as Record<string, unknown>;
  const links = (Array.isArray(artist.sameAs) ? artist.sameAs : []) as Array<{
    identifier?: unknown;
    url?: unknown;
  }>;
  const externalId = (provider: "spotify" | "musicbrainz") => {
    // Provider identity is authoritative. Do not infer it from the URL host.
    const link = links.find((candidate) => candidate.identifier === provider);
    const match = String(link?.url ?? "").match(/\/artist\/([A-Za-z0-9-]+)/);
    return match?.[1] ?? null;
  };

  return {
    jambaseArtistId,
    spotifyId: externalId("spotify"),
    musicbrainzId: externalId("musicbrainz"),
    genreTags: Array.isArray(artist.genre) ? artist.genre.map(String) : [],
    estimatedAudience: null,
    isFestivalDebut: false,
    isFinalShow: false,
    nextTourDate: null,
  };
}

/** Return the next Bay Area date when available, otherwise the nearest date. */
export async function nextTourDate(
  jambaseArtistId: string
): Promise<{ date: number; venue: string; city: string } | null> {
  const data = await getJson("/events", {
    artistId: jambaseArtistId,
    perPage: "20",
  });
  const now = Date.now();
  const upcoming = (Array.isArray(data?.events) ? data.events : [])
    .map((event: Record<string, unknown>) => {
      const location = (event.location ?? {}) as Record<string, unknown>;
      const address = (location.address ?? {}) as Record<string, unknown>;
      return {
        date: Date.parse(String(event.startDate ?? "")),
        venue: String(location.name ?? ""),
        city: String(address.addressLocality ?? ""),
      };
    })
    .filter((event: { date: number }) =>
      Number.isFinite(event.date) && event.date > now
    )
    .sort((left: { date: number }, right: { date: number }) =>
      left.date - right.date
    );

  return (
    upcoming.find((event: { city: string }) =>
      /San Francisco|Oakland|Berkeley|San Jose/i.test(event.city)
    ) ??
    upcoming[0] ??
    null
  );
}
