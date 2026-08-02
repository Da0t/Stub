#!/usr/bin/env -S npx tsx
/**
 * scripts/seed-demo.ts — the synthetic three-day weekend (README "The demo
 * seed — treat this as a feature, not a fixture").
 *
 * Data-driven, not hardcoded: it seeds against `data/grid.sample.json` if
 * path 3 has published it (the real Outside Lands 2026 lineup — "run the
 * seed against the real grid, not fabricated sets"), and otherwise falls
 * back to a small, clearly-fictional dev grid so the script is runnable and
 * testable today. Swap in the real file and re-run; nothing else changes.
 *
 * Idempotent: safe to run repeatedly (README — "you will run it fifteen
 * times"). Re-running clears this demo user's prior seeded rows and
 * regenerates them from scratch rather than accumulating duplicates.
 *
 * Requires a linked Convex deployment: NEXT_PUBLIC_CONVEX_URL (or
 * CONVEX_URL) must point at it. Run `npx convex dev` first.
 *
 * Usage: npm run seed
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { FrameVariant, Grid, SetRecord, Stage } from "../lib/types";
import { buildFallbackGrid, buildSeedPlan, logPlanSummary, type AttendedSet, type SeedPlan } from "./seed-plan";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Assigned in main(), not at module load — this file is imported by tests
// (for buildSeedPlan/buildFallbackGrid, which need neither) and must not
// require a deployment URL or open a network client just to be imported.
let client: ConvexHttpClient;

const DEMO_DEVICE_ID = "demo-seed-weekend-2026";
const PRIOR_DEVICE_ID = DEMO_DEVICE_ID; // same user; a separate prior event establishes discoveryRate
const FRAME_VARIANTS: FrameVariant[] = [
  "ranger_badge",
  "trail_marker",
  "fog_layer",
  "disco_bison",
  "field_notes",
];

// 1x1 pixel PNG — placeholder photo face. README: "Grab 12-15 usable
// concert-ish images so the strip is not grey rectangles. This matters more
// than any query optimisation you will do today" — that's a path 1/path 7
// asset-sourcing task, not something this script can fabricate honestly.
// Drop real JPEGs in scripts/seed-assets/*.jpg before the 6PM demo; until
// then every seeded photo uses this same placeholder pixel so the pipeline
// (storage, cards, strip render) is fully exercised end to end today.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main() {
  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!CONVEX_URL) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to link a deployment first.",
    );
  }
  client = new ConvexHttpClient(CONVEX_URL);

  console.log(`Seeding against ${CONVEX_URL}`);

  const { grid, eventId } = await loadOrSeedGrid();
  console.log(`Grid: ${grid.eventName}, ${grid.stages.length} stages, ${grid.sets.length} sets`);

  const userId = await client.mutation(api.users.ensure, {
    deviceId: DEMO_DEVICE_ID,
    displayName: "Demo Weekend",
  });

  const plan = buildSeedPlan(grid);
  logPlanSummary(plan);

  // Prior event establishes "already in the collection" so discoveryRate
  // is genuinely partial (4 of 11 artists as discoveries), not just 100%
  // by construction of a first-ever event.
  await seedPriorCollection(userId, plan.priorArtistNames);

  await seedWeekend(userId, eventId, grid, plan);

  console.log(`Seed complete. Demo user: ${userId} (deviceId=${DEMO_DEVICE_ID})`);
}

// ---------------------------------------------------------------------------
// Grid: real (path 3) if present, else a small fictional fallback.
// ---------------------------------------------------------------------------

async function loadOrSeedGrid(): Promise<{ grid: Grid; eventId: Id<"events"> }> {
  const samplePath = path.resolve(__dirname, "../data/grid.sample.json");
  const grid: Grid = existsSync(samplePath)
    ? JSON.parse(readFileSync(samplePath, "utf-8"))
    : buildFallbackGrid();

  if (!existsSync(samplePath)) {
    console.warn(
      "data/grid.sample.json not found — seeding against a fictional dev-only grid. " +
        "This is NOT the real 2026 lineup; do not use it for the actual demo. " +
        "Once path 3 publishes the real file, re-run this script and it takes over automatically.",
    );
  }

  // Idempotent upsert regardless of source — safe even if path 3's own
  // bootstrap-grid.ts already ran; same rows come back.
  const eventId = await client.mutation(api.grid.upsertEvent, {
    jambaseFestivalId: grid.festivalId,
    name: grid.eventName,
    themePack: "outside-lands-2026",
    startDate: Math.min(...grid.sets.map((s) => s.startTime)),
    endDate: Math.max(...grid.sets.map((s) => s.endTime)),
    timezone: grid.timezone,
  });

  const stageIds = await client.mutation(api.grid.upsertStages, {
    eventId,
    stages: grid.stages.map((s) => ({
      name: s.name,
      polygon: s.polygon,
      bufferMeters: s.bufferMeters,
      centroid: s.centroid,
      jambaseStageRef: undefined,
    })),
  });
  const stageIdByName = new Map(grid.stages.map((s, i) => [s.name, stageIds[i]]));

  const setInputs = grid.sets.map((s) => {
    const stage = grid.stages.find((st) => st.id === s.stageId);
    const convexStageId = stageIdByName.get(stage?.name ?? "");
    if (!convexStageId) throw new Error(`No Convex stage id for set on stage ${s.stageId}`);
    return {
      stageId: convexStageId,
      artistName: s.artistName,
      jambaseArtistId: s.jambaseArtistId ?? undefined,
      spotifyId: s.spotifyId ?? undefined,
      startTime: s.startTime,
      endTime: s.endTime,
      slotIndex: s.slotIndex,
      isHeadliner: s.isHeadliner,
      estimatedAudience: s.estimatedAudience ?? undefined,
      isFestivalDebut: s.isFestivalDebut,
      isFinalShow: s.isFinalShow,
      genreTags: s.genreTags,
      nextTourDate: s.nextTourDate ?? undefined,
    };
  });
  const setIds = await client.mutation(api.grid.upsertSets, { eventId, sets: setInputs });

  // Re-key the returned Grid's ids to the real Convex ids we just got back,
  // so the rest of this script (and everything downstream) works entirely
  // in terms of real _ids rather than the source file's own id scheme.
  const stages: Stage[] = grid.stages.map((s) => ({ ...s, id: stageIdByName.get(s.name)! }));
  const sets: SetRecord[] = grid.sets.map((s, i) => {
    const stage = grid.stages.find((st) => st.id === s.stageId);
    return { ...s, id: setIds[i], stageId: stageIdByName.get(stage?.name ?? "")! };
  });

  return { grid: { ...grid, stages, sets }, eventId };
}

// ---------------------------------------------------------------------------
// Write: prior collection, then the weekend itself.
// ---------------------------------------------------------------------------

async function seedPriorCollection(userId: Id<"users">, artistNames: string[]) {
  if (artistNames.length === 0) return;

  // A small synthetic "past festival" purely so these artists already have
  // a card before this weekend. Its own details are fictional scaffolding
  // (it never appears in the Wrapped) — only the artist names need to
  // match this weekend's real lineup, which the caller already guaranteed.
  const priorEventId = await client.mutation(api.grid.upsertEvent, {
    jambaseFestivalId: "fixture-demo-prior-festival",
    name: "Demo Prior Festival",
    themePack: "generic",
    startDate: Date.UTC(2026, 4, 1),
    endDate: Date.UTC(2026, 4, 3),
    timezone: "America/Los_Angeles",
  });
  const [stageId] = await client.mutation(api.grid.upsertStages, {
    eventId: priorEventId,
    stages: [
      {
        name: "Prior Stage",
        polygon: [
          [37.7749, -122.4194],
          [37.7749, -122.419],
          [37.7753, -122.419],
          [37.7753, -122.4194],
        ],
        bufferMeters: 25,
        centroid: [37.7751, -122.4192],
      },
    ],
  });

  const setInputs = artistNames.map((artistName, i) => ({
    stageId,
    artistName,
    startTime: Date.UTC(2026, 4, 1, 20 + i),
    endTime: Date.UTC(2026, 4, 1, 21 + i),
    slotIndex: i,
    isHeadliner: false,
    isFestivalDebut: false,
    isFinalShow: false,
    genreTags: [],
  }));
  const setIds = await client.mutation(api.grid.upsertSets, { eventId: priorEventId, sets: setInputs });

  // A card needs real dwell, not just a photo: mint.claim re-verifies
  // eligibility server-side (checkEligibility requires dwellSeconds >= the
  // mint threshold), so each prior set needs enough dwell samples inside
  // its window to produce a qualifying dwellRun, or every claim below is
  // rightly rejected as LOCKED.
  const sampleUploads: { clientId: string; timestamp: number; lat: number; lng: number; accuracy: number | null }[] = [];
  for (let i = 0; i < setIds.length; i++) {
    const storageId = await uploadPlaceholderPhoto();
    await client.mutation(api.ingest.photos, {
      userId,
      eventId: priorEventId,
      photos: [
        {
          clientId: `prior-photo-${i}`,
          timestamp: Date.UTC(2026, 4, 1, 20 + i, 10),
          lat: 37.7751,
          lng: -122.4192,
          storageId,
        },
      ],
    });

    // ~7 minutes of samples starting 5 minutes into the set, at 90s
    // spacing — comfortably past the 5-minute mint threshold.
    for (let m = 5; m <= 12; m += 1.5) {
      sampleUploads.push({
        clientId: `prior-sample-${i}-${m}`,
        timestamp: Date.UTC(2026, 4, 1, 20 + i, m),
        lat: jitter(37.7751),
        lng: jitter(-122.4192),
        accuracy: 10,
      });
    }
  }
  await client.mutation(api.ingest.samples, { userId, eventId: priorEventId, samples: sampleUploads });

  // Let the scheduled resolution pass materialise dwellRuns before minting.
  await sleep(3000);

  for (let i = 0; i < setIds.length; i++) {
    try {
      await client.mutation(api.mint.claim, {
        userId,
        setId: setIds[i],
        photoClientId: `prior-photo-${i}`,
        frameVariant: FRAME_VARIANTS[i % FRAME_VARIANTS.length],
      });
    } catch (err) {
      console.warn(`Could not mint prior card for ${artistNames[i]}: ${(err as Error).message}`);
    }
  }
}

async function seedWeekend(userId: Id<"users">, eventId: Id<"events">, grid: Grid, plan: SeedPlan) {
  let photoIndex = 0;
  let sampleIndex = 0;
  const photoUploads: { clientId: string; timestamp: number; lat: number; lng: number; storageId: Id<"_storage"> }[] = [];
  const sampleUploads: { clientId: string; timestamp: number; lat: number; lng: number; accuracy: number | null }[] = [];
  const firstPhotoClientIdBySet = new Map<AttendedSet, string>();

  for (const a of plan.attended) {
    const [lat, lng] = a.stage.centroid;

    // Dwell samples at 60-90s spacing across the actual dwell window.
    const start = a.set.startTime;
    const end = start + a.dwellSeconds * 1000;
    let t = start;
    let firstHalf = true;
    while (t < end) {
      // The one run that carries the >5 minute gap: skip a chunk of the
      // middle rather than interpolate — "if the phone slept, we don't
      // interpolate" is path 5's rule, but the seed has to actually leave
      // the hole for that rule to have something to prove.
      if (a.gapAt === "middle" && firstHalf && t > start + (end - start) / 2) {
        t += 12 * 60 * 1000; // 12 minute gap
        firstHalf = false;
      }
      sampleUploads.push({
        clientId: `sample-${sampleIndex++}`,
        timestamp: t,
        lat: jitter(lat),
        lng: jitter(lng),
        accuracy: 8 + Math.round(Math.random() * 15),
      });
      t += (60 + Math.round(Math.random() * 30)) * 1000; // 60-90s
    }

    // ~49 photos total across 11 sets ≈ 4-5 per set, ~88% people / 12% stage.
    const photosThisSet = 4 + (photoIndex % 2);
    for (let i = 0; i < photosThisSet; i++) {
      const ts = start + Math.round(((i + 1) / (photosThisSet + 1)) * a.dwellSeconds * 1000);
      const clientId = `photo-${photoIndex}`;
      if (i === 0) firstPhotoClientIdBySet.set(a, clientId);
      photoUploads.push({
        clientId,
        timestamp: ts,
        lat: jitter(lat),
        lng: jitter(lng),
        storageId: await uploadPlaceholderPhoto(),
      });
      photoIndex += 1;
    }
  }

  // Ingest in batches through the real mutations — exercises idempotent
  // ingest and the resolution pass exactly as the live app would.
  for (const batch of chunk(photoUploads, 25)) {
    await client.mutation(api.ingest.photos, { userId, eventId, photos: batch });
  }
  for (const batch of chunk(sampleUploads, 50)) {
    await client.mutation(api.ingest.samples, { userId, eventId, samples: batch });
  }

  console.log(`Ingested ${photoUploads.length} photos, ${sampleUploads.length} dwell samples.`);
  console.log(
    "Resolution + dwellRuns run server-side (scheduled from ingest) — give it a few seconds, " +
      "then mint cards for the attended sets to populate the shelf.",
  );

  // Give the scheduled resolution pass a moment before minting, since
  // mint.claim checks dwellRuns/resolved photos that pass writes.
  await sleep(3000);

  for (let i = 0; i < plan.attended.length; i++) {
    const a = plan.attended[i];
    const clientId = firstPhotoClientIdBySet.get(a);
    if (!clientId) continue; // no photo landed for this set; nothing to mint against
    try {
      await client.mutation(api.mint.claim, {
        userId,
        setId: a.set.id as Id<"sets">,
        photoClientId: clientId,
        frameVariant: FRAME_VARIANTS[i % FRAME_VARIANTS.length],
      });
    } catch (err) {
      console.warn(`Could not mint ${a.set.artistName}: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function uploadPlaceholderPhoto(): Promise<Id<"_storage">> {
  const uploadUrl = await client.mutation(api.ingest.generateUploadUrl, {});
  const bytes = Buffer.from(PLACEHOLDER_PNG_BASE64, "base64");
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

function jitter(value: number): number {
  return value + (Math.random() - 0.5) * 0.0002; // a few metres of GPS noise
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only run when executed directly (`npm run seed`), not when imported —
// buildSeedPlan/buildFallbackGrid are imported by scripts/__tests__ without
// wanting main()'s network I/O to fire.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
