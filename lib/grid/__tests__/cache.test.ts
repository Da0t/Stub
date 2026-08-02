import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { loadStages } from "@/lib/geo/polygons";
import type { Grid } from "@/lib/types";

const db = vi.hoisted(() => ({ loadGrid: vi.fn(), saveGrid: vi.fn() }));
vi.mock("@/lib/offline/db", () => db);

import { ensureGrid, resetGridCache } from "../cache";

beforeEach(() => {
  resetGridCache();
  db.loadGrid.mockReset();
  db.saveGrid.mockReset();
});

test("ensureGrid is offline, fast, and canonicalizes stale IndexedDB geometry", async () => {
  const staleGeometry: Grid = {
    festivalId: "stored",
    eventName: "Stored",
    timezone: "America/Los_Angeles",
    fetchedAt: Number.MAX_SAFE_INTEGER,
    stages: [{ ...loadStages()[0], polygon: [[0, 0]] }],
    sets: [],
  };
  db.loadGrid.mockResolvedValue(staleGeometry);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const started = performance.now();
  const grid = await ensureGrid();
  const elapsed = performance.now() - started;

  assert.equal(grid.festivalId, "stored");
  assert.deepEqual(grid.stages, loadStages());
  assert.ok(elapsed < 50, `cold offline load took ${elapsed.toFixed(1)}ms`);
  assert.equal(fetchSpy.mock.calls.length, 0);
  fetchSpy.mockRestore();
});

test("ensureGrid falls back to the bundled cache before a slow IndexedDB read", async () => {
  db.loadGrid.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 100)));
  const started = performance.now();
  const grid = await ensureGrid();
  const elapsed = performance.now() - started;

  assert.equal(grid.stages.length, 5);
  assert.deepEqual(grid.stages, loadStages());
  assert.ok(elapsed < 50, `offline fallback took ${elapsed.toFixed(1)}ms`);
});
