// ⚠️ PATH-4 PLACEHOLDER — NOT OWNED BY PATH 1.
//
// The canonical `lib/types.ts` is owned by path 4 (see docs/CONTRACTS.md §1).
// It does not exist in the repo yet, but every path 1 module imports its
// shared types from here rather than redeclaring them. To stay unblocked
// (per the "stub anything you consume" rule) this file mirrors CONTRACTS.md
// §1–2 verbatim. When path 4 lands the real file, this stub is overwritten
// wholesale — do not extend it with path-1-specific types.

export type LatLng = { lat: number; lng: number };
export type PolyPoint = [lat: number, lng: number];

export type StageId = string;
export type SetId = string;

export interface Stage {
  id: StageId;
  name: string; // "Lands End" | "Twin Peaks" | "Sutro" | "SOMA" | "Duboce Triangle"
  polygon: PolyPoint[]; // closed implicitly; first point need not repeat
  bufferMeters: number; // 20–45; Duboce Triangle is 45 (eucalyptus GPS drift)
  centroid: PolyPoint; // used for the overlap tie-break
}

export interface SetRecord {
  id: SetId;
  stageId: StageId;
  artistName: string;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  slotIndex: number; // 0 = opener of the day on that stage
  isHeadliner: boolean;
  estimatedAudience: number | null;
  isFestivalDebut: boolean;
  isFinalShow: boolean;
  genreTags: string[];
  jambaseArtistId: string | null;
  spotifyId: string | null;
  nextTourDate: { date: number; venue: string; city: string } | null;
}

export interface Grid {
  festivalId: string;
  eventName: string; // "Outside Lands 2026"
  timezone: string; // "America/Los_Angeles"
  fetchedAt: number;
  stages: Stage[];
  sets: SetRecord[];
}

// §2 — Capture types (path 1 publishes)

export interface CapturedPhoto {
  clientId: string; // uuid v4
  ts: number;
  lat: number;
  lng: number;
  accuracy: number | null; // metres, from the geolocation fix
  blob: Blob; // stored in IndexedDB; uploaded as a file on sync
  synced: boolean;
}

export interface DwellSample {
  clientId: string;
  ts: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  synced: boolean;
}
