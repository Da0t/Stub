'use client';

// Dev-only polygon visualiser for path 2. No real basemap (cut line 3) — a
// plain SVG with an axis-scaled lat/lng projection, which is all it takes to
// sanity-check the geography. This is how the whole team eyeballs the polygons,
// and it is a strong fallback demo artifact: if a judge asks "how do you know
// they were there," you show polygons, not a paragraph.
//
// Click the map (or a preset) to move the device dot; scrub time to watch the
// set change. The readout is the real resolve() output — no model anywhere.
import { useMemo, useRef, useState, type MouseEventHandler, type CSSProperties } from 'react';
import type { LatLng, PolyPoint } from '@/lib/types';
import { buildSampleGrid, loadStages, loadZones } from '@/lib/geo/polygons';
import { resolve } from '@/lib/geo/resolve';
import { STAGE_CENTROIDS, OFF_STAGE_POINTS } from '@/lib/geo/fixtures';

const grid = buildSampleGrid();
const stages = loadStages();
const zones = loadZones();

// Projection bounds: bbox of every stage + zone point, padded a little.
const allPts: PolyPoint[] = [
  ...stages.flatMap((s) => s.polygon),
  ...zones.flatMap((z) => z.polygon),
];
const pad = 0.0006;
const minLat = Math.min(...allPts.map((p) => p[0])) - pad;
const maxLat = Math.max(...allPts.map((p) => p[0])) + pad;
const minLng = Math.min(...allPts.map((p) => p[1])) - pad;
const maxLng = Math.max(...allPts.map((p) => p[1])) + pad;

const W = 960;
const latSpanM = (maxLat - minLat) * 111_320;
const lngSpanM = (maxLng - minLng) * 111_320 * Math.cos((37.77 * Math.PI) / 180);
const H = Math.round((W * latSpanM) / lngSpanM);

const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
const y = (lat: number) => ((maxLat - lat) / (maxLat - minLat)) * H;
const toPath = (poly: PolyPoint[]) =>
  poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[1]).toFixed(1)},${y(p[0]).toFixed(1)}`).join(' ') + ' Z';

// Festival-day time range (from the sample sets) for the scrubber.
const tMin = Math.min(...grid.sets.map((s) => s.startTime)) - 20 * 60_000;
const tMax = Math.max(...grid.sets.map((s) => s.endTime)) + 20 * 60_000;
// Open the scrubber mid-set rather than mid-range, so the page lands on a live
// resolution instead of an empty gap. Derived from the grid, not an artist name.
const defaultMid = (() => {
  const landsEnd = grid.sets
    .filter((s) => s.stageId === 'lands-end')
    .sort((a, b) => a.startTime - b.startTime);
  const s = landsEnd[landsEnd.length - 1] ?? grid.sets[0];
  return s ? (s.startTime + s.endTime) / 2 : (tMin + tMax) / 2;
})();

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: grid.timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DebugMapPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pt, setPt] = useState<LatLng>(STAGE_CENTROIDS['lands-end']);
  const [ts, setTs] = useState<number>(defaultMid);

  const { stageId, setId } = useMemo(() => resolve(pt, ts, grid), [pt, ts]);
  const stage = stageId ? stages.find((s) => s.id === stageId) : null;
  const set = setId ? grid.sets.find((s) => s.id === setId) : null;

  const onMapClick: MouseEventHandler<SVGSVGElement> = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const lng = minLng + (px / W) * (maxLng - minLng);
    const lat = maxLat - (py / H) * (maxLat - minLat);
    setPt({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
  };

  const useDeviceGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPt({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000 },
    );
  };

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: 16, color: '#e5e7eb', background: '#0b0f14', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Path 2 · stage geometry debug map</h1>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
        Golden Gate Park (western half). Click the map to move the dot; scrub time to change the set. Deterministic — no model.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          onClick={onMapClick}
          style={{ width: 'min(960px, 92vw)', height: 'auto', border: '1px solid #1f2937', background: '#0f1720', cursor: 'crosshair' }}
        >
          {zones.map((z) => (
            <g key={z.name}>
              <path d={toPath(z.polygon)} fill="#374151" fillOpacity={0.25} stroke="#4b5563" strokeDasharray="4 4" />
              <text x={x(z.polygon[0][1])} y={y(z.polygon[0][0]) - 3} fill="#6b7280" fontSize={10}>{z.name}</text>
            </g>
          ))}
          {stages.map((s) => {
            const active = s.id === stageId;
            return (
              <g key={s.id}>
                <path d={toPath(s.polygon)} fill={active ? '#22d3ee' : '#0ea5b7'} fillOpacity={active ? 0.4 : 0.18} stroke={active ? '#22d3ee' : '#0891b2'} strokeWidth={active ? 2 : 1} />
                <circle cx={x(s.centroid[1])} cy={y(s.centroid[0])} r={2.5} fill="#67e8f9" />
                <text x={x(s.centroid[1])} y={y(s.centroid[0]) - 6} fill="#a5f3fc" fontSize={12} textAnchor="middle">{s.name}</text>
                <text x={x(s.centroid[1])} y={y(s.centroid[0]) + 14} fill="#64748b" fontSize={9} textAnchor="middle">buf {s.bufferMeters}m</text>
              </g>
            );
          })}
          {/* device dot */}
          <circle cx={x(pt.lng)} cy={y(pt.lat)} r={6} fill="#f43f5e" stroke="#fff" strokeWidth={1.5} />
        </svg>

        <div style={{ minWidth: 260, fontSize: 13 }}>
          <div style={{ padding: 12, border: '1px solid #1f2937', borderRadius: 8, background: '#111827' }}>
            <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>RESOLUTION</div>
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>
              <div>stage → <b style={{ color: stage ? '#22d3ee' : '#6b7280' }}>{stage ? stage.name : 'null'}</b></div>
              <div>set → <b style={{ color: set ? '#a5f3fc' : '#6b7280' }}>{set ? set.id : 'null'}</b></div>
              <div>artist → <b style={{ color: set ? '#f0abfc' : '#6b7280' }}>{set ? set.artistName : 'null'}</b></div>
            </div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>
              [{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}]<br />
              {fmtTime(ts)}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ color: '#9ca3af', fontSize: 11 }}>time</label>
            <input type="range" min={tMin} max={tMax} step={60_000} value={ts} onChange={(e) => setTs(+e.target.value)} style={{ width: '100%' }} />
          </div>

          <div style={{ marginTop: 12, color: '#9ca3af', fontSize: 11 }}>spoof to stage</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {stages.map((s) => (
              <button key={s.id} onClick={() => setPt(STAGE_CENTROIDS[s.id])} style={btn}>{s.name}</button>
            ))}
          </div>

          <div style={{ marginTop: 12, color: '#9ca3af', fontSize: 11 }}>spoof off-stage (expect null)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {OFF_STAGE_POINTS.map((p, i) => (
              <button key={i} onClick={() => setPt(p)} style={btn}>off #{i + 1}</button>
            ))}
          </div>

          <button onClick={useDeviceGps} style={{ ...btn, marginTop: 12, width: '100%' }}>use device GPS</button>
        </div>
      </div>
    </main>
  );
}

const btn: CSSProperties = {
  background: '#1f2937',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
