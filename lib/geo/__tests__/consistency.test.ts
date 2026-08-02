// Run with: npm test (vitest)
// Guards that the two committed data files never drift, and that the meadows
// stay far enough apart for unambiguous resolution.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { loadStages } from '../polygons';
import { resolveStage } from '../resolve';
import { withinBuffer } from '../inPolygon';
import gridData from '../../../data/grid.sample.json';

test('grid.sample.json stages agree with the live loader (polygon, buffer, centroid)', () => {
  const live = loadStages();
  const embedded = gridData.stages;
  assert.equal(embedded.length, live.length);
  for (const s of live) {
    const e = embedded.find((x) => x.id === s.id);
    assert.ok(e, `${s.id} missing from grid.sample.json`);
    assert.equal(e!.bufferMeters, s.bufferMeters, `${s.id} buffer drift`);
    assert.deepEqual(e!.polygon, s.polygon, `${s.id} polygon drift`);
    assert.ok(Math.abs(e!.centroid[0] - s.centroid[0]) < 1e-6, `${s.id} centroid lat drift`);
    assert.ok(Math.abs(e!.centroid[1] - s.centroid[1]) < 1e-6, `${s.id} centroid lng drift`);
  }
});

test('no stage centroid falls inside another stage (buffered) — meadows are unambiguous', () => {
  const stages = loadStages();
  for (const a of stages) {
    const c = { lat: a.centroid[0], lng: a.centroid[1] };
    for (const b of stages) {
      if (a.id === b.id) continue;
      assert.equal(
        withinBuffer(c, b.polygon, b.bufferMeters),
        false,
        `${a.id} centroid must not fall inside ${b.id}`,
      );
    }
    // and therefore resolves to itself
    assert.equal(resolveStage(c, stages), a.id);
  }
});
