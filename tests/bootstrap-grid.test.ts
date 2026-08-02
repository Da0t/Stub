import assert from "node:assert/strict";
import test from "node:test";
import { toBootstrapPayload } from "@/scripts/bootstrap-grid";
import type { Grid } from "@/lib/types";

const grid: Grid = {
  festivalId: "13969984", eventName: "Outside Lands 2026",
  timezone: "America/Los_Angeles", fetchedAt: 1,
  stages: [{ id: "lands-end", name: "Lands End", polygon: [[1, 2], [3, 4], [5, 6]], bufferMeters: 30, centroid: [3, 4] }],
  sets: [{ id: "source:set:1", stageId: "lands-end", artistName: "Artist", startTime: 100,
    endTime: 200, slotIndex: 0, isHeadliner: true, estimatedAudience: null,
    isFestivalDebut: false, isFinalShow: false, genreTags: [], jambaseArtistId: null,
    spotifyId: null, nextTourDate: null }],
};

test("bootstrap payload preserves canonical ids, provenance and null semantics", () => {
  const payload = toBootstrapPayload(grid, "source:day-only; reconstructed:stage/time");
  assert.equal(payload.event.startDate, 100);
  assert.equal(payload.event.endDate, 200);
  assert.equal(payload.stages[0].id, "lands-end");
  assert.equal(payload.sets[0].stageId, "lands-end");
  assert.equal(payload.sets[0].sourceId, "source:set:1");
  assert.equal(payload.sets[0].estimatedAudience, undefined);
  assert.match(payload.provenance, /reconstructed/);
});

test("bootstrap rejects missing or invalid synthesized inputs", () => {
  assert.throws(() => toBootstrapPayload({ ...grid, sets: [] }, "day-only"), /no set windows/);
  assert.throws(() => toBootstrapPayload({ ...grid, sets: [{ ...grid.sets[0], stageId: "fake" }] }, "x"), /unknown stage/);
  assert.throws(() => toBootstrapPayload({ ...grid, sets: [{ ...grid.sets[0], endTime: 100 }] }, "x"), /invalid time/);
  assert.throws(() => toBootstrapPayload({ ...grid, sets: [grid.sets[0], { ...grid.sets[0], id: "duplicate" }] }, "x"), /Duplicate set window/);
});
