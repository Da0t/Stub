/**
 * Canonical shared types. Mirrors docs/CONTRACTS.md exactly.
 * Owned by path 4. If this file and CONTRACTS.md drift, this file wins —
 * update the doc, not the other way around.
 *
 * Frozen at T+30. Adding an optional field is fine. Renaming or removing one
 * is not — five other branches are typed against this.
 */

// ---------------------------------------------------------------------------
// Conventions (CONTRACTS.md preamble)
// ---------------------------------------------------------------------------
// - Timestamps are `number`, epoch milliseconds, UTC. Never strings, never
//   `Date` objects across a boundary.
// - Coordinates are `[lat, lng]` tuples (inside polygons only) or
//   `{lat, lng}` objects. Latitude first, always.
// - `clientId` is a UUID v4 minted on-device at write time. Every ingest is
//   idempotent on it, so a retry never double-writes.
// - `_id` is Convex-generated. Client code never invents one.
// - `null` is a valid answer for stage/set resolution — "not at a stage".
//   Never coerce it to a default.

// ---------------------------------------------------------------------------
// 1. Core types (path 4 publishes; path 3 fills, path 2 keys)
// ---------------------------------------------------------------------------

export type LatLng = { lat: number; lng: number };
export type PolyPoint = [lat: number, lng: number];

export type StageId = string;
export type SetId = string;

export interface Stage {
  id: StageId;
  name: string; // "Lands End" | "Twin Peaks" | "Sutro" | "SOMA" | "Duboce Triangle"
  polygon: PolyPoint[]; // closed implicitly; first point need not repeat
  bufferMeters: number; // 20-45; Duboce Triangle is 45 (eucalyptus GPS drift)
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

// ---------------------------------------------------------------------------
// 2. Capture types (path 1 publishes)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 3. Geometry and resolution — no new types here.
// ---------------------------------------------------------------------------
// path 2 publishes resolveStage / inPolygon / distanceMeters / lookupSet /
// resolve from lib/geo/resolve.ts, typed against LatLng / Stage / Grid /
// StageId / SetId above. Import the real functions from that file — this
// module only holds the data shapes they move.

// ---------------------------------------------------------------------------
// 4. Dwell (path 5 publishes buildDwellRuns / deriveSignals from
//    lib/dwell/runs.ts and lib/dwell/signals.ts; path 4 calls them
//    server-side to materialise dwellRuns)
// ---------------------------------------------------------------------------

export interface DwellRun {
  stageId: StageId;
  setId: SetId | null;
  startTs: number;
  endTs: number;
  dwellSeconds: number;
  completionRate: number; // dwellSeconds / set duration, clamped to [0,1]
  sampleCount: number;
}

export declare function buildDwellRuns(
  samples: DwellSample[],
  grid: Grid,
  opts?: { maxGapMs?: number; minSamples?: number }, // defaults 5*60_000, 2
): DwellRun[];

export interface DerivedSignals {
  totalDwellSeconds: number;
  setsAttended: number; // runs >= 10 min
  concurrentSetsSkipped: number; // the opportunity-cost number
  perSetSkipped: Record<SetId, number>;
  completionRateAvg: number;
  fullSetCount: number; // completionRate >= 0.8
  stageDiversity: number; // distinct stages visited
  nightRatio: number; // share of dwell after 7PM local
  discoveryRate: number; // share of sets with no prior card
  longestRun: DwellRun | null;
  topArtistBySetTime: { setId: SetId; artistName: string; dwellSeconds: number } | null;
}

// ---------------------------------------------------------------------------
// 5. Mint (path 6 publishes checkEligibility / rarityScore / pickFrameVariant
//    from lib/mint/eligibility.ts, lib/mint/rarity.ts, lib/mint/variants.ts;
//    path 4 calls them inside mintableNow and mint.claim)
// ---------------------------------------------------------------------------

export type CardState = "LOCKED" | "AVAILABLE" | "SPINNING" | "MINTED";

export type FrameVariant =
  | "ranger_badge"
  | "trail_marker"
  | "fog_layer"
  | "disco_bison"
  | "field_notes";

export interface Mintable {
  setId: SetId;
  stageId: StageId;
  artistName: string;
  photoClientId: string; // the photo that will become the card face
  dwellSeconds: number;
  rarityScore: number; // 0..1
  state: CardState;
}

// ---------------------------------------------------------------------------
// 6. Card render (path 7 publishes renderCard / renderStrip from
//    lib/render/*, typed against CardRenderInput below)
// ---------------------------------------------------------------------------

export interface CardRenderInput {
  photoUrl: string; // object URL, data URL, or remote URL
  frameVariant: FrameVariant;
  artistName: string;
  stageName: string;
  dateLabel: string; // "Fri Aug 7"
  setWindowLabel: string; // "7:40 - 8:55 PM"
  dwellLabel: string; // "47 min"
  rarityScore: number; // 0..1; rarity mark drawn only above 0.7
  themePack: string; // "outside-lands-2026"
}

// ---------------------------------------------------------------------------
// 7. AI (path 8 publishes classifyBurst / writeWrapped / writeTaskCopy from
//    lib/ai/vision.ts, lib/ai/narrative.ts, lib/ai/taskCopy.ts; sits beside
//    the fact path, never inside it — the model describes, never locates)
// ---------------------------------------------------------------------------

export interface VisionResult {
  bestFrameId: string;
  photos: Array<{
    id: string;
    subject: "stage" | "people" | "food" | "scenery";
    quality: number; // 0..1
    blurred: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// 8. Convex API surface — wire types (path 4 publishes, additional to CONTRACTS.md)
// ---------------------------------------------------------------------------
// These are not in docs/CONTRACTS.md §8 verbatim because that section lists
// function signatures, not every payload shape. They are part of path 4's
// own published surface and belong in the canonical file.

export interface PhotoUpload {
  clientId: string;
  timestamp: number;
  lat: number;
  lng: number;
  storageId: string; // Convex file storage id; upload via generateUploadUrl first
}

export interface SampleUpload {
  clientId: string;
  timestamp: number;
  lat: number;
  lng: number;
  accuracy: number | null;
}

/** Wire shape for api.queries.shelf — a minted (or pending) card, joined to set/artist. */
export interface Card {
  id: string;
  setId: SetId;
  stageId: StageId;
  artistName: string;
  stageName: string;
  photoUrl: string | null;
  frameVariant: FrameVariant;
  dwellSeconds: number;
  rarityScore: number;
  state: CardState;
  mintedAt: number | null;
}

/** Wire shape for api.queries.taskProgress. */
export interface TaskProgress {
  taskId: string;
  artistName: string;
  description: string;
  rewardType: string;
  rewardPayload: unknown;
  activeFrom: number;
  activeUntil: number;
  completed: boolean;
  completedAt: number | null;
  proofCardId: string | null;
}

/** Wire shape for api.queries.wrapped. */
export interface Wrapped {
  id: string;
  eventId: string;
  computedAt: number;
  stats: DerivedSignals;
  narrative: string[];
  stripUrl: string | null;
}
