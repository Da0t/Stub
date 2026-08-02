import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Tables + indexes per README "Data model" and docs/CONTRACTS.md §8.
// Two indexes are additions beyond what's listed there — flagged inline —
// because idempotent ingest is unusable without them (a table scan per
// batch). Additions are allowed; the frozen surface is table names/columns
// and the four indexes the README calls out explicitly.

const latLng = v.array(v.float64()); // [lat, lng] — CONTRACTS' PolyPoint tuple

export default defineSchema({
  users: defineTable({
    deviceId: v.string(),
    createdAt: v.number(),
    displayName: v.optional(v.string()),
  }).index("by_deviceId", ["deviceId"]),

  events: defineTable({
    jambaseFestivalId: v.string(),
    name: v.string(),
    themePack: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    timezone: v.string(),
  })
    .index("by_jambaseFestivalId", ["jambaseFestivalId"])
    // Addition: lets eventCompletion.scanEndedEvents find ended events
    // without a table scan.
    .index("by_endDate", ["endDate"]),

  stages: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    polygon: v.array(latLng),
    bufferMeters: v.number(),
    centroid: latLng,
    jambaseStageRef: v.optional(v.string()),
  }).index("by_eventId", ["eventId"]),

  sets: defineTable({
    eventId: v.id("events"),
    stageId: v.id("stages"),
    artistName: v.string(),
    jambaseArtistId: v.optional(v.string()),
    spotifyId: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    slotIndex: v.number(),
    isHeadliner: v.boolean(),
    estimatedAudience: v.optional(v.number()),
    isFestivalDebut: v.boolean(),
    isFinalShow: v.boolean(),
    genreTags: v.array(v.string()),
    nextTourDate: v.optional(
      v.object({ date: v.number(), venue: v.string(), city: v.string() }),
    ),
  })
    // Prefix-queryable: (eventId), (eventId, stageId), or the full triple —
    // "the grid lookup" per README.
    .index("by_eventId_stageId_startTime", ["eventId", "stageId", "startTime"]),

  photos: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    clientId: v.string(),
    timestamp: v.number(),
    lat: v.number(),
    lng: v.number(),
    blobRef: v.id("_storage"),
    // Absent = not yet resolved. Explicit null = resolved, no stage/set —
    // "in transit, at Wine Lands, at a food vendor" (CONTRACTS.md). The
    // distinction matters: without it, a photo that resolves to "no stage"
    // would look unresolved forever and get reprocessed every pass.
    resolvedStageId: v.optional(v.union(v.id("stages"), v.null())),
    resolvedSetId: v.optional(v.union(v.id("sets"), v.null())),
    visionSubject: v.optional(
      v.union(v.literal("stage"), v.literal("people"), v.literal("food"), v.literal("scenery")),
    ),
    visionQualityScore: v.optional(v.number()),
    isBestFrame: v.optional(v.boolean()),
  })
    .index("by_userId_timestamp", ["userId", "timestamp"]) // resolution scan
    // Addition: idempotent ingest needs this or every batch is a table scan.
    .index("by_userId_clientId", ["userId", "clientId"])
    // Addition: eventCompletion.scanEndedEvents discovers participants per
    // event without scanning every photo.
    .index("by_eventId_userId", ["eventId", "userId"]),

  dwellSamples: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    clientId: v.string(),
    timestamp: v.number(),
    lat: v.number(),
    lng: v.number(),
    // Addition beyond the README's table listing: CONTRACTS.md §2's
    // DwellSample carries it, and it's cheap insurance for the resolver
    // (a low-accuracy fix is a candidate to widen a buffer or drop later).
    accuracy: v.optional(v.number()),
    resolvedStageId: v.optional(v.union(v.id("stages"), v.null())),
  })
    .index("by_userId_timestamp", ["userId", "timestamp"]) // run grouping
    // Addition: same idempotency reason as photos.
    .index("by_userId_clientId", ["userId", "clientId"])
    // Addition: same participant-discovery reason as photos.
    .index("by_eventId_userId", ["eventId", "userId"]),

  dwellRuns: defineTable({
    userId: v.id("users"),
    setId: v.id("sets"),
    stageId: v.id("stages"),
    startTs: v.number(),
    endTs: v.number(),
    dwellSeconds: v.number(),
    completionRate: v.number(),
    sampleCount: v.number(),
  })
    .index("by_userId_setId", ["userId", "setId"]) // recompute/replace on re-run
    .index("by_userId", ["userId"]), // all runs for a user, for deriveSignals

  cards: defineTable({
    userId: v.id("users"),
    setId: v.id("sets"),
    photoId: v.id("photos"),
    frameVariant: v.union(
      v.literal("ranger_badge"),
      v.literal("trail_marker"),
      v.literal("fog_layer"),
      v.literal("disco_bison"),
      v.literal("field_notes"),
    ),
    dwellSeconds: v.number(),
    rarityScore: v.number(),
    state: v.union(
      v.literal("LOCKED"),
      v.literal("AVAILABLE"),
      v.literal("SPINNING"),
      v.literal("MINTED"),
    ),
    mintedAt: v.optional(v.number()),
  })
    .index("by_userId_setId", ["userId", "setId"]) // dedupe on mint
    .index("by_userId", ["userId"]), // shelf, newest first

  tasks: defineTable({
    eventId: v.id("events"),
    setId: v.optional(v.id("sets")),
    artistName: v.string(),
    type: v.string(),
    // Params/reward shape varies by task type (path 8 owns task semantics);
    // validated loosely on purpose rather than a speculative union of every
    // task type that might exist by 6PM.
    params: v.any(),
    description: v.string(),
    rewardType: v.string(),
    rewardPayload: v.any(),
    activeFrom: v.number(),
    activeUntil: v.number(),
  }).index("by_eventId", ["eventId"]),

  taskCompletions: defineTable({
    userId: v.id("users"),
    taskId: v.id("tasks"),
    verifiedAt: v.number(),
    proofCardId: v.optional(v.id("cards")),
  }).index("by_userId_taskId", ["userId", "taskId"]),

  wrapped: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    computedAt: v.number(),
    stats: v.any(), // DerivedSignals — see lib/types.ts for the typed shape
    narrative: v.array(v.string()),
    stripBlobRef: v.optional(v.id("_storage")),
  }).index("by_userId_eventId", ["userId", "eventId"]),

  // Path A (docs/CONVEX_PATH_A_CLAUDE.md): one row per (userId, eventId) is
  // both the dedup key and the operational record for automated Wrapped
  // generation after an event ends — a job row, not a generic queue table.
  wrappedJobs: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    state: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("SUCCEEDED"),
      v.literal("FAILED"),
    ),
    attempts: v.number(),
    updatedAt: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_userId_eventId", ["userId", "eventId"]) // dedupe/claim
    .index("by_state_updatedAt", ["state", "updatedAt"]),
});
