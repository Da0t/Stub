import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const photoUpload = v.object({
  clientId: v.string(),
  timestamp: v.number(),
  lat: v.number(),
  lng: v.number(),
  storageId: v.id("_storage"),
});

const sampleUpload = v.object({
  clientId: v.string(),
  timestamp: v.number(),
  lat: v.number(),
  lng: v.number(),
  accuracy: v.union(v.number(), v.null()),
});

/**
 * api.ingest.generateUploadUrl — not in CONTRACTS.md §8's frozen list, but
 * "photos are blobs from the client" (README gotchas) requires a way to get
 * them into Convex file storage before ingest.photos can reference a
 * storageId. Addition, not a rename.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** api.ingest.photos — idempotent on clientId. */
export const photos = mutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("events"),
    photos: v.array(photoUpload),
  },
  handler: async (ctx, { userId, eventId, photos: batch }) => {
    const acceptedIds: string[] = [];
    // Dedupe within the batch itself — a raced offline-sync retry can send
    // the same clientId twice in one call, not just across calls.
    const seen = new Set<string>();

    for (const p of batch) {
      if (seen.has(p.clientId)) continue;
      seen.add(p.clientId);

      const existing = await ctx.db
        .query("photos")
        .withIndex("by_userId_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", p.clientId),
        )
        .unique();

      if (existing) {
        acceptedIds.push(existing._id);
        continue;
      }

      const id = await ctx.db.insert("photos", {
        userId,
        eventId,
        clientId: p.clientId,
        timestamp: p.timestamp,
        lat: p.lat,
        lng: p.lng,
        blobRef: p.storageId,
      });
      acceptedIds.push(id);
    }

    // Resolution is opportunistic, not real-time critical (README
    // "Resolution pass") — scheduled so the phone never waits on it.
    await ctx.scheduler.runAfter(0, internal.resolve.run, { userId });

    return acceptedIds;
  },
});

/** api.ingest.samples — idempotent bulk upsert on clientId. */
export const samples = mutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("events"),
    samples: v.array(sampleUpload),
  },
  handler: async (ctx, { userId, eventId, samples: batch }) => {
    const acceptedIds: string[] = [];
    const seen = new Set<string>();

    for (const s of batch) {
      if (seen.has(s.clientId)) continue;
      seen.add(s.clientId);

      const existing = await ctx.db
        .query("dwellSamples")
        .withIndex("by_userId_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", s.clientId),
        )
        .unique();

      if (existing) {
        acceptedIds.push(existing._id);
        continue;
      }

      const id = await ctx.db.insert("dwellSamples", {
        userId,
        eventId,
        clientId: s.clientId,
        timestamp: s.timestamp,
        lat: s.lat,
        lng: s.lng,
        accuracy: s.accuracy ?? undefined,
      });
      acceptedIds.push(id);
    }

    await ctx.scheduler.runAfter(0, internal.resolve.run, { userId });

    return acceptedIds;
  },
});
