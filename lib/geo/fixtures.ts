// Known-good coordinates for tests and the live demo.
//
// STAGE_CENTROIDS are the coordinate-spoof targets: dropping a device at one of
// these lands it unambiguously inside that stage's polygon. Path 1's dev
// coordinate-spoof affordance and path 6's live mint both spoof to these — the
// whole live demo depends on them being reliable, so they are derived from the
// computed centroids rather than hand-typed.
//
// OFF_STAGE_POINTS are the null case made explicit: paths, gates, and Wine
// Lands. Each resolves to null, proving we never snap to the nearest stage.
import type { LatLng } from '../types';
import { loadStages } from './polygons';

const centroidTargets = (): Record<string, LatLng> => {
  const out: Record<string, LatLng> = {};
  for (const s of loadStages()) {
    out[s.id] = { lat: s.centroid[0], lng: s.centroid[1] };
  }
  return out;
};

/** Demo spoof targets: one known-inside coordinate per stage, keyed by stage id. */
export const STAGE_CENTROIDS: Record<string, LatLng> = centroidTargets();

/** Known-outside points — Wine Lands, inter-meadow paths, a gate. All resolve null. */
export const OFF_STAGE_POINTS: LatLng[] = [
  { lat: 37.76645, lng: -122.4933 }, // Wine Lands (south of the meadows)
  { lat: 37.7681, lng: -122.4932 }, // path between Lands End and SOMA
  { lat: 37.7696, lng: -122.489 }, // Grass Lands, between SOMA and Sutro
  { lat: 37.77, lng: -122.4854 }, // Dolores, between Sutro and Duboce Triangle
  { lat: 37.7725, lng: -122.49 }, // north gate, along Fulton
];
