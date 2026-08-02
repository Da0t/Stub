// lib/grid/normalize.ts
//
// Path 3 — JamBase payload → the shared `Grid` contract.
//
// This is the boundary where the messy outside world becomes the clean, typed,
// timezone-normalised grid every other path reads. Nothing downstream should
// ever have to think about JamBase field names or Pacific time again.
//
// Rules honoured here (README §Normalisation):
//   - All times → epoch ms, UTC. Timezone conversion happens ONLY here.
//   - slotIndex is computed (it does not exist in the payload): per stage, per
//     festival-local day, ordered by startTime; index 0 is the opener.
//   - isHeadliner rule (documented, deterministic): the last set of the day on
//     Lands End or Twin Peaks. estimatedAudience is carried for path 6's rarity
//     but is NOT used to decide the headliner flag, to keep the rule single and
//     explainable in one breath.
//   - Missing fields become null, never 0 and never "".
//   - Event status: cancelled sets are dropped (a cancelled show must resolve to
//     null, not silently mismatch); rescheduled sets keep their new window.
//
// Determinism: pure transform. Same (raw, stages, meta) → same Grid, except
// `fetchedAt`, which legitimately records normalisation wall-clock and drives
// staleness in cache.ts.

import type {
  ArtistMeta,
  RawJamBaseEvent,
} from "@/lib/grid/jambase";
import type { Grid, SetRecord, Stage, StageId } from "@/lib/types";
import { loadStages } from "@/lib/geo/polygons";

const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DEFAULT_EVENT_NAME = "Outside Lands 2026";
const HEADLINER_STAGE_IDS = new Set<StageId>(["lands-end", "twin-peaks"]);

// Deliberately explicit: schedule publishers use a handful of known labels,
// and silently guessing a stage would corrupt every downstream presence fact.
const STAGE_ALIASES: Readonly<Record<string, StageId>> = {
  "lands end": "lands-end",
  "lands end stage": "lands-end",
  "twin peaks": "twin-peaks",
  "twin peaks stage": "twin-peaks",
  sutro: "sutro",
  "sutro stage": "sutro",
  soma: "soma",
  "soma tent": "soma",
  "soma stage": "soma",
  "duboce triangle": "duboce-triangle",
  "duboce triangle stage": "duboce-triangle",
};

/**
 * Explicit stage-name alias map. Five stages does not need fuzzy matching
 * (README gotcha) — a feed saying "Twin Peaks Stage" must map to the "Twin
 * Peaks" polygon. Keys are normalised (lowercased, trimmed, "stage" suffix and
 * punctuation stripped) so small feed variations collapse to one canonical name.
 */
function normaliseStageKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildStageIndex(stages: Stage[]): Map<string, Stage> {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const index = new Map<string, Stage>();
  for (const [alias, id] of Object.entries(STAGE_ALIASES)) {
    const stage = byId.get(id);
    if (stage) index.set(normaliseStageKey(alias), stage);
  }
  return index;
}

function parsePerformanceTime(value: string): number | null {
  // JamBase's performer feed is day-only. A date is not a set window and must
  // never be interpreted as midnight UTC. Scheduled data must include either
  // an explicit UTC marker or numeric offset.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Festival-local calendar day (YYYY-MM-DD) for an epoch ms, for slotIndex. */
function localDay(tsMs: number, timezone: string): string {
  // Intl is available in the browser, Node, and the Convex runtime.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsMs));
}

/**
 * Normalise a raw JamBase payload into the shared `Grid`.
 *
 * @param raw    flat performance slots from fetchGrid()
 * @param stages path 2's stages (id, polygon, buffer, centroid). Sets whose
 *               stage name matches none of these are dropped and counted.
 * @param meta   per-artist enrichment keyed by jambaseArtistId.
 */
export function toGrid(
  raw: RawJamBaseEvent[],
  _stages: Stage[],
  meta: Record<string, ArtistMeta>
): Grid {
  // data/stages.json is the sole geometry authority. The stages argument is
  // retained for API compatibility with the bootstrap pipeline, but no caller
  // (including a stale raw fixture) may inject polygons into the cached grid.
  const stages = loadStages();
  const stageIndex = buildStageIndex(stages);
  const festival = raw.find((e) => e.festival)?.festival;
  const timezone = festival?.timezone ?? DEFAULT_TIMEZONE;

  const dropped: string[] = [];

  // 1. Map raw → partial SetRecord, dropping cancelled and unmatched-stage sets.
  const partial = raw.flatMap((e) => {
    if (e.status === "cancelled") {
      dropped.push(`${e.artistName} (cancelled)`);
      return [];
    }
    const stage = stageIndex.get(normaliseStageKey(e.stageName));
    if (!stage) {
      dropped.push(`${e.artistName} @ "${e.stageName}" (no polygon)`);
      return [];
    }
    const startTime = parsePerformanceTime(e.startDate);
    const endTime = parsePerformanceTime(e.endDate);
    if (startTime === null || endTime === null) {
      dropped.push(`${e.artistName} (unparseable time)`);
      return [];
    }
    if (endTime <= startTime) {
      dropped.push(`${e.artistName} (inverted/zero-length window)`);
      return [];
    }

    const m = e.jambaseArtistId ? meta[e.jambaseArtistId] : undefined;
    return [
      {
        id: e.id,
        stageId: stage.id,
        artistName: e.artistName,
        startTime,
        endTime,
        // slotIndex + isHeadliner filled in pass 2 (need per-stage-day order).
        slotIndex: -1,
        isHeadliner: false,
        estimatedAudience: e.estimatedAudience ?? m?.estimatedAudience ?? null,
        isFestivalDebut: m?.isFestivalDebut ?? false,
        isFinalShow: m?.isFinalShow ?? false,
        genreTags: m?.genreTags?.length ? m.genreTags : (e.genreTags ?? []),
        jambaseArtistId: e.jambaseArtistId,
        spotifyId: m?.spotifyId ?? null,
        nextTourDate: m?.nextTourDate ?? null,
        _sourceHeadliner: (e as RawJamBaseEvent & { isHeadliner?: boolean }).isHeadliner,
        _provenance: e._provenance ?? "unknown",
        _status: e.status,
      },
    ];
  });

  // 2. slotIndex + isHeadliner per (stageId, local day), ordered by startTime.
  const byStageDay = new Map<string, typeof partial>();
  for (const s of partial) {
    const key = `${s.stageId}|${localDay(s.startTime, timezone)}`;
    const bucket = byStageDay.get(key) ?? [];
    bucket.push(s);
    byStageDay.set(key, bucket);
  }
  for (const bucket of byStageDay.values()) {
    bucket.sort((a, b) => a.startTime - b.startTime);
    bucket.forEach((s, i) => {
      s.slotIndex = i;
      const isLastOfDay = i === bucket.length - 1;
      s.isHeadliner = s._sourceHeadliner ?? (isLastOfDay && HEADLINER_STAGE_IDS.has(s.stageId));
    });
  }

  // 3. Strip the transient field, sort all sets by startTime, freeze the Grid.
  const sets: SetRecord[] = partial
    .map(({ _sourceHeadliner, ...rest }) => {
      void _sourceHeadliner;
      return rest;
    })
    .sort((a, b) => a.startTime - b.startTime || a.stageId.localeCompare(b.stageId) || a.id.localeCompare(b.id));

  if (dropped.length > 0) {
    // No silent truncation — say what did not make it into the grid.
    console.warn(
      `toGrid: dropped ${dropped.length} set(s): ${dropped.join("; ")}`
    );
  }

  return {
    festivalId: festival?.id ?? "outside-lands-2026",
    eventName: festival?.name ?? DEFAULT_EVENT_NAME,
    timezone,
    fetchedAt: Date.now(),
    stages,
    sets,
  };
}

/** Stage ids present in the grid, for path 2 to sanity-check against polygons. */
export function stageIdsInGrid(grid: Grid): StageId[] {
  return Array.from(new Set(grid.sets.map((s) => s.stageId)));
}
