import { expect, test } from "vitest";
import type { Grid } from "../../types";
import type { DwellRun } from "../runs";
import { deriveSignals } from "../signals";

const start = Date.parse("2026-08-08T02:00:00Z");
const setDefaults = { slotIndex: 0, isHeadliner: false, estimatedAudience: null, isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null };
const grid = {
  festivalId: "test", eventName: "Test", timezone: "America/Los_Angeles", fetchedAt: 0, stages: [],
  sets: [
    { ...setDefaults, id: "a", stageId: "one", artistName: "New Artist", startTime: start, endTime: start + 60 * 60_000 },
    { ...setDefaults, id: "b", stageId: "two", artistName: "Other", startTime: start, endTime: start + 45 * 60_000 },
    { ...setDefaults, id: "edge", stageId: "three", artistName: "Edge", startTime: start + 50 * 60_000, endTime: start + 80 * 60_000 },
  ],
} as Grid;
const run: DwellRun = { stageId: "one", setId: "a", startTs: start, endTs: start + 48 * 60_000, dwellSeconds: 48 * 60, completionRate: 0.8, sampleCount: 49 };

test("derives opportunity cost and deterministic totals", () => {
  const signals = deriveSignals([run], grid, []);
  expect(signals.concurrentSetsSkipped).toBe(1);
  expect(signals.perSetSkipped).toEqual({ a: 1 });
  expect(signals.fullSetCount).toBe(1);
  expect(signals.nightRatio).toBe(1);
  expect(signals.discoveryRate).toBe(1);
  expect(deriveSignals([run], grid, [])).toEqual(signals);
});
