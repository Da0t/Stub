import { notFound } from "next/navigation";
import type { Grid } from "../../../lib/types";
import type { DwellRun } from "../../../lib/dwell/runs";
import { deriveSignals } from "../../../lib/dwell/signals";

const start = Date.parse("2026-08-08T01:00:00Z");
const minute = 60_000;
const setDefaults = { slotIndex: 0, isHeadliner: false, estimatedAudience: null, isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null };
const grid = {
  festivalId: "debug", eventName: "Dwell Debug", timezone: "America/Los_Angeles", fetchedAt: start, stages: [
    { id: "main", name: "Main", polygon: [], bufferMeters: 0, centroid: [0, 0] },
    { id: "side", name: "Side", polygon: [], bufferMeters: 0, centroid: [0, 0] },
  ], sets: [
    { ...setDefaults, id: "first", stageId: "main", artistName: "First Artist", startTime: start, endTime: start + 60 * minute },
    { ...setDefaults, id: "second", stageId: "main", artistName: "Second Artist", startTime: start + 75 * minute, endTime: start + 135 * minute },
    { ...setDefaults, id: "alternative", stageId: "side", artistName: "Alternative", startTime: start, endTime: start + 60 * minute },
  ],
} as Grid;
const runs: DwellRun[] = [
  { stageId: "main", setId: "first", startTs: start + 5 * minute, endTs: start + 48 * minute, dwellSeconds: 43 * 60, completionRate: 43 / 60, sampleCount: 35 },
  { stageId: "main", setId: "second", startTs: start + 80 * minute, endTs: start + 112 * minute, dwellSeconds: 32 * 60, completionRate: 32 / 60, sampleCount: 27 },
];
const end = start + 135 * minute;
const position = (ts: number) => `${((ts - start) / (end - start)) * 100}%`;

export default function DwellDebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const signals = deriveSignals(runs, grid, []);
  return <main style={{ maxWidth: 960, margin: "40px auto", padding: 24, fontFamily: "ui-monospace, monospace" }}>
    <h1>Dwell timeline</h1>
    <p>Filled bars are observed dwell. Empty space is deliberately not interpolated.</p>
    {grid.stages.map((stage) => <section key={stage.id} style={{ margin: "28px 0" }}>
      <strong>{stage.name}</strong>
      <div style={{ position: "relative", height: 44, marginTop: 8, background: "#eee", borderRadius: 6, overflow: "hidden" }}>
        {grid.sets.filter((set) => set.stageId === stage.id).map((set) => <div key={set.id} title={set.artistName} style={{ position: "absolute", left: position(set.startTime), width: position(set.endTime - set.startTime + start), height: "100%", background: "#d8d8d8", border: "1px solid #aaa" }} />)}
        {runs.filter((run) => run.stageId === stage.id).map((run) => <div key={`${run.startTs}-${run.endTs}`} title={`${Math.round(run.dwellSeconds / 60)} min observed`} style={{ position: "absolute", left: position(run.startTs), width: position(run.endTs - run.startTs + start), top: 10, height: 24, background: "#1f7a4d", borderRadius: 4 }} />)}
      </div>
    </section>)}
    <h2>Derived signals</h2>
    <pre style={{ padding: 20, overflow: "auto", background: "#111", color: "#d8ffe8", borderRadius: 6 }}>{JSON.stringify(signals, null, 2)}</pre>
  </main>;
}
