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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to link a deployment first.",
  );
}
const client = new ConvexHttpClient(CONVEX_URL);

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

function buildFallbackGrid(): Grid {
  // Approximate Golden Gate Park coordinates, small placeholder polygons.
  // Fictional artist names on purpose — this is scaffolding, not a claim
  // about the real 2026 lineup (path 3 owns that fact).
  const stageNames = ["Lands End", "Twin Peaks", "Sutro", "SOMA", "Duboce Triangle"];
  const baseLat = 37.7694;
  const baseLng = -122.4862;

  const stages: Stage[] = stageNames.map((name, i) => {
    const lat = baseLat + i * 0.0015;
    const lng = baseLng + (i % 2 === 0 ? 0.001 : -0.001) * i;
    return {
      id: `fixture-stage-${i}`,
      name,
      polygon: [
        [lat - 0.0006, lng - 0.0006],
        [lat - 0.0006, lng + 0.0006],
        [lat + 0.0006, lng + 0.0006],
        [lat + 0.0006, lng - 0.0006],
      ],
      bufferMeters: name === "Duboce Triangle" ? 45 : 25,
      centroid: [lat, lng],
    };
  });

  const dayStarts = [
    Date.UTC(2026, 7, 7, 19), // Fri Aug 7, noon PT bootstrap; 19:00 UTC = 12:00 PT
    Date.UTC(2026, 7, 8, 19),
    Date.UTC(2026, 7, 9, 19),
  ];
  const artistFirstNames = [
    "Fixture",
    "Placeholder",
    "Synth",
    "Stand-in",
    "Draft",
    "Sample",
    "Working",
    "Interim",
    "Proxy",
    "Sketch",
    "Prelim",
    "Mock",
  ];

  const sets: SetRecord[] = [];
  let slotCursor: Record<string, number> = {};
  let artistIdx = 0;
  for (const dayStart of dayStarts) {
    for (let hourOffset = 0; hourOffset <= 9; hourOffset += 1.5) {
      for (const stage of stages) {
        const startTime = dayStart + hourOffset * 60 * 60 * 1000;
        const durationMin = 75;
        const slotIndex = slotCursor[stage.id] ?? 0;
        slotCursor[stage.id] = slotIndex + 1;
        sets.push({
          id: `fixture-set-${sets.length}`,
          stageId: stage.id,
          artistName: `${artistFirstNames[artistIdx % artistFirstNames.length]} Artist ${artistIdx}`,
          startTime,
          endTime: startTime + durationMin * 60 * 1000,
          slotIndex,
          isHeadliner: hourOffset >= 7.5,
          estimatedAudience: 5000 + artistIdx * 137,
          isFestivalDebut: artistIdx % 5 === 0,
          isFinalShow: false,
          genreTags: ["indie"],
          jambaseArtistId: null,
          spotifyId: null,
          nextTourDate: null,
        });
        artistIdx += 1;
      }
    }
  }

  return {
    festivalId: "fixture-outside-lands-2026",
    eventName: "Outside Lands 2026 (dev fixture)",
    timezone: "America/Los_Angeles",
    fetchedAt: Date.now(),
    stages,
    sets,
  };
}

// ---------------------------------------------------------------------------
// Seed plan: pick which sets the demo user "attended", satisfying the spec.
// ---------------------------------------------------------------------------

interface AttendedSet {
  set: SetRecord;
  stage: Stage;
  dwellSeconds: number;
  gapAt?: "middle"; // this run gets a >5min gap inserted
}

interface SeedPlan {
  attended: AttendedSet[];
  fridayNightSkipSetId: string;
  priorArtistNames: string[]; // 7 of the 11 attended artists, minted in a prior event
}

function buildSeedPlan(grid: Grid): SeedPlan {
  const sets = [...grid.sets].sort((a, b) => a.startTime - b.startTime);
  const stageById = new Map(grid.stages.map((s) => [s.id, s]));

  // Group by festival-local day.
  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: grid.timezone, dateStyle: "short" });
  const byDay = new Map<string, SetRecord[]>();
  for (const s of sets) {
    const key = dayFmt.format(new Date(s.startTime));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const days = [...byDay.keys()].slice(0, 3);

  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: grid.timezone,
    hour: "numeric",
    hour12: false,
  });
  const localHour = (ts: number) => Number(hourFmt.format(new Date(ts)));
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: grid.timezone, weekday: "short" });
  const localWeekday = (ts: number) => weekdayFmt.format(new Date(ts));

  // Pick 11 sets, night-weighted, spread across stages: for each day, take
  // an even split from that day's target count, walking stages in rotation
  // (round-robin) so consecutive picks vary rather than clustering on one
  // stage. Evening sets preferred per-day when there are enough of them.
  const TARGET_TOTAL = 11;
  const chosen: SetRecord[] = [];
  for (let d = 0; d < days.length; d++) {
    const daySets = byDay.get(days[d])!;
    const evening = daySets.filter((s) => localHour(s.startTime) >= 18);
    const pool = (evening.length >= 3 ? evening : daySets).slice().sort((a, b) => a.startTime - b.startTime);

    const remainingDays = days.length - d;
    const target = Math.min(pool.length, Math.ceil((TARGET_TOTAL - chosen.length) / remainingDays));

    const byStage = new Map<string, SetRecord[]>();
    for (const s of pool) {
      const key = s.stageId;
      if (!byStage.get(key)) byStage.set(key, []);
      byStage.get(key)!.push(s);
    }
    const stageKeys = [...byStage.keys()];
    let stageCursor = 0;
    let picked = 0;
    while (picked < target && stageKeys.length > 0) {
      const key = stageKeys[stageCursor % stageKeys.length];
      const bucket = byStage.get(key)!;
      if (bucket.length > 0) {
        chosen.push(bucket.shift()!);
        picked++;
      }
      stageCursor++;
      if (stageCursor > stageKeys.length * pool.length) break; // pool exhausted
    }
  }
  const attendedSets = chosen.slice(0, TARGET_TOTAL);

  // Ensure >= 4 distinct stages: if the round-robin above landed on fewer,
  // swap in sets from missing stages.
  let distinctStages = new Set(attendedSets.map((s) => stageById.get(s.stageId)?.name));
  if (distinctStages.size < 4) {
    for (const s of sets) {
      if (distinctStages.size >= 4) break;
      const name = stageById.get(s.stageId)?.name;
      if (name && !distinctStages.has(name) && !attendedSets.includes(s)) {
        attendedSets[attendedSets.length - 1] = s;
        distinctStages = new Set(attendedSets.map((x) => stageById.get(x.stageId)?.name));
      }
    }
  }

  // Friday-night set with the most concurrent overlaps, for the opportunity
  // cost headline. Falls back to "most overlaps of any attended set" if the
  // grid has no Friday data (e.g. a partial real pull).
  const overlapCount = (s: SetRecord) =>
    sets.filter((o) => o.id !== s.id && o.startTime < s.endTime && o.endTime > s.startTime).length;

  const fridayNightCandidates = attendedSets.filter(
    (s) => localWeekday(s.startTime) === "Fri" && localHour(s.startTime) >= 19,
  );
  const skipCandidatePool = fridayNightCandidates.length > 0 ? fridayNightCandidates : attendedSets;
  const fridayNightSkipSet = skipCandidatePool.reduce((best, s) =>
    overlapCount(s) > overlapCount(best) ? s : best,
  );
  if (overlapCount(fridayNightSkipSet) < 3) {
    console.warn(
      `Best available "concurrent sets skipped" set only has ${overlapCount(fridayNightSkipSet)} ` +
        `overlapping sets (spec wants >= 3). The provided grid may be too sparse on Friday night.`,
    );
  }

  // Dwell per attended set: mostly clean, one deliberately uneven (README:
  // "perfectly clean data looks fake"), one with the 47-minute headline,
  // one carrying the >5min gap.
  const attended: AttendedSet[] = attendedSets.map((set, i) => {
    const durationSec = (set.endTime - set.startTime) / 1000;
    let dwellSeconds: number;
    if (set.id === fridayNightSkipSet.id) {
      dwellSeconds = Math.min(durationSec, 47 * 60); // the headline stay
    } else if (i === 1) {
      dwellSeconds = Math.round(durationSec * 0.72); // left 8ish minutes early
    } else if (i === 4) {
      dwellSeconds = Math.round(durationSec * 0.55); // gap set, see below
    } else {
      dwellSeconds = Math.round(durationSec * (0.85 + (i % 3) * 0.05)); // uneven, not exactly clean
    }
    return {
      set,
      stage: stageById.get(set.stageId)!,
      dwellSeconds: Math.min(dwellSeconds, durationSec),
      gapAt: i === 4 ? "middle" : undefined,
    };
  });

  // Discovery: 4 artists with no prior card. The other 7 get a card minted
  // in a synthetic prior event below.
  const priorArtistNames = attended.slice(4).map((a) => a.set.artistName);

  return { attended, fridayNightSkipSetId: fridayNightSkipSet.id, priorArtistNames };
}

function logPlanSummary(plan: SeedPlan) {
  console.log(`Attending ${plan.attended.length} sets:`);
  for (const a of plan.attended) {
    console.log(
      `  - ${a.set.artistName} @ ${a.stage.name} (${Math.round(a.dwellSeconds / 60)} min` +
        `${a.set.id === plan.fridayNightSkipSetId ? ", opportunity-cost headline" : ""}` +
        `${a.gapAt ? ", has a >5min gap" : ""})`,
    );
  }
  console.log(`Discoveries (no prior card): ${plan.attended.length - plan.priorArtistNames.length}`);
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
    await client.mutation(api.mint.claim, {
      userId,
      setId: setIds[i],
      photoClientId: `prior-photo-${i}`,
      frameVariant: FRAME_VARIANTS[i % FRAME_VARIANTS.length],
    });
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
