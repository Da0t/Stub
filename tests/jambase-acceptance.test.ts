import assert from "node:assert/strict";
import test from "node:test";
import gridSample from "../data/grid.sample.json";
import { loadStages } from "../lib/geo/polygons";

test("committed grid uses canonical geometry and valid ordered windows", () => {
  assert.deepEqual(gridSample.stages, loadStages());
  const stageIds = new Set(loadStages().map((stage) => stage.id));
  let previous = -Infinity;
  for (const set of gridSample.sets) {
    assert.ok(stageIds.has(set.stageId), `${set.id} has an unknown stage`);
    assert.ok(Number.isFinite(set.startTime));
    assert.ok(Number.isFinite(set.endTime));
    assert.ok(set.endTime > set.startTime, `${set.id} has an invalid window`);
    assert.ok(set.startTime >= previous, "sets are not globally ordered");
    assert.ok(set._provenance, `${set.id} is missing schedule provenance`);
    previous = set.startTime;
  }
});

test("verified headliner Spotify ids and a future tour date stay in the fallback", () => {
  const expected = new Map([
    ["Charli xcx", "25uiPmTg16RbhZWAqwLBy5"],
    ["The Strokes", "0epOFNiUfyON9EYx7Tpr6V"],
    ["RÜFÜS DU SOL", "5xxv7p88qAhl2kvQjrU6kV"],
  ]);
  for (const [artist, spotifyId] of expected) {
    const set = gridSample.sets.find((candidate) => candidate.artistName === artist);
    assert.ok(set, `${artist} is missing from the committed fallback`);
    assert.equal(set.spotifyId, spotifyId);
  }
  assert.ok(gridSample.sets.some((set) => set.nextTourDate?.date));
});
