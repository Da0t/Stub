// Loader + typed access for the hand-drawn stage geometry. Centroids are
// computed here (never eyeballed) so the overlap tie-break is deterministic.
// JSON is imported statically (bundled), so this stays pure and offline-safe —
// no fetch, no runtime file I/O.
import type { Grid, PolyPoint, Stage, SetRecord } from '../types';
import stagesData from '../../data/stages.json';
import gridData from '../../data/grid.sample.json';

interface RawStage {
  id: string;
  name: string;
  bufferMeters: number;
  polygon: number[][];
}
interface RawZone {
  name: string;
  polygon: number[][];
}

const toPoly = (poly: number[][]): PolyPoint[] =>
  poly.map(([lat, lng]) => [lat, lng] as PolyPoint);

/**
 * Area-weighted polygon centroid (lat as x, lng as y). Falls back to the
 * vertex average when the polygon is degenerate (collinear / zero area).
 */
export function centroid(poly: PolyPoint[]): PolyPoint {
  // Shift to a local origin (the first vertex) before the area-weighted sum.
  // Coordinates near [37.77, -122.49] with metre-scale offsets otherwise lose
  // ~1 m to floating-point cancellation in the cross-products.
  const [ox, oy] = poly[0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0] - ox;
    const yi = poly[i][1] - oy;
    const xj = poly[j][0] - ox;
    const yj = poly[j][1] - oy;
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    const n = poly.length;
    const sx = poly.reduce((s, p) => s + p[0], 0) / n;
    const sy = poly.reduce((s, p) => s + p[1], 0) / n;
    return [sx, sy];
  }
  return [cx / (6 * area) + ox, cy / (6 * area) + oy];
}

/** The five stage polygons, each with a programmatically-computed centroid. */
export function loadStages(): Stage[] {
  return (stagesData.stages as RawStage[]).map((s) => {
    const polygon = toPoly(s.polygon);
    return {
      id: s.id,
      name: s.name,
      polygon,
      bufferMeters: s.bufferMeters,
      centroid: centroid(polygon),
    };
  });
}

/** Non-stage zones (Wine Lands, Beer Lands, …) — for the debug map only. */
export function loadZones(): { name: string; polygon: PolyPoint[] }[] {
  return (stagesData.zones as RawZone[]).map((z) => ({
    name: z.name,
    polygon: toPoly(z.polygon),
  }));
}

/**
 * A complete Grid stub for tests, the debug page, and any path blocked on
 * path 3. Stages come from the live loader (single source of truth for
 * geometry); the festival metadata and sets come from data/grid.sample.json.
 */
export function buildSampleGrid(): Grid {
  return {
    festivalId: gridData.festivalId,
    eventName: gridData.eventName,
    timezone: gridData.timezone,
    fetchedAt: gridData.fetchedAt,
    stages: loadStages(),
    sets: gridData.sets as SetRecord[],
  };
}
