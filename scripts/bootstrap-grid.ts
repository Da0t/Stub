// One-shot, server-only JamBase -> offline Grid -> Convex bootstrap.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  enrichArtist,
  fetchGrid,
  findFestival,
  nextTourDate,
  type ArtistMeta,
  type RawJamBaseEvent,
} from "@/lib/grid/jambase";
import { toGrid } from "@/lib/grid/normalize";
import type { Grid, Stage } from "@/lib/types";

const ROOT = process.cwd();
const RAW_PATH = join(ROOT, "data", "jambase.raw.json");
const PULL_PATH = join(ROOT, "data", "jambase.raw.pull.json");
const ENRICHMENT_PATH = join(ROOT, "data", "jambase.enrichment.json");
const GRID_PATH = join(ROOT, "data", "grid.sample.json");

interface BootstrapInput {
  stages: Stage[];
  artistMeta: Record<string, ArtistMeta>;
  events: RawJamBaseEvent[];
}

export function readOfflineInput(): BootstrapInput {
  return JSON.parse(readFileSync(RAW_PATH, "utf8")) as BootstrapInput;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Dumps raw performer rows first, then resumes a disk-backed enrichment cache. */
export async function pullFromJamBase(stages: Stage[]): Promise<BootstrapInput> {
  const { festivalId } = await findFestival("Outside Lands", 2026);
  const events = await fetchGrid(festivalId, 2026);
  writeFileSync(PULL_PATH, JSON.stringify(events, null, 2) + "\n");

  const artistMeta: Record<string, ArtistMeta> = existsSync(ENRICHMENT_PATH)
    ? JSON.parse(readFileSync(ENRICHMENT_PATH, "utf8")) as Record<string, ArtistMeta>
    : {};
  const ids = [...new Set(events.map((event) => event.jambaseArtistId).filter((id): id is string => !!id))];
  const headlinerIds = events.filter((event) => event.isHeadliner).map((event) => event.jambaseArtistId);
  ids.sort((a, b) => Number(headlinerIds.includes(b)) - Number(headlinerIds.includes(a)));
  for (const id of ids) {
    if (artistMeta[id]) continue;
    try {
      const enriched = await enrichArtist(id);
      try {
        enriched.nextTourDate = await nextTourDate(id);
      } catch (error) {
        // Spotify/genre enrichment is still valuable if the tour endpoint is
        // temporarily unavailable. Persist that success and leave the date null.
        console.warn(`nextTourDate(${id}) failed; leaving it null:`, error);
      }
      artistMeta[id] = enriched;
      writeFileSync(ENRICHMENT_PATH, JSON.stringify(artistMeta, null, 2) + "\n");
    } catch (error) {
      console.warn(`enrichArtist(${id}) failed; cached successes remain usable:`, error);
    }
    await sleep(250);
  }
  return { stages, artistMeta, events };
}

export function toBootstrapPayload(grid: Grid, provenance: string) {
  if (!grid.stages.length) throw new Error("Refusing to bootstrap a grid with no stages");
  if (!grid.sets.length) {
    throw new Error("Refusing to bootstrap a grid with no set windows. Supply published or synthesized stage/time inputs with provenance first.");
  }
  const stages = new Set(grid.stages.map((stage) => stage.id));
  const naturalKeys = new Set<string>();
  for (const set of grid.sets) {
    if (!stages.has(set.stageId)) throw new Error(`Set ${set.id} references unknown stage ${set.stageId}`);
    if (!Number.isFinite(set.startTime) || !Number.isFinite(set.endTime) || set.endTime <= set.startTime) {
      throw new Error(`Set ${set.id} has an invalid time window`);
    }
    const naturalKey = `${set.stageId}|${set.startTime}`;
    if (naturalKeys.has(naturalKey)) {
      throw new Error(`Duplicate set window for stage/start: ${naturalKey}`);
    }
    naturalKeys.add(naturalKey);
  }
  return {
    event: {
      jambaseFestivalId: grid.festivalId,
      name: grid.eventName,
      themePack: "outside-lands-2026",
      startDate: Math.min(...grid.sets.map((set) => set.startTime)),
      endDate: Math.max(...grid.sets.map((set) => set.endTime)),
      timezone: grid.timezone,
    },
    stages: grid.stages,
    sets: grid.sets.map((set) => ({
      sourceId: set.id, stageId: set.stageId, artistName: set.artistName,
      jambaseArtistId: set.jambaseArtistId ?? undefined,
      spotifyId: set.spotifyId ?? undefined,
      startTime: set.startTime, endTime: set.endTime, slotIndex: set.slotIndex,
      isHeadliner: set.isHeadliner, estimatedAudience: set.estimatedAudience ?? undefined,
      isFestivalDebut: set.isFestivalDebut, isFinalShow: set.isFinalShow,
      genreTags: set.genreTags, nextTourDate: set.nextTourDate ?? undefined,
    })),
    provenance,
  };
}

export async function writeToConvex(grid: Grid, provenance: string): Promise<void> {
  const url = process.env.CONVEX_URL;
  if (!url) {
    console.log("- Convex write skipped (CONVEX_URL unset); offline grid was still written.");
    return;
  }
  const client = new ConvexHttpClient(url);
  const bootstrap = makeFunctionReference<"mutation">("grid:bootstrap");
  const result = await client.mutation(bootstrap, toBootstrapPayload(grid, provenance));
  console.log(`✓ Convex bootstrap: ${result.stageCount} stages / ${result.setCount} sets.`);
}

async function main() {
  const offline = readOfflineInput();
  const live = !!process.env.JAMBASE_API_KEY;
  const input = live ? await pullFromJamBase(offline.stages) : offline;
  if (!live) console.log("- No JAMBASE_API_KEY; rebuilding from committed raw snapshot.");
  const grid = toGrid(input.events, input.stages, input.artistMeta);
  writeFileSync(GRID_PATH, JSON.stringify(grid, null, 2) + "\n");
  console.log(`✓ wrote ${grid.sets.length} sets / ${grid.stages.length} stages to data/grid.sample.json.`);
  const provenance = live
    ? "JamBase lineup/day fields; stage/time fields published separately or explicitly synthesized"
    : "Committed snapshot; inspect RawJamBaseEvent._provenance before claiming schedule accuracy";
  await writeToConvex(grid, provenance);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error("bootstrap-grid failed:", error); process.exitCode = 1; });
}
