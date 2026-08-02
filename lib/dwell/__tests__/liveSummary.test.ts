import { describe, expect, it } from "vitest";
import { buildEventLeaderboard, CURRENT_RUN_RECENCY_MS, summarizeLiveDwell, type LiveSummaryInput } from "../liveSummary";

const sets = [
  { id: "a", stageId: "one", artistName: "Alpha", startTime: 0, endTime: 1_000_000 },
  { id: "b", stageId: "two", artistName: "Beta", startTime: 0, endTime: 1_000_000 },
];
const stages = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
const base: LiveSummaryInput = { eventId: "event", samples: [], runs: [], sets, stages, photoSetIds: new Set(), mintedSetIds: new Set() };
const run = { setId: "a", stageId: "one", startTs: 0, endTs: 600_000, dwellSeconds: 600 };

describe("summarizeLiveDwell", () => {
  it("reports idle, resolving, and ready from the persisted sample state", () => {
    expect(summarizeLiveDwell(base).processing).toBe("IDLE");
    expect(summarizeLiveDwell({ ...base, samples: [{ timestamp: 1, resolved: false }] }).processing).toBe("RESOLVING");
    expect(summarizeLiveDwell({ ...base, samples: [{ timestamp: 1, resolved: true }] }).processing).toBe("READY");
  });

  it("aggregates split runs, clamps completion, and applies attendance", () => {
    const summary = summarizeLiveDwell({
      ...base,
      samples: [{ timestamp: 1_200_000, resolved: true }],
      runs: [run, { ...run, startTs: 600_000, endTs: 1_200_000, dwellSeconds: 600 }],
    });
    expect(summary.totalDwellSeconds).toBe(1200);
    expect(summary.attendedSets[0]).toMatchObject({ setId: "a", dwellSeconds: 1200, completionRate: 1 });
  });

  it("requires dwell, a photo, and no minted card for presentation eligibility", () => {
    const eligible = summarizeLiveDwell({ ...base, samples: [{ timestamp: run.endTs, resolved: true }], runs: [run], photoSetIds: new Set(["a"]) });
    expect(eligible.current?.mintEligible).toBe(true);
    expect(summarizeLiveDwell({ ...base, samples: eligible.updatedAt ? [{ timestamp: eligible.updatedAt, resolved: true }] : [], runs: [run], photoSetIds: new Set(["a"]), mintedSetIds: new Set(["a"]) }).current?.mintEligible).toBe(false);
  });

  it("expires the current set against the latest captured sample", () => {
    const summary = summarizeLiveDwell({ ...base, samples: [{ timestamp: run.endTs + CURRENT_RUN_RECENCY_MS + 1, resolved: true }], runs: [run] });
    expect(summary.current).toBeNull();
  });
});

describe("buildEventLeaderboard", () => {
  it("deduplicates attendees, excludes unknown-event sets, and sorts ties", () => {
    const result = buildEventLeaderboard({
      sets,
      stages,
      runs: [
        { ...run, userId: "u1", dwellSeconds: 100 },
        { ...run, userId: "u1", dwellSeconds: 50 },
        { ...run, userId: "u2", dwellSeconds: 50 },
        { ...run, setId: "b", stageId: "two", userId: "u3", dwellSeconds: 200 },
        { ...run, setId: "outside", userId: "u4", dwellSeconds: 999 },
      ],
    });
    expect(result.topArtists).toEqual([
      { setId: "a", artistName: "Alpha", attendeeCount: 2, totalDwellSeconds: 200 },
      { setId: "b", artistName: "Beta", attendeeCount: 1, totalDwellSeconds: 200 },
    ]);
  });

  it("defaults and clamps the result limit", () => {
    const manySets = Array.from({ length: 25 }, (_, i) => ({ ...sets[0], id: String(i), artistName: String(i).padStart(2, "0") }));
    const runs = manySets.map((set) => ({ ...run, setId: set.id, userId: set.id }));
    expect(buildEventLeaderboard({ sets: manySets, stages, runs }).topArtists).toHaveLength(5);
    expect(buildEventLeaderboard({ sets: manySets, stages, runs }, 100).topArtists).toHaveLength(20);
    expect(buildEventLeaderboard({ sets: manySets, stages, runs }, 0).topArtists).toHaveLength(1);
  });
});
