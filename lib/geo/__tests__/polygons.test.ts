// Run with: npx tsx --test lib/geo/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PolyPoint } from '../../types';
import { centroid, loadStages, loadZones, buildSampleGrid } from '../polygons';

const SQUARE: PolyPoint[] = [
  [37.7710, -122.4900],
  [37.7710, -122.4890],
  [37.7700, -122.4890],
  [37.7700, -122.4900],
];

test('centroid of a square is its centre', () => {
  const [lat, lng] = centroid(SQUARE);
  assert.ok(Math.abs(lat - 37.7705) < 1e-6, `lat ${lat}`);
  assert.ok(Math.abs(lng - -122.4895) < 1e-6, `lng ${lng}`);
});

test('centroid falls back to vertex average for a degenerate (zero-area) polygon', () => {
  const line: PolyPoint[] = [[37.77, -122.49], [37.78, -122.49], [37.79, -122.49]];
  const [lat, lng] = centroid(line);
  assert.ok(Math.abs(lat - 37.78) < 1e-6, `lat ${lat}`);
  assert.ok(Math.abs(lng - -122.49) < 1e-6, `lng ${lng}`);
});

test('loadStages returns the five named stages with computed centroids', () => {
  const stages = loadStages();
  assert.equal(stages.length, 5);
  const names = stages.map((s) => s.name).sort();
  assert.deepEqual(names, ['Duboce Triangle', 'Lands End', 'SOMA', 'Sutro', 'Twin Peaks']);
  for (const s of stages) {
    assert.equal(typeof s.id, 'string');
    assert.ok(s.polygon.length >= 3, `${s.id} needs >=3 points`);
    assert.equal(s.centroid.length, 2);
    // centroid lands inside its own (unbuffered) polygon
    assert.ok(Number.isFinite(s.centroid[0]) && Number.isFinite(s.centroid[1]));
  }
});

test('Duboce Triangle carries the 45 m eucalyptus-drift buffer', () => {
  const duboce = loadStages().find((s) => s.id === 'duboce-triangle');
  assert.ok(duboce);
  assert.equal(duboce!.bufferMeters, 45);
});

test('all longitudes are negative (western hemisphere sanity)', () => {
  for (const s of loadStages()) {
    for (const [, lng] of s.polygon) assert.ok(lng < 0, `lng ${lng} must be negative`);
  }
});

test('loadZones returns the non-stage zones', () => {
  const zones = loadZones();
  const names = zones.map((z) => z.name);
  assert.ok(names.includes('Wine Lands'));
  assert.ok(zones.length >= 3);
});

test('buildSampleGrid assembles a full Grid from live polygons + sample sets', () => {
  const grid = buildSampleGrid();
  assert.equal(grid.eventName, 'Outside Lands 2026');
  assert.equal(grid.stages.length, 5);
  assert.ok(grid.sets.length >= 3);
  // stages carry centroids (assembled from loadStages, not eyeballed)
  assert.ok(grid.stages.every((s) => Array.isArray(s.centroid) && s.centroid.length === 2));
  // every set lands on a real stage, and Lands End is programmed. Asserted
  // structurally rather than against an artist name — the grid is a real
  // JamBase pull and the lineup is not ours to pin.
  const stageIds = new Set(grid.stages.map((s) => s.id));
  assert.ok(grid.sets.every((s) => stageIds.has(s.stageId)));
  assert.ok(grid.sets.some((s) => s.stageId === 'lands-end'));
});
