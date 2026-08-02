import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { Grid, PolyPoint, SetRecord, Stage } from "../lib/types";

/**
 * Convex docs -> wire Grid. Three call sites need this (queries.grid,
 * resolve.ts, wrapped.ts) and CONTRACTS.md is explicit that a rule with two
 * copies drifts — so it lives once, here.
 */
export async function loadGrid(ctx: QueryCtx, eventId: Id<"events">): Promise<Grid> {
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error(`Unknown event: ${eventId}`);

  const stageDocs = await ctx.db
    .query("stages")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();

  const setDocs = await ctx.db
    .query("sets")
    .withIndex("by_eventId_stageId_startTime", (q) => q.eq("eventId", eventId))
    .collect();

  const stages: Stage[] = stageDocs.map((s) => ({
    id: s._id,
    name: s.name,
    polygon: s.polygon as PolyPoint[],
    bufferMeters: s.bufferMeters,
    centroid: s.centroid as PolyPoint,
  }));

  const sets: SetRecord[] = setDocs.map((s) => ({
    id: s._id,
    stageId: s.stageId,
    artistName: s.artistName,
    startTime: s.startTime,
    endTime: s.endTime,
    slotIndex: s.slotIndex,
    isHeadliner: s.isHeadliner,
    estimatedAudience: s.estimatedAudience ?? null,
    isFestivalDebut: s.isFestivalDebut,
    isFinalShow: s.isFinalShow,
    genreTags: s.genreTags,
    jambaseArtistId: s.jambaseArtistId ?? null,
    spotifyId: s.spotifyId ?? null,
    nextTourDate: s.nextTourDate ?? null,
  }));

  return {
    festivalId: event.jambaseFestivalId,
    eventName: event.name,
    timezone: event.timezone,
    fetchedAt: Date.now(),
    stages,
    sets,
  };
}

/**
 * The active event for a user, inferred from their most recent ingested
 * row. Needed because `mintableNow({ userId, lat, lng })` and `users` carry
 * no eventId (CONTRACTS.md §8 doesn't add one, and the app is single-event
 * at a time) — this is the documented resolution rule. If a user somehow
 * spans two events at once, the most recently active one wins.
 */
export async function latestEventForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"events"> | null> {
  const lastPhoto = await ctx.db
    .query("photos")
    .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
    .order("desc")
    .first();

  const lastSample = await ctx.db
    .query("dwellSamples")
    .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
    .order("desc")
    .first();

  if (lastPhoto && lastSample) {
    return lastPhoto.timestamp >= lastSample.timestamp ? lastPhoto.eventId : lastSample.eventId;
  }
  return lastPhoto?.eventId ?? lastSample?.eventId ?? null;
}
