import { v } from "convex/values";
import { mutation } from "./_generated/server";

// Not in CONTRACTS.md §8's frozen list, but path 3's README says outright:
// "scripts/bootstrap-grid.ts — writes stages and sets into Convex via path
// 4's mutations." Something has to be that mutation. Additions are allowed;
// this is one. Logged to the shared vault for path 3 to pick up.

const polygon = v.array(v.array(v.float64()));
const latLng = v.array(v.float64());

const bootstrapStage = v.object({
  id: v.string(), name: v.string(), polygon, bufferMeters: v.number(),
  centroid: latLng, jambaseStageRef: v.optional(v.string()),
});
const bootstrapSet = v.object({
  sourceId: v.string(), stageId: v.string(), artistName: v.string(),
  jambaseArtistId: v.optional(v.string()), spotifyId: v.optional(v.string()),
  startTime: v.number(), endTime: v.number(), slotIndex: v.number(),
  isHeadliner: v.boolean(), estimatedAudience: v.optional(v.number()),
  isFestivalDebut: v.boolean(), isFinalShow: v.boolean(), genreTags: v.array(v.string()),
  nextTourDate: v.optional(v.object({ date: v.number(), venue: v.string(), city: v.string() })),
});

/** Atomic, idempotent one-shot ingest using canonical (offline Grid) stage ids. */
export const bootstrap = mutation({
  args: {
    event: v.object({
      jambaseFestivalId: v.string(), name: v.string(), themePack: v.string(),
      startDate: v.number(), endDate: v.number(), timezone: v.string(),
    }),
    stages: v.array(bootstrapStage),
    sets: v.array(bootstrapSet),
    provenance: v.optional(v.string()),
  },
  handler: async (ctx, { event, stages, sets, provenance }) => {
    void provenance; // travels with the audited request; fact-table schema remains frozen.
    const priorEvent = await ctx.db.query("events")
      .withIndex("by_jambaseFestivalId", (q) => q.eq("jambaseFestivalId", event.jambaseFestivalId))
      .unique();
    const eventId = priorEvent
      ? (await ctx.db.patch(priorEvent._id, event), priorEvent._id)
      : await ctx.db.insert("events", event);

    const priorStages = await ctx.db.query("stages")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
    const byName = new Map(priorStages.map((stage) => [stage.name, stage]));
    const stageIds = new Map<string, (typeof priorStages)[number]["_id"]>();
    for (const { id: sourceId, ...stage } of stages) {
      const prior = byName.get(stage.name);
      const id = prior
        ? (await ctx.db.patch(prior._id, stage), prior._id)
        : await ctx.db.insert("stages", { eventId, ...stage });
      stageIds.set(sourceId, id);
    }

    const setIds = [];
    for (const { sourceId, stageId: sourceStageId, ...set } of sets) {
      void sourceId;
      const stageId = stageIds.get(sourceStageId);
      if (!stageId) throw new Error(`Set references unknown canonical stage id: ${sourceStageId}`);
      const prior = await ctx.db.query("sets")
        .withIndex("by_eventId_stageId_startTime", (q) =>
          q.eq("eventId", eventId).eq("stageId", stageId).eq("startTime", set.startTime))
        .unique();
      if (prior) {
        await ctx.db.patch(prior._id, { stageId, ...set });
        setIds.push(prior._id);
      } else {
        setIds.push(await ctx.db.insert("sets", { eventId, stageId, ...set }));
      }
    }
    return { eventId, stageCount: stageIds.size, setCount: setIds.length };
  },
});

/** Idempotent on jambaseFestivalId — bootstrap can be re-run safely. */
export const upsertEvent = mutation({
  args: {
    jambaseFestivalId: v.string(),
    name: v.string(),
    themePack: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_jambaseFestivalId", (q) =>
        q.eq("jambaseFestivalId", args.jambaseFestivalId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("events", args);
  },
});

/**
 * Idempotent on (eventId, name) — re-running bootstrap updates the polygon
 * in place instead of duplicating stages. Returns Convex-generated ids in
 * input order; those ids ARE the StageId used everywhere downstream.
 */
export const upsertStages = mutation({
  args: {
    eventId: v.id("events"),
    stages: v.array(
      v.object({
        name: v.string(),
        polygon,
        bufferMeters: v.number(),
        centroid: latLng,
        jambaseStageRef: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { eventId, stages: input }) => {
    const existingStages = await ctx.db
      .query("stages")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    const byName = new Map(existingStages.map((s) => [s.name, s]));

    const ids = [];
    for (const stage of input) {
      const existing = byName.get(stage.name);
      if (existing) {
        await ctx.db.patch(existing._id, stage);
        ids.push(existing._id);
      } else {
        ids.push(await ctx.db.insert("stages", { eventId, ...stage }));
      }
    }
    return ids;
  },
});

/**
 * Idempotent on (eventId, stageId, startTime) — JamBase doesn't expose a
 * stable per-performance id in the contract, and two artists don't open on
 * the same stage at the same instant, so that triple is the natural key.
 */
export const upsertSets = mutation({
  args: {
    eventId: v.id("events"),
    sets: v.array(
      v.object({
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
      }),
    ),
  },
  handler: async (ctx, { eventId, sets: input }) => {
    const ids = [];
    for (const set of input) {
      const existing = await ctx.db
        .query("sets")
        .withIndex("by_eventId_stageId_startTime", (q) =>
          q.eq("eventId", eventId).eq("stageId", set.stageId).eq("startTime", set.startTime),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, set);
        ids.push(existing._id);
      } else {
        ids.push(await ctx.db.insert("sets", { eventId, ...set }));
      }
    }
    return ids;
  },
});
