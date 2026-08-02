// Run with: npx tsx --test lib/geo/__tests__/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LatLng, PolyPoint } from '../../types';
import {
  distanceMeters,
  inPolygon,
  pointToSegmentMeters,
  distanceToPolygonMeters,
  withinBuffer,
} from '../inPolygon';

// A convex square (lat 37.770..37.771, lng -122.490..-122.489), wound one way.
const SQUARE: PolyPoint[] = [
  [37.7710, -122.4900],
  [37.7710, -122.4890],
  [37.7700, -122.4890],
  [37.7700, -122.4900],
];

test('distanceMeters: 0.001 deg latitude is ~111.2 m', () => {
  const d = distanceMeters({ lat: 37.77, lng: -122.49 }, { lat: 37.771, lng: -122.49 });
  assert.ok(Math.abs(d - 111.19) < 1, `expected ~111.2, got ${d}`);
});

test('distanceMeters: 0.001 deg longitude at 37.77 is ~88 m', () => {
  const d = distanceMeters({ lat: 37.77, lng: -122.49 }, { lat: 37.77, lng: -122.489 });
  assert.ok(Math.abs(d - 88.0) < 1, `expected ~88, got ${d}`);
});

test('distanceMeters: identical points are 0', () => {
  const p: LatLng = { lat: 37.77, lng: -122.49 };
  assert.equal(distanceMeters(p, p), 0);
});

test('inPolygon: a point in the middle is inside', () => {
  assert.equal(inPolygon({ lat: 37.7705, lng: -122.4895 }, SQUARE), true);
});

test('inPolygon: a point outside is outside', () => {
  assert.equal(inPolygon({ lat: 37.7705, lng: -122.4800 }, SQUARE), false);
});

test('pointToSegmentMeters: perpendicular distance to a lng-aligned edge', () => {
  // segment along lat 37.770; point 0.001 deg lat north of it -> ~111.2 m
  const d = pointToSegmentMeters(
    { lat: 37.771, lng: -122.4895 },
    [37.770, -122.4900],
    [37.770, -122.4890],
  );
  assert.ok(Math.abs(d - 111.19) < 1.5, `expected ~111.2, got ${d}`);
});

test('pointToSegmentMeters: clamps to the nearer endpoint past the segment', () => {
  // Point sits on the segment's latitude line but ~88 m east of its east end.
  // A correct clamp measures to that endpoint (~88 m), NOT the perpendicular (0 m).
  const end: PolyPoint = [37.770, -122.4890];
  const p: LatLng = { lat: 37.770, lng: -122.4880 };
  const d = pointToSegmentMeters(p, [37.770, -122.4900], end);
  const dEnd = distanceMeters(p, { lat: end[0], lng: end[1] });
  assert.ok(Math.abs(d - dEnd) < 0.5, `expected clamp near endpoint ${dEnd}, got ${d}`);
});

test('distanceToPolygonMeters: nearest edge wins', () => {
  // ~88 m east of the polygon's east edge (lng -122.4890)
  const d = distanceToPolygonMeters({ lat: 37.7705, lng: -122.4880 }, SQUARE);
  assert.ok(Math.abs(d - 88.0) < 2, `expected ~88, got ${d}`);
});

test('withinBuffer: point inside polygon is within any buffer', () => {
  assert.equal(withinBuffer({ lat: 37.7705, lng: -122.4895 }, SQUARE, 0), true);
});

test('withinBuffer: point ~88 m out is inside a 100 m buffer but not a 50 m buffer', () => {
  const p: LatLng = { lat: 37.7705, lng: -122.4880 };
  assert.equal(withinBuffer(p, SQUARE, 100), true);
  assert.equal(withinBuffer(p, SQUARE, 50), false);
});
