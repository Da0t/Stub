import { describe, expect, it } from "vitest";
import { buildDwellRuns } from "../runs";
import { base, clean45, grid, minute, offStageBreak, sample, spanningSets, twelveMinuteGap } from "./fixtures";

describe("buildDwellRuns", () => {
  it("builds an exact clean run without mutating out-of-order input", () => {
    const input = [...clean45].reverse();
    const snapshot = [...input];
    const runs = buildDwellRuns(input, grid);
    expect(input).toEqual(snapshot);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ setId: "main-1", startTs: base, endTs: base + 45 * minute, dwellSeconds: 2700, completionRate: 0.6, sampleCount: 46 });
  });

  it("does not interpolate across a twelve-minute gap", () => {
    const runs = buildDwellRuns(twelveMinuteGap, grid);
    expect(runs.map((run) => run.dwellSeconds)).toEqual([240, 240]);
  });

  it("lets an off-stage sample break two otherwise contiguous runs", () => {
    const runs = buildDwellRuns(offStageBreak, grid);
    expect(runs.map((run) => run.dwellSeconds)).toEqual([120, 120]);
  });

  it("splits a run at an unpadded set boundary", () => {
    const runs = buildDwellRuns(spanningSets, grid);
    expect(runs.map(({ setId, dwellSeconds }) => ({ setId, dwellSeconds }))).toEqual([
      { setId: "main-1", dwellSeconds: 300 },
      { setId: "main-2", dwellSeconds: 300 },
    ]);
  });

  it("clips presence that begins before a set and deduplicates client ids", () => {
    const before = sample("before", -3);
    const atStart = sample("start", 0);
    const duplicate = { ...atStart, ts: base + minute };
    const [run] = buildDwellRuns([sample("inside", 3), duplicate, before, atStart], grid);
    expect(run).toMatchObject({ startTs: base, endTs: base + 3 * minute, dwellSeconds: 180 });
  });

  it("drops groups below the configured sample threshold", () => {
    expect(buildDwellRuns([sample("one", 0), sample("two", 1)], grid, { minSamples: 3 })).toEqual([]);
  });
});
