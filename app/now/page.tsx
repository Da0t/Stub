// app/now/page.tsx
//
// Path 3 — the now-playing surface. Five rows: stage, who is on now, who is
// next, set window. Read from the cached grid (ensureGrid → IndexedDB/bundled,
// never the network). Deliberately minimal: no map, no routing, no crowd
// density. "We didn't build navigation. The festival app already does that."
//
// Demo time-override: /now?t=<epoch ms | ISO 8601>. Without it we default to a
// live Saturday evening, because the festival has not happened yet and an empty
// Sunday-afternoon-in-August demos badly.

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ensureGrid } from "@/lib/grid/cache";
import { nowPlaying, type StageNow } from "@/lib/grid/nowPlaying";
import type { Grid, SetRecord } from "@/lib/types";

// Saturday Aug 8 2026, 8:45 PM PDT — headliners live on four stages at once.
const DEFAULT_DEMO_TS = Date.parse("2026-08-08T20:45:00-07:00");

function parseTs(raw: string | null): number {
  if (!raw) return DEFAULT_DEMO_TS;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && raw.trim() !== "") return asNum;
  const asDate = Date.parse(raw);
  return Number.isFinite(asDate) ? asDate : DEFAULT_DEMO_TS;
}

function fmtTime(ts: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

function fmtDay(ts: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ts));
}

function windowLabel(set: SetRecord, tz: string): string {
  return `${fmtTime(set.startTime, tz)} – ${fmtTime(set.endTime, tz)}`;
}

function SetCell({ set, tz }: { set: SetRecord | null; tz: string }) {
  if (!set) return <span className="text-neutral-500">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-neutral-100">
        {set.artistName}
        {set.isHeadliner && (
          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Headliner
          </span>
        )}
      </span>
      <span className="text-sm text-neutral-400">{windowLabel(set, tz)}</span>
      {/* Sleeper feature: JamBase already joined artist → Spotify id. Surface it. */}
      {set.spotifyId && (
        <a
          href={`https://open.spotify.com/artist/${set.spotifyId}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-green-400 hover:underline"
        >
          ▶ Listen on Spotify
        </a>
      )}
      {set.nextTourDate && (
        <span className="text-xs text-neutral-500">
          Next: {set.nextTourDate.venue}, {set.nextTourDate.city} ·{" "}
          {fmtDay(set.nextTourDate.date, tz)}
        </span>
      )}
    </div>
  );
}

function NowPlaying() {
  const params = useSearchParams();
  const ts = parseTs(params.get("t"));
  const [grid, setGrid] = useState<Grid | null>(null);

  useEffect(() => {
    let alive = true;
    ensureGrid().then((g) => {
      if (alive) setGrid(g);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!grid) {
    return <p className="text-neutral-400">Loading cached grid…</p>;
  }

  const rows: StageNow[] = nowPlaying(grid, ts);
  const tz = grid.timezone;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-100">{grid.eventName}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Showing {fmtDay(ts, tz)}, {fmtTime(ts, tz)} (Pacific).{" "}
          <span className="text-neutral-500">
            Override with <code className="text-neutral-300">?t=</code> (epoch ms
            or ISO).
          </span>
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-semibold">Stage</th>
              <th className="px-4 py-3 font-semibold">Now</th>
              <th className="px-4 py-3 font-semibold">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stage, now, next }) => (
              <tr
                key={stage.id}
                className="border-b border-neutral-800/60 last:border-0"
              >
                <td className="px-4 py-4 align-top font-semibold text-neutral-200">
                  {stage.name}
                </td>
                <td className="px-4 py-4 align-top">
                  <SetCell set={now} tz={tz} />
                </td>
                <td className="px-4 py-4 align-top">
                  <SetCell set={next} tz={tz} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Path 6 owns the mintable-near-you list; we render the stage context
          around it. Left as a labelled seam until path 6 lands. */}
      <p className="mt-6 text-xs text-neutral-600">
        Mintable cards near you appear here once path 6 is wired. We didn&apos;t
        build navigation — the festival app already does that.
      </p>
    </>
  );
}

export default function NowPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
        <NowPlaying />
      </Suspense>
    </main>
  );
}
