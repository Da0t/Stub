import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { loadGrid, latestEventForUser } from "./lib";
import { resolveStage, lookupSet } from "../lib/geo/resolve";
import { checkEligibility } from "../lib/mint/eligibility";
import type { Card, Grid, Mintable, TaskProgress, Wrapped } from "../lib/types";

/** api.queries.grid — reactive; the whole cached festival grid for an event. */
export const grid = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<Grid> => loadGrid(ctx, eventId),
});

/** api.queries.shelf — a user's cards, newest first, joined to set + artist. */
export const shelf = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Card[]> => {
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const out: Card[] = [];
    for (const c of cards) {
      const set = await ctx.db.get(c.setId);
      if (!set) continue;
      const stage = await ctx.db.get(set.stageId);
      const photo = await ctx.db.get(c.photoId);
      const photoUrl = photo ? await ctx.storage.getUrl(photo.blobRef) : null;

      out.push({
        id: c._id,
        setId: c.setId,
        stageId: set.stageId,
        artistName: set.artistName,
        stageName: stage?.name ?? "Unknown stage",
        photoUrl,
        frameVariant: c.frameVariant,
        dwellSeconds: c.dwellSeconds,
        rarityScore: c.rarityScore,
        state: c.state,
        mintedAt: c.mintedAt ?? null,
      });
    }
    return out;
  },
});

/**
 * api.queries.mintableNow — resolves the passed coordinate against the
 * user's active event grid and reports that one location's mint state.
 * Returns at most one entry: a GPS fix resolves to at most one stage, so
 * "what's mintable here, right now" is a single answer, not a list of
 * everything the user could mint anywhere on the grounds.
 */
export const mintableNow = query({
  args: { userId: v.id("users"), lat: v.number(), lng: v.number() },
  handler: async (ctx, { userId, lat, lng }): Promise<Mintable[]> => {
    const eventId = await latestEventForUser(ctx, userId);
    if (!eventId) return [];

    const grid = await loadGrid(ctx, eventId);
    const stageId = resolveStage({ lat, lng }, grid.stages);
    if (!stageId) return [];

    const setId = lookupSet(stageId, Date.now(), grid);
    if (!setId) return [];

    const set = grid.sets.find((s) => s.id === setId);
    if (!set) return [];

    // resolveStage/lookupSet return plain strings per lib/types (path 2's
    // contract type, StageId/SetId = string) — at runtime these are the
    // Convex ids loadGrid stamped onto Stage.id/SetRecord.id in convex/lib.ts.
    const resolvedSetId = setId as Id<"sets">;

    const runs = await ctx.db
      .query("dwellRuns")
      .withIndex("by_userId_setId", (q) => q.eq("userId", userId).eq("setId", resolvedSetId))
      .collect();
    const dwellSeconds = runs.reduce((sum, r) => sum + r.dwellSeconds, 0);

    const userPhotos = await ctx.db
      .query("photos")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
      .collect();
    const hasPhotoInWindow = userPhotos.some((p) => p.resolvedSetId === resolvedSetId);
    const photoClientId = userPhotos.find((p) => p.resolvedSetId === resolvedSetId)?.clientId ?? "";

    const existingCard = await ctx.db
      .query("cards")
      .withIndex("by_userId_setId", (q) => q.eq("userId", userId).eq("setId", resolvedSetId))
      .unique();

    const state = checkEligibility({
      stageId,
      setId,
      dwellSeconds,
      hasPhotoInWindow,
      alreadyMinted: existingCard !== null,
    });

    return [
      {
        setId,
        stageId,
        artistName: set.artistName,
        photoClientId,
        dwellSeconds,
        rarityScore: existingCard?.rarityScore ?? 0,
        state,
      },
    ];
  },
});

/** api.queries.taskProgress — active tasks for the user's event, joined to completion state. */
export const taskProgress = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<TaskProgress[]> => {
    const eventId = await latestEventForUser(ctx, userId);
    if (!eventId) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();

    const out: TaskProgress[] = [];
    for (const t of tasks) {
      const completion = await ctx.db
        .query("taskCompletions")
        .withIndex("by_userId_taskId", (q) => q.eq("userId", userId).eq("taskId", t._id))
        .unique();

      out.push({
        taskId: t._id,
        artistName: t.artistName,
        description: t.description,
        rewardType: t.rewardType,
        rewardPayload: t.rewardPayload,
        activeFrom: t.activeFrom,
        activeUntil: t.activeUntil,
        completed: completion !== null,
        completedAt: completion?.verifiedAt ?? null,
        proofCardId: completion?.proofCardId ?? null,
      });
    }
    return out;
  },
});

/** api.queries.wrapped — the computed Wrapped for a user+event, or null before compute has run. */
export const wrapped = query({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }): Promise<Wrapped | null> => {
    const row = await ctx.db
      .query("wrapped")
      .withIndex("by_userId_eventId", (q) => q.eq("userId", userId).eq("eventId", eventId))
      .unique();
    if (!row) return null;

    return {
      id: row._id,
      eventId: row.eventId,
      computedAt: row.computedAt,
      stats: row.stats,
      narrative: row.narrative,
      stripUrl: row.stripBlobRef ? await ctx.storage.getUrl(row.stripBlobRef) : null,
    };
  },
});
