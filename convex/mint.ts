import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { checkEligibility, rarityScore } from "../lib/mint/eligibility";
import type { SetRecord } from "../lib/types";

/**
 * api.mint.claim — dedupes on (userId, setId); re-verifies eligibility
 * server-side rather than trusting the client's optimistic prompt (path 6's
 * README: "Path 4 calls [checkEligibility] inside mintableNow and
 * mint.claim"). frameVariant is chosen client-side (path 6 owns
 * pickFrameVariant) and passed in; rarityScore is not — the client never
 * gets to set its own rarity.
 */
export const claim = mutation({
  args: {
    userId: v.id("users"),
    setId: v.id("sets"),
    photoClientId: v.string(),
    frameVariant: v.union(
      v.literal("ranger_badge"),
      v.literal("trail_marker"),
      v.literal("fog_layer"),
      v.literal("disco_bison"),
      v.literal("field_notes"),
    ),
  },
  handler: async (ctx, { userId, setId, photoClientId, frameVariant }) => {
    const existing = await ctx.db
      .query("cards")
      .withIndex("by_userId_setId", (q) => q.eq("userId", userId).eq("setId", setId))
      .unique();
    if (existing) return existing._id; // dedupe hard: same card, not a second one

    const set = await ctx.db.get(setId);
    if (!set) throw new Error(`Unknown set: ${setId}`);

    const photo = await ctx.db
      .query("photos")
      .withIndex("by_userId_clientId", (q) => q.eq("userId", userId).eq("clientId", photoClientId))
      .unique();
    if (!photo) throw new Error(`Unknown photo clientId: ${photoClientId}`);

    const runs = await ctx.db
      .query("dwellRuns")
      .withIndex("by_userId_setId", (q) => q.eq("userId", userId).eq("setId", setId))
      .collect();
    const dwellSeconds = runs.reduce((sum, r) => sum + r.dwellSeconds, 0);

    const userPhotos = await ctx.db
      .query("photos")
      .withIndex("by_userId_timestamp", (q) => q.eq("userId", userId))
      .collect();
    const hasPhotoInWindow = userPhotos.some((p) => p.resolvedSetId === setId);

    const state = checkEligibility({
      stageId: photo.resolvedStageId ?? null,
      setId: photo.resolvedSetId ?? null,
      dwellSeconds,
      hasPhotoInWindow,
      alreadyMinted: false, // already handled by the dedupe check above
    });
    if (state !== "AVAILABLE") {
      throw new Error(`Not eligible to mint set ${setId}: resolved state is ${state}`);
    }

    const eventSets = await ctx.db
      .query("sets")
      .withIndex("by_eventId_stageId_startTime", (q) => q.eq("eventId", set.eventId))
      .collect();
    const concurrentHeadlinerRunning = eventSets.some(
      (other) =>
        other._id !== set._id &&
        other.isHeadliner &&
        other.startTime < set.endTime &&
        other.endTime > set.startTime,
    );

    const setRecord: SetRecord = {
      id: set._id,
      stageId: set.stageId,
      artistName: set.artistName,
      startTime: set.startTime,
      endTime: set.endTime,
      slotIndex: set.slotIndex,
      isHeadliner: set.isHeadliner,
      estimatedAudience: set.estimatedAudience ?? null,
      isFestivalDebut: set.isFestivalDebut,
      isFinalShow: set.isFinalShow,
      genreTags: set.genreTags,
      jambaseArtistId: set.jambaseArtistId ?? null,
      spotifyId: set.spotifyId ?? null,
      nextTourDate: set.nextTourDate ?? null,
    };
    const rarity = rarityScore(setRecord, { concurrentHeadlinerRunning });

    return ctx.db.insert("cards", {
      userId,
      setId,
      photoId: photo._id,
      frameVariant,
      dwellSeconds,
      rarityScore: rarity,
      state: "MINTED",
      mintedAt: Date.now(),
    });
  },
});
