import type { DerivedSignals, Grid, SetId } from "../types";
import type { DwellRun } from "./runs";
import { ATTENDED_SECONDS, FULL_SET_COMPLETION_RATE } from "./thresholds";

export function deriveSignals(runs: DwellRun[], grid: Grid, priorArtistNames: string[]): DerivedSignals {
  const valid = runs.filter((run) => run.dwellSeconds > 0 && run.endTs > run.startTs);
  const dwellBySet = new Map<SetId, number>();
  for (const run of valid) if (run.setId) dwellBySet.set(run.setId, (dwellBySet.get(run.setId) ?? 0) + run.dwellSeconds);
  const attendedIds = new Set([...dwellBySet].filter(([, seconds]) => seconds >= ATTENDED_SECONDS).map(([id]) => id));
  const setById = new Map(grid.sets.map((set) => [set.id, set]));
  const perSetSkipped: Record<SetId, number> = {};

  for (const id of attendedIds) {
    const attended = setById.get(id);
    if (!attended) continue;
    const duration = attended.endTime - attended.startTime;
    // A competing set counts only when it overlaps at least half of the attended set.
    perSetSkipped[id] = grid.sets.filter((candidate) => {
      const overlap = Math.max(0, Math.min(attended.endTime, candidate.endTime) - Math.max(attended.startTime, candidate.startTime));
      return candidate.stageId !== attended.stageId && !dwellBySet.has(candidate.id) && duration > 0 && overlap / duration >= 0.5;
    }).length;
  }

  const total = valid.reduce((sum, run) => sum + run.dwellSeconds, 0);
  const prior = new Set(priorArtistNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const attendedSets = [...attendedIds].map((id) => setById.get(id)).filter((set) => set !== undefined);
  const top = [...dwellBySet].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    totalDwellSeconds: total,
    setsAttended: attendedIds.size,
    concurrentSetsSkipped: Object.values(perSetSkipped).reduce((sum, count) => sum + count, 0),
    perSetSkipped,
    completionRateAvg: valid.length ? valid.reduce((sum, run) => sum + run.completionRate, 0) / valid.length : 0,
    fullSetCount: [...dwellBySet].filter(([id, seconds]) => {
      const set = setById.get(id);
      return !!set && set.endTime > set.startTime && seconds / ((set.endTime - set.startTime) / 1000) >= FULL_SET_COMPLETION_RATE;
    }).length,
    stageDiversity: new Set(valid.map((run) => run.stageId)).size,
    nightRatio: total ? valid.reduce((sum, run) => sum + nightSeconds(run, grid.timezone), 0) / total : 0,
    discoveryRate: attendedSets.length ? attendedSets.filter((set) => !prior.has(set.artistName.trim().toLocaleLowerCase())).length / attendedSets.length : 0,
    longestRun: valid.reduce<DwellRun | null>((best, run) => !best || run.dwellSeconds > best.dwellSeconds ? run : best, null),
    topArtistBySetTime: top && setById.has(top[0]) ? { setId: top[0], artistName: setById.get(top[0])!.artistName, dwellSeconds: top[1] } : null,
  };
}

function nightSeconds(run: DwellRun, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" });
  let milliseconds = 0;
  for (let cursor = run.startTs; cursor < run.endTs;) {
    const end = Math.min(run.endTs, (Math.floor(cursor / 60_000) + 1) * 60_000);
    if (Number(hour.format(new Date(cursor))) >= 19) milliseconds += end - cursor;
    cursor = end;
  }
  return milliseconds / 1000;
}
