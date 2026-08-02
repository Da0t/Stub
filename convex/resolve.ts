import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { loadGrid } from "./lib";
import { resolve as resolvePoint } from "../lib/geo/resolve";
import { buildDwellRuns } from "../lib/dwell/runs";
import type { DwellSample as WireDwellSample } from "../lib/types";

/**
 * The resolution pass (README "Resolution pass"). Deterministic, no model
 * involved. Stamps resolvedStageId/resolvedSetId onto photos and
 * dwellSamples, then rematerialises dwellRuns for the affected event.
 *
 * Scheduled from ingest.photos/ingest.samples (opportunistic, not
 * real-time critical) rather than run inline — the phone should never wait
 * on this.
 *
 * Scoped to one event per invocation: the app is single-event-at-a-time,
 * and correctness (not reprocessing a growing user history every ingest)
 * matters more here than handling a user mid-two-festivals edge case that
 * doesn't occur in this product.
 */
export const run = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
      .collect();
    const unresolvedPhotos = photos.filter((p) => p.resolvedStageId === undefined);

    const samples = await ctx.db
      .query("dwellSamples")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
      .collect();
    const unresolvedSamples = samples.filter((s) => s.resolvedStageId === undefined);

    if (unresolvedPhotos.length === 0 && unresolvedSamples.length === 0) return;

    const eventId = unresolvedPhotos[0]?.eventId ?? unresolvedSamples[0]?.eventId;
    if (!eventId) return;

    const grid = await loadGrid(ctx, eventId);

    for (const photo of unresolvedPhotos) {
      if (photo.eventId !== eventId) continue; // different event; a later pass handles it
      const { stageId, setId } = resolvePoint(
        { lat: photo.lat, lng: photo.lng },
        photo.timestamp,
        grid,
      );
      await ctx.db.patch(photo._id, {
        resolvedStageId: (stageId as Id<"stages"> | null),
        resolvedSetId: (setId as Id<"sets"> | null),
      });
    }

    for (const sample of unresolvedSamples) {
      if (sample.eventId !== eventId) continue;
      const { stageId } = resolvePoint({ lat: sample.lat, lng: sample.lng }, sample.timestamp, grid);
      await ctx.db.patch(sample._id, { resolvedStageId: stageId as Id<"stages"> | null });
    }

    // Rematerialise dwellRuns for this event from *all* of the user's
    // resolved samples in it (not just the newly-resolved ones — a run can
    // span old and new samples). Replace rather than append: buildDwellRuns
    // is pure, so re-deriving from scratch is the simplest correct
    // idempotent strategy at this data scale.
    const allSamplesForEvent = (
      await ctx.db
        .query("dwellSamples")
        .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
        .collect()
    ).filter((s) => s.eventId === eventId && s.resolvedStageId !== undefined);

    const wireSamples: WireDwellSample[] = allSamplesForEvent.map((s) => ({
      clientId: s.clientId,
      ts: s.timestamp,
      lat: s.lat,
      lng: s.lng,
      accuracy: s.accuracy ?? null,
      synced: true,
    }));

    const runs = buildDwellRuns(wireSamples, grid);

    const existingRuns = await ctx.db
      .query("dwellRuns")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    // Only clear runs that belong to sets in *this* event — a user's runs
    // from a different event must survive this pass.
    const eventSetIds = new Set(grid.sets.map((s) => s.id));
    for (const r of existingRuns) {
      if (eventSetIds.has(r.setId)) await ctx.db.delete(r._id);
    }

    for (const run of runs) {
      if (!run.setId) continue; // no resolved set to attach it to; drop it
      await ctx.db.insert("dwellRuns", {
        userId,
        setId: run.setId as Id<"sets">,
        stageId: run.stageId as Id<"stages">,
        startTs: run.startTs,
        endTs: run.endTs,
        dwellSeconds: run.dwellSeconds,
        completionRate: run.completionRate,
        sampleCount: run.sampleCount,
      });
    }
  },
});
