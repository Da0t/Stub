"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { EventDwellLeaderboard, LiveDwellSummary } from "../../lib/dwell/liveSummary";

export function LiveDwellPanel({ userId, eventId }: { userId: Id<"users">; eventId: Id<"events"> }) {
  const summary = useQuery(api.dwellLive.summary, { userId, eventId }) as LiveDwellSummary | undefined;
  const leaderboard = useQuery(api.dwellLive.leaderboard, { eventId, limit: 5 }) as EventDwellLeaderboard | undefined;

  if (!summary) return <p aria-live="polite">Loading live dwell data…</p>;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section aria-labelledby="live-status" style={panelStyle}>
        <h2 id="live-status">Live processing</h2>
        <p aria-live="polite">
          {summary.processing === "IDLE" && "Waiting for festival samples."}
          {summary.processing === "RESOLVING" && `Resolving ${summary.unresolvedSampleCount} of ${summary.sampleCount} samples.`}
          {summary.processing === "READY" && `Ready — ${summary.sampleCount} samples resolved.`}
        </p>
        <dl style={statsStyle}>
          <Stat label="Samples" value={summary.sampleCount} />
          <Stat label="Unresolved" value={summary.unresolvedSampleCount} />
          <Stat label="Runs" value={summary.runCount} />
          <Stat label="Total dwell" value={minutes(summary.totalDwellSeconds)} />
        </dl>
      </section>

      <section aria-labelledby="current-set" style={panelStyle}>
        <h2 id="current-set">Current set</h2>
        {summary.current ? <>
          <h3>{summary.current.artistName}</h3>
          <p>{summary.current.stageName} · {minutes(summary.current.dwellSeconds)}</p>
          <label>
            {Math.round(summary.current.completionRate * 100)}% complete
            <progress max={1} value={summary.current.completionRate} style={{ display: "block", width: "100%" }} />
          </label>
          <p aria-live="polite">{summary.current.mintEligible ? "Card is ready to claim." : "Card is not eligible yet."}</p>
        </> : <p>No recently observed set.</p>}
      </section>

      <section aria-labelledby="attended" style={panelStyle}>
        <h2 id="attended">Attended sets</h2>
        {summary.attendedSets.length === 0 ? <p>No set has reached the 10-minute attendance threshold.</p> :
          <ul>{summary.attendedSets.map((set) => <li key={set.setId} style={{ marginBottom: 8 }}>
            <strong>{set.artistName}</strong> — {set.stageName}, {minutes(set.dwellSeconds)}, {Math.round(set.completionRate * 100)}%{set.minted ? ", minted" : ""}
          </li>)}</ul>}
      </section>

      <section aria-labelledby="leaderboard" style={panelStyle}>
        <h2 id="leaderboard">Event leaderboard</h2>
        {!leaderboard ? <p>Loading event totals…</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
          <Ranked title="Top artists" rows={leaderboard.topArtists.map((row) => ({ key: row.setId, name: row.artistName, detail: `${minutes(row.totalDwellSeconds)} · ${row.attendeeCount} attendees` }))} />
          <Ranked title="Top stages" rows={leaderboard.topStages.map((row) => ({ key: row.stageId, name: row.stageName, detail: `${minutes(row.totalDwellSeconds)} · ${row.attendeeCount} attendees` }))} />
        </div>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><dt style={{ opacity: 0.7 }}>{label}</dt><dd style={{ margin: 0, fontSize: 24 }}>{value}</dd></div>;
}

function Ranked({ title, rows }: { title: string; rows: Array<{ key: string; name: string; detail: string }> }) {
  return <div><h3>{title}</h3>{rows.length === 0 ? <p>No dwell recorded.</p> : <ol>{rows.map((row) => <li key={row.key}><strong>{row.name}</strong><br /><small>{row.detail}</small></li>)}</ol>}</div>;
}

function minutes(seconds: number) { return `${Math.round(seconds / 60)} min`; }

const panelStyle = { border: "1px solid #444", borderRadius: 12, padding: 20 } as const;
const statsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16 } as const;



