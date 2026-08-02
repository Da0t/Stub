import { describe, expect, it } from "vitest";
import { buildFallbackGrid, buildSeedPlan } from "../seed-plan";

// buildSeedPlan is the one piece of genuinely non-trivial logic in path 4
// that has zero cross-path dependencies (pure over a Grid) — everything
// else needs either a live Convex deployment or another branch's files.
// This is the "one runnable check" for it. Deterministic: neither function
// under test uses Math.random.

describe("buildFallbackGrid", () => {
  const grid = buildFallbackGrid();

  it("produces 5 stages and a dense multi-day set list", () => {
    expect(grid.stages).toHaveLength(5);
    expect(grid.sets.length).toBeGreaterThan(50);
  });

  it("gives Duboce Triangle the widest buffer (GPS drift)", () => {
    const duboce = grid.stages.find((s) => s.name === "Duboce Triangle");
    expect(duboce?.bufferMeters).toBe(45);
  });
});

describe("buildSeedPlan", () => {
  const grid = buildFallbackGrid();
  const plan = buildSeedPlan(grid);

  it("attends exactly 11 sets (README seed spec)", () => {
    expect(plan.attended).toHaveLength(11);
  });

  it("never attends the same set twice", () => {
    const ids = plan.attended.map((a) => a.set.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spreads across at least 4 distinct stages", () => {
    const stages = new Set(plan.attended.map((a) => a.stage.name));
    expect(stages.size).toBeGreaterThanOrEqual(4);
  });

  it("leaves exactly 4 sets as discoveries (11 attended - 7 with a prior card)", () => {
    expect(plan.priorArtistNames).toHaveLength(7);
    expect(plan.attended.length - plan.priorArtistNames.length).toBe(4);
  });

  it("gives at least one run a >5 minute gap", () => {
    expect(plan.attended.some((a) => a.gapAt === "middle")).toBe(true);
  });

  it("never records dwell longer than the set itself (no fabricated >100% completion)", () => {
    for (const a of plan.attended) {
      const durationSec = (a.set.endTime - a.set.startTime) / 1000;
      expect(a.dwellSeconds).toBeLessThanOrEqual(durationSec);
      expect(a.dwellSeconds).toBeGreaterThan(0);
    }
  });

  it("picks a Friday-night opportunity-cost set with >=3 real concurrent overlaps", () => {
    const skipSet = plan.attended.find((a) => a.set.id === plan.fridayNightSkipSetId);
    expect(skipSet).toBeDefined();

    // Recomputed independently of buildSeedPlan's own overlap count, against
    // the full grid (not just attended sets) — this is what
    // concurrentSetsSkipped will actually measure once path 5 lands.
    const overlaps = grid.sets.filter(
      (o) =>
        o.id !== skipSet!.set.id &&
        o.startTime < skipSet!.set.endTime &&
        o.endTime > skipSet!.set.startTime,
    );
    expect(overlaps.length).toBeGreaterThanOrEqual(3);
  });

  it("gives the opportunity-cost set the 47-minute headline dwell", () => {
    const skipSet = plan.attended.find((a) => a.set.id === plan.fridayNightSkipSetId)!;
    const durationSec = (skipSet.set.endTime - skipSet.set.startTime) / 1000;
    expect(skipSet.dwellSeconds).toBe(Math.min(durationSec, 47 * 60));
  });
});
