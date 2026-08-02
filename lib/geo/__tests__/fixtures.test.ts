// Run with: npm test (vitest)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadStages } from '../polygons';
import { resolveStage } from '../resolve';
import { STAGE_CENTROIDS, OFF_STAGE_POINTS } from '../fixtures';

const STAGES = loadStages();

test('STAGE_CENTROIDS has a spoof target for every stage', () => {
  const ids = STAGES.map((s) => s.id).sort();
  assert.deepEqual(Object.keys(STAGE_CENTROIDS).sort(), ids);
});

test('every STAGE_CENTROIDS point resolves unambiguously inside its own stage', () => {
  for (const [id, pt] of Object.entries(STAGE_CENTROIDS)) {
    assert.equal(resolveStage(pt, STAGES), id, `${id} spoof point must resolve to ${id}`);
  }
});

test('OFF_STAGE_POINTS has at least four known-outside points', () => {
  assert.ok(OFF_STAGE_POINTS.length >= 4);
});

test('every OFF_STAGE_POINT resolves to null', () => {
  for (const pt of OFF_STAGE_POINTS) {
    assert.equal(resolveStage(pt, STAGES), null, `${JSON.stringify(pt)} must be null`);
  }
});
