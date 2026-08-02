// Run with: npx tsx --test lib/geo/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Grid, LatLng, Stage } from '../../types';
import { loadStages, buildSampleGrid, centroid } from '../polygons';
import {
  resolveStage,
  lookupSet,
  resolve,
  inPolygon,
  distanceMeters,
} from '../resolve';

const STAGES = loadStages();
const GRID = buildSampleGrid();
const landsEnd = STAGES.find((s) => s.id === 'lands-end')!;
const landsEndCentroid: LatLng = { lat: landsEnd.centroid[0], lng: landsEnd.centroid[1] };

// Anchor set on Lands End, derived from the cached grid rather than hardcoded
// to an artist name — the grid is a real JamBase pull and the lineup changes.
// We want a set with a wide gap before it so the ±15 min grace-window tests are
// unambiguous: 10-min-before must not land inside the preceding set's window.
const LANDS_END_SETS = GRID.sets
  .filter((s) => s.stageId === 'lands-end')
  .sort((a, b) => a.startTime - b.startTime);

const ANCHOR_IDX = LANDS_END_SETS.findIndex(
  (s, i) => i > 0 && s.startTime - LANDS_END_SETS[i - 1].endTime >= 40 * 60_000,
);
if (ANCHOR_IDX < 1) {
  throw new Error('grid has no Lands End set with a >=40 min gap before it');
}
const ANCHOR = LANDS_END_SETS[ANCHOR_IDX];
const BEFORE_ANCHOR = LANDS_END_SETS[ANCHOR_IDX - 1];
const LAST_SET = LANDS_END_SETS[LANDS_END_SETS.length - 1];
const midAnchor = (ANCHOR.startTime + ANCHOR.endTime) / 2;

// ---- resolveStage ---------------------------------------------------------

test('resolveStage: a stage centroid resolves to that stage', () => {
  for (const s of STAGES) {
    const c: LatLng = { lat: s.centroid[0], lng: s.centroid[1] };
    assert.equal(resolveStage(c, STAGES), s.id);
  }
});

test('resolveStage: an off-stage point resolves to null (never snapped)', () => {
  const wineLands: LatLng = { lat: 37.76645, lng: -122.4933 };
  assert.equal(resolveStage(wineLands, STAGES), null);
});

test('resolveStage: 5 m outside Duboce Triangle resolves in (45 m buffer)', () => {
  const p: LatLng = { lat: 37.7691, lng: -122.482277 }; // ~5 m east of the edge
  assert.equal(resolveStage(p, STAGES), 'duboce-triangle');
});

test('resolveStage: 100 m outside Duboce Triangle resolves null', () => {
  const p: LatLng = { lat: 37.7691, lng: -122.481198 }; // ~100 m east of the edge
  assert.equal(resolveStage(p, STAGES), null);
});

test('resolveStage: overlapping polygons resolve to the nearer centroid, deterministically', () => {
  const aPoly: [number, number][] = [
    [37.7695, -122.4905],
    [37.7705, -122.4905],
    [37.7705, -122.4895],
    [37.7695, -122.4895],
  ];
  const bPoly: [number, number][] = [
    [37.7700, -122.4900],
    [37.7710, -122.4900],
    [37.7710, -122.4890],
    [37.7700, -122.4890],
  ];
  const a: Stage = { id: 'A', name: 'A', polygon: aPoly, bufferMeters: 0, centroid: centroid(aPoly) };
  const b: Stage = { id: 'B', name: 'B', polygon: bPoly, bufferMeters: 0, centroid: centroid(bPoly) };
  // point inside both, nearer B's centroid
  const nearB: LatLng = { lat: 37.7703, lng: -122.4893 };
  assert.equal(resolveStage(nearB, [a, b]), 'B');
  // point inside both, nearer A's centroid
  const nearA: LatLng = { lat: 37.7701, lng: -122.4899 };
  assert.equal(resolveStage(nearA, [a, b]), 'A');
  // deterministic: same input, same answer, order-independent
  assert.equal(resolveStage(nearB, [b, a]), 'B');
});

// ---- lookupSet ------------------------------------------------------------

test('lookupSet: mid-set returns the running set', () => {
  assert.equal(lookupSet('lands-end', midAnchor, GRID), ANCHOR.id);
});

test('lookupSet: between sets returns null', () => {
  const between = (BEFORE_ANCHOR.endTime + ANCHOR.startTime) / 2; // mid-gap, outside both grace windows
  assert.equal(lookupSet('lands-end', between, GRID), null);
});

test('lookupSet: 10 min before start counts (grace window)', () => {
  const tenBefore = ANCHOR.startTime - 10 * 60_000;
  assert.equal(lookupSet('lands-end', tenBefore, GRID), ANCHOR.id);
});

test('lookupSet: 20 min before start does not count', () => {
  const twentyBefore = ANCHOR.startTime - 20 * 60_000;
  assert.equal(lookupSet('lands-end', twentyBefore, GRID), null);
});

test('lookupSet: after the last set returns null', () => {
  const afterAll = LAST_SET.endTime + 60 * 60_000;
  assert.equal(lookupSet('lands-end', afterAll, GRID), null);
});

test('lookupSet: adjacent sets in the grace overlap resolve to the unpadded owner', () => {
  const g: Grid = {
    festivalId: 'x',
    eventName: 'x',
    timezone: 'UTC',
    fetchedAt: 0,
    stages: [],
    sets: [
      { id: 's1', stageId: 'x', artistName: 'One', startTime: 1000, endTime: 2000, slotIndex: 0, isHeadliner: false, estimatedAudience: null, isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null },
      { id: 's2', stageId: 'x', artistName: 'Two', startTime: 2000, endTime: 3000, slotIndex: 1, isHeadliner: false, estimatedAudience: null, isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null },
    ],
  };
  assert.equal(lookupSet('x', 1950, g), 's1'); // inside s1's unpadded window
  assert.equal(lookupSet('x', 2050, g), 's2'); // inside s2's unpadded window
  assert.equal(lookupSet('x', 999999, g), null); // far after both
});

test('lookupSet: unknown stage returns null', () => {
  assert.equal(lookupSet('no-such-stage', midAnchor, GRID), null);
});

// ---- resolve (combined) ---------------------------------------------------

test('resolve: Lands End centroid mid-set returns that set (offline)', () => {
  const r = resolve(landsEndCentroid, midAnchor, GRID);
  assert.deepEqual(r, { stageId: 'lands-end', setId: ANCHOR.id });
});

test('resolve: an off-stage point is {null, null} at any time', () => {
  const wineLands: LatLng = { lat: 37.76645, lng: -122.4933 };
  assert.deepEqual(resolve(wineLands, midAnchor, GRID), { stageId: null, setId: null });
  assert.deepEqual(resolve(wineLands, 0, GRID), { stageId: null, setId: null });
});

test('resolve: at a stage but between sets gives a stage with a null set', () => {
  const midGap = (BEFORE_ANCHOR.endTime + ANCHOR.startTime) / 2;
  const r = resolve(landsEndCentroid, midGap, GRID);
  assert.deepEqual(r, { stageId: 'lands-end', setId: null });
});

test('resolve: is deterministic — two runs on the same input agree', () => {
  const r1 = resolve(landsEndCentroid, midAnchor, GRID);
  const r2 = resolve(landsEndCentroid, midAnchor, GRID);
  assert.deepEqual(r1, r2);
});

// ---- re-exports (published from resolve.ts per the contract) ---------------

test('resolve.ts re-publishes inPolygon and distanceMeters', () => {
  assert.equal(typeof inPolygon, 'function');
  assert.equal(typeof distanceMeters, 'function');
  assert.equal(inPolygon(landsEndCentroid, landsEnd.polygon), true);
  assert.ok(distanceMeters(landsEndCentroid, landsEndCentroid) === 0);
});
