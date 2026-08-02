import { v } from "convex/values";
import { query } from "./_generated/server";
import { loadGrid } from "./lib";
import { buildEventLeaderboard, summarizeLiveDwell, type EventDwellLeaderboard, type LiveDwellSummary } from "../lib/dwell/liveSummary";

export const summary = query({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }): Promise<LiveDwellSummary> => {
    const [grid, samples, allRuns, photos, cards] = await Promise.all([
      loadGrid(ctx, eventId),
      ctx.db.query("dwellSamples").withIndex("by_userId_timestamp", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dwellRuns").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("photos").withIndex("by_userId_timestamp", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("cards").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ]);
    const eventSetIds = new Set(grid.sets.map((set) => set.id));

    return summarizeLiveDwell({
      eventId,
      samples: samples.filter((sample) => sample.eventId === eventId).map((sample) => ({
        timestamp: sample.timestamp,
        resolved: sample.resolvedStageId !== undefined,
      })),
      runs: allRuns.filter((run) => eventSetIds.has(run.setId)).map((run) => ({
        setId: run.setId,
        stageId: run.stageId,
        startTs: run.startTs,
        endTs: run.endTs,
        dwellSeconds: run.dwellSeconds,
      })),
      sets: grid.sets,
      stages: grid.stages,
      photoSetIds: new Set(photos.filter((photo) => photo.eventId === eventId && photo.resolvedSetId).map((photo) => photo.resolvedSetId!)),
      mintedSetIds: new Set(cards.filter((card) => card.state === "MINTED" && eventSetIds.has(card.setId)).map((card) => card.setId)),
    });
  },
});

export const leaderboard = query({
  args: { eventId: v.id("events"), limit: v.optional(v.number()) },
  handler: async (ctx, { eventId, limit }): Promise<EventDwellLeaderboard> => {
    const [grid, allRuns] = await Promise.all([
      loadGrid(ctx, eventId),
      // ponytail: demo-scale scan; materialize event aggregates if measured Convex read limits become a problem.
      ctx.db.query("dwellRuns").collect(),
    ]);
    return buildEventLeaderboard({
      sets: grid.sets,
      stages: grid.stages,
      runs: allRuns.map((run) => ({
        userId: run.userId,
        setId: run.setId,
        stageId: run.stageId,
        startTs: run.startTs,
        endTs: run.endTs,
        dwellSeconds: run.dwellSeconds,
      })),
    }, limit);
  },
});
