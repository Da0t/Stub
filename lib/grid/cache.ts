// lib/grid/cache.ts
//
// Path 3 — client-side grid load/refresh + staleness.
//
// The one thing that makes offline resolution possible: the grid is cached
// WHOLE. This module is the client's only door to it. It NEVER imports
// lib/grid/jambase.ts — after bootstrap there are zero JamBase calls (acceptance
// criterion 7), and pulling that module in would risk bundling the API key into
// the client. The client reads the cached grid; the API is a bootstrap concern.
//
// Sources, in priority order:
//   1. in-memory (module singleton) — the hot path, ~0ms
//   2. IndexedDB via path 1's loadGrid() — offline, target < 50ms
//   3. the whole grid bundled with the app (data/grid.sample.json) — the seed
//
// Staleness is handled without the network: we keep whichever copy has the
// newer `fetchedAt`. A new app release ships a newer bundled grid; the first
// ensureGrid() after that release notices bundled.fetchedAt > stored.fetchedAt
// and re-seeds IndexedDB. There is nothing else to "refresh" against on the
// client — that is the whole point of caching the grid whole.

import { loadGrid, saveGrid } from "@/lib/offline/db";
import type { Grid } from "@/lib/types";
import gridSample from "@/data/grid.sample.json";

// The committed pull. Cast once, here, at the trust boundary.
const BUNDLED_GRID = gridSample as unknown as Grid;

let mem: Grid | null = null;

/** IndexedDB read that degrades to null on the server or when unavailable. */
async function safeLoadGrid(): Promise<Grid | null> {
  try {
    return await loadGrid();
  } catch {
    // Server render, private mode, or no IndexedDB — fall back to the bundle.
    return null;
  }
}

/** Best-effort cache seed; never blocks a render and never throws upward. */
async function safeSaveGrid(grid: Grid): Promise<void> {
  try {
    await saveGrid(grid);
  } catch {
    /* offline cache is best-effort; the in-memory + bundled copies still work */
  }
}

/**
 * Return the grid, IndexedDB-first, network never. Seeds/refreshes the cache
 * from the bundled grid when that copy is newer. Safe to call repeatedly and
 * concurrently; after the first call it is served from memory.
 */
export async function ensureGrid(): Promise<Grid> {
  if (mem) return mem;

  const stored = await safeLoadGrid();
  const useBundled = !stored || BUNDLED_GRID.fetchedAt > stored.fetchedAt;
  const chosen = useBundled ? BUNDLED_GRID : stored;

  if (useBundled) {
    void safeSaveGrid(BUNDLED_GRID); // seed IndexedDB for the next cold start
  }

  mem = chosen;
  return chosen;
}

/**
 * In-memory grid for hot paths (resolution loops, render). Returns null until
 * ensureGrid() has run once — callers on the hot path should have awaited that
 * at app boot.
 */
export function getGridSync(): Grid | null {
  return mem;
}

/** Test/boot hook: drop the in-memory copy so the next ensureGrid() re-reads. */
export function resetGridCache(): void {
  mem = null;
}
