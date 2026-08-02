// Pure geometry primitives. No I/O, no async, no fetch — runs unchanged in a
// browser (offline) and in a Convex action. Coordinates are lat-first everywhere.
import type { LatLng, PolyPoint } from '../types';

const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius (metres)
const D2R = Math.PI / 180;

/** Metres between two coordinates (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLng = (b.lng - a.lng) * D2R;
  const lat1 = a.lat * D2R;
  const lat2 = b.lat * D2R;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True if pt is inside poly. Pure ray casting; no buffer applied.
 * Uses lat as x and lng as y — self-consistent, do not mix conventions.
 * (Ported verbatim from the README snippet; it is correct, not rewritten from memory.)
 */
export function inPolygon(pt: LatLng, poly: PolyPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > pt.lng !== yj > pt.lng &&
      pt.lat < ((xj - xi) * (pt.lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Local equirectangular projection to metres around a reference latitude.
// Accurate to sub-metre at the ~100 m scales stage buffers care about.
function toMeters(p: LatLng, ref: LatLng): { x: number; y: number } {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(ref.lat * D2R);
  return { x: (p.lng - ref.lng) * mPerDegLng, y: (p.lat - ref.lat) * mPerDegLat };
}

/** Metres from pt to the segment a–b (foot of perpendicular, clamped to the ends). */
export function pointToSegmentMeters(pt: LatLng, a: PolyPoint, b: PolyPoint): number {
  const A: LatLng = { lat: a[0], lng: a[1] };
  const B: LatLng = { lat: b[0], lng: b[1] };
  const p = toMeters(pt, pt);
  const va = toMeters(A, pt);
  const vb = toMeters(B, pt);
  const abx = vb.x - va.x;
  const aby = vb.y - va.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return distanceMeters(pt, A); // degenerate: a == b
  let t = ((p.x - va.x) * abx + (p.y - va.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t)); // clamp to the segment
  const fx = va.x + t * abx;
  const fy = va.y + t * aby;
  return Math.hypot(p.x - fx, p.y - fy);
}

/** Metres from pt to the nearest edge of poly (polygon treated as closed). */
export function distanceToPolygonMeters(pt: LatLng, poly: PolyPoint[]): number {
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = pointToSegmentMeters(pt, poly[j], poly[i]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * True if pt is inside poly OR within bufferMeters of its nearest edge.
 * Inside-first, so a zero buffer still resolves interior points.
 */
export function withinBuffer(pt: LatLng, poly: PolyPoint[], bufferMeters: number): boolean {
  if (inPolygon(pt, poly)) return true;
  return distanceToPolygonMeters(pt, poly) <= bufferMeters;
}
