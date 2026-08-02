// lib/grid/nowPlaying.ts
//
// Path 3 — now/next computation from a cached Grid + a timestamp.
//
// Pure and deterministic: given (grid, ts) it always returns the same rows.
// This uses the UNPADDED set window (no grace) — "who is on stage right now" is
// a display fact, not a mint-eligibility fact. The ±15 min grace lives in path
// 2's lookupSet and must not leak into the now/next surface.

import type { Grid, SetRecord, Stage } from "@/lib/types";

export interface StageNow {
  stage: Stage;
  now: SetRecord | null;
  next: SetRecord | null;
}

/**
 * For every stage in the grid, the set playing at `ts` and the next one to
 * start after `ts`. `now` is null when the stage is dark; `next` is null after
 * the last set of the festival on that stage. Both null is a legitimate,
 * correct answer for a stage between/after sets.
 */
export function nowPlaying(grid: Grid, ts: number): StageNow[] {
  return grid.stages.map((stage) => {
    const setsHere = grid.sets
      .filter((s) => s.stageId === stage.id)
      .sort((a, b) => a.startTime - b.startTime);

    const now =
      setsHere.find((s) => s.startTime <= ts && ts < s.endTime) ?? null;
    const next = setsHere.find((s) => s.startTime > ts) ?? null;

    return { stage, now, next };
  });
}
