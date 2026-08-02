// The published resolution API. Pure and deterministic: a coordinate and a
// timestamp go in, a stage and a set come out. No I/O, no async, no randomness,
// no time-of-day dependence beyond the passed `ts`. Runs unchanged client-side
// (offline) and inside a Convex action.
//
// This is the load-bearing wall under the core invariant: deterministic code
// decides what happened. There is no model anywhere in this path. Null is a
// valid, first-class answer — a point in transit, at Wine Lands, or at a food
// vendor resolves to null. We never snap a null to the nearest stage; that
// would manufacture presence.
import type { Grid, LatLng, SetId, Stage, StageId } from '../types';
import { distanceMeters, withinBuffer } from './inPolygon';

// Re-export the primitives the contract lists under lib/geo/resolve.ts so
// callers import them all from one published surface.
export { inPolygon, distanceMeters } from './inPolygon';

const DEFAULT_GRACE_MS = 15 * 60_000;

/**
 * Ray-cast point-in-polygon, buffer-aware. Returns null when at no stage.
 * If a point falls inside two buffered polygons, it resolves to the nearer
 * centroid — deterministic, tie-broken by stage id so the answer never depends
 * on stage ordering.
 */
export function resolveStage(pt: LatLng, stages: Stage[]): StageId | null {
  const hits = stages.filter((s) => withinBuffer(pt, s.polygon, s.bufferMeters));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].id;

  let best = hits[0];
  let bestDist = distanceMeters(pt, { lat: best.centroid[0], lng: best.centroid[1] });
  for (let i = 1; i < hits.length; i++) {
    const s = hits[i];
    const d = distanceMeters(pt, { lat: s.centroid[0], lng: s.centroid[1] });
    if (d < bestDist || (d === bestDist && s.id < best.id)) {
      best = s;
      bestDist = d;
    }
  }
  return best.id;
}

/**
 * The set running on `stageId` at `ts`, honouring the ±grace window (mint
 * eligibility). If two sets match inside the grace overlap, prefer the one
 * whose unpadded window contains `ts`; if neither does, prefer the nearer
 * midpoint. Returns null between sets and after the last set.
 */
export function lookupSet(
  stageId: StageId,
  ts: number,
  grid: Grid,
  graceMs: number = DEFAULT_GRACE_MS,
): SetId | null {
  const candidates = grid.sets.filter(
    (s) =>
      s.stageId === stageId &&
      s.startTime - graceMs <= ts &&
      ts <= s.endTime + graceMs,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const unpadded = candidates.filter((s) => s.startTime <= ts && ts <= s.endTime);
  const pool = unpadded.length > 0 ? unpadded : candidates;

  let best = pool[0];
  let bestScore = Math.abs(ts - (best.startTime + best.endTime) / 2);
  for (let i = 1; i < pool.length; i++) {
    const s = pool[i];
    const score = Math.abs(ts - (s.startTime + s.endTime) / 2);
    // nearer midpoint wins; ties broken by earlier start, then id — deterministic
    if (
      score < bestScore ||
      (score === bestScore && s.startTime < best.startTime) ||
      (score === bestScore && s.startTime === best.startTime && s.id < best.id)
    ) {
      best = s;
      bestScore = score;
    }
  }
  return best.id;
}

/** Convenience: a coordinate + a time straight to a stage and a set. */
export function resolve(
  pt: LatLng,
  ts: number,
  grid: Grid,
): { stageId: StageId | null; setId: SetId | null } {
  const stageId = resolveStage(pt, grid.stages);
  const setId = stageId === null ? null : lookupSet(stageId, ts, grid);
  return { stageId, setId };
}
