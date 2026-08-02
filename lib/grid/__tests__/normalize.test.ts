import assert from "node:assert/strict";
import { test } from "vitest";
import { loadStages } from "@/lib/geo/polygons";
import type { ArtistMeta, RawJamBaseEvent } from "../jambase";
import { toGrid } from "../normalize";

const festival = {
  id: "outside-lands-2026",
  name: "Outside Lands 2026",
  timezone: "America/Los_Angeles",
};

const event = (overrides: Partial<RawJamBaseEvent> = {}): RawJamBaseEvent => ({
  id: "set-1",
  artistName: "Artist",
  jambaseArtistId: "jambase:1",
  stageName: "Twin Peaks Stage",
  startDate: "2026-08-07T19:00:00-07:00",
  endDate: "2026-08-07T20:00:00-07:00",
  status: "scheduled",
  estimatedAudience: null,
  festival,
  _provenance: "modeled:stage-time",
  ...overrides,
});

const artistMeta: ArtistMeta = {
  jambaseArtistId: "jambase:1",
  spotifyId: null,
  musicbrainzId: null,
  genreTags: [],
  estimatedAudience: null,
  isFestivalDebut: false,
  isFinalShow: false,
  nextTourDate: null,
};

test("toGrid uses canonical geometry and only explicit stage aliases", () => {
  const maliciousStages = [{ ...loadStages()[0], polygon: [[0, 0] as [number, number]] }];
  const grid = toGrid(
    [event(), event({ id: "set-2", stageName: "Twin Mountain" })],
    maliciousStages,
    { "jambase:1": artistMeta },
  );

  assert.deepEqual(grid.stages, loadStages());
  assert.equal(grid.sets.length, 1);
  assert.equal(grid.sets[0].stageId, "twin-peaks");
});

test("day-only performer facts are not fabricated into midnight sets", () => {
  const grid = toGrid(
    [event({ startDate: "2026-08-07", endDate: "2026-08-07" })],
    loadStages(),
    {},
  );
  assert.equal(grid.sets.length, 0);
});

test("times become UTC epoch milliseconds and slot order is stable per stage/day", () => {
  const grid = toGrid(
    [
      event({ id: "late", startDate: "2026-08-07T20:00:00-07:00", endDate: "2026-08-07T21:00:00-07:00" }),
      event({ id: "early", startDate: "2026-08-07T18:00:00-07:00", endDate: "2026-08-07T19:00:00-07:00" }),
      event({ id: "next-day", startDate: "2026-08-08T00:30:00-07:00", endDate: "2026-08-08T01:30:00-07:00" }),
    ],
    loadStages(),
    { "jambase:1": artistMeta },
  );

  assert.deepEqual(grid.sets.map((set) => set.id), ["early", "late", "next-day"]);
  assert.deepEqual(grid.sets.map((set) => set.slotIndex), [0, 1, 0]);
  assert.equal(grid.sets[0].startTime, Date.UTC(2026, 7, 8, 1));
  assert.ok(grid.sets.every((set) => set.endTime > set.startTime));
  assert.equal((grid.sets[0] as unknown as { _provenance: string })._provenance, "modeled:stage-time");
  assert.equal((grid.sets[0] as unknown as { _status: string })._status, "scheduled");
});

test("source headliner fact wins over the modeled last-slot fallback", () => {
  type HeadlinerEvent = RawJamBaseEvent & { isHeadliner: boolean };
  const sourceHeadliner = event({ id: "source", startDate: "2026-08-07T18:00:00-07:00", endDate: "2026-08-07T19:00:00-07:00" }) as HeadlinerEvent;
  sourceHeadliner.isHeadliner = true;
  const grid = toGrid([sourceHeadliner, event({ id: "late" })], loadStages(), {});
  assert.equal(grid.sets.find((set) => set.id === "source")?.isHeadliner, true);
  assert.equal(grid.sets.find((set) => set.id === "late")?.isHeadliner, true);
});
