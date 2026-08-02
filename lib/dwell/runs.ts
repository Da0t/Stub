import { resolveStage } from "../geo/resolve";
import type { DwellSample, Grid, SetId, StageId } from "../types";
import { DEFAULT_MAX_GAP_MS } from "./thresholds";

export interface DwellRun {
  stageId: StageId;
  setId: SetId | null;
  startTs: number;
  endTs: number;
  dwellSeconds: number;
  completionRate: number;
  sampleCount: number;
}

type ResolvedSample = DwellSample & { stageId: StageId | null };

export function buildDwellRuns(samples: DwellSample[], grid: Grid, opts: { maxGapMs?: number; minSamples?: number } = {}): DwellRun[] {
  const maxGapMs = opts.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  const minSamples = opts.minSamples ?? 2;
  if (maxGapMs < 0 || !Number.isInteger(minSamples) || minSamples < 1) throw new RangeError("invalid dwell run options");

  const seen = new Set<string>();
  const resolved = [...samples]
    .sort((a, b) => a.ts - b.ts || a.clientId.localeCompare(b.clientId))
    .filter((sample) => !seen.has(sample.clientId) && !!seen.add(sample.clientId))
    .map((sample): ResolvedSample => ({ ...sample, stageId: resolveStage({ lat: sample.lat, lng: sample.lng }, grid.stages) }));

  const groups: ResolvedSample[][] = [];
  let current: ResolvedSample[] | undefined;
  for (const sample of resolved) {
    const previous = current?.at(-1);
    if (sample.stageId === null) {
      current = undefined;
    } else if (!current || previous?.stageId !== sample.stageId || sample.ts - previous.ts > maxGapMs) {
      current = [sample];
      groups.push(current);
    } else current.push(sample);
  }

  return groups.flatMap<DwellRun>((group) => {
    if (group.length < minSamples) return [];
    const stageId = group[0].stageId as StageId;
    const startTs = group[0].ts;
    const endTs = group.at(-1)!.ts;
    if (endTs <= startTs) return [];
    const sets = grid.sets.filter((set) => set.stageId === stageId && set.endTime > startTs && set.startTime < endTs)
      .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));

    if (!sets.length) return [{ stageId, setId: null, startTs, endTs, dwellSeconds: (endTs - startTs) / 1000, completionRate: 0, sampleCount: group.length }];
    return sets.flatMap((set) => {
      const start = Math.max(startTs, set.startTime);
      const end = Math.min(endTs, set.endTime);
      if (end <= start || set.endTime <= set.startTime) return [];
      const dwellSeconds = (end - start) / 1000;
      return [{
        stageId, setId: set.id, startTs: start, endTs: end, dwellSeconds,
        completionRate: Math.min(1, Math.max(0, dwellSeconds / ((set.endTime - set.startTime) / 1000))),
        sampleCount: group.filter((sample) => sample.ts >= start && sample.ts <= end).length,
      }];
    });
  });
}
