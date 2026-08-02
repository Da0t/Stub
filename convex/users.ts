import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * api.users.ensure — the entire auth story (README "Identity"). Exchanges a
 * device-generated UUID for a users row, idempotently. Not in the frozen
 * mutation list because CONTRACTS.md §8 doesn't name it, but every other
 * mutation takes a userId that has to come from somewhere — this is that
 * somewhere. Addition, not a rename.
 */
export const ensure = mutation({
  args: {
    deviceId: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, displayName }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .unique();

    if (existing) {
      if (displayName && displayName !== existing.displayName) {
        await ctx.db.patch(existing._id, { displayName });
      }
      return existing._id;
    }

    return ctx.db.insert("users", {
      deviceId,
      createdAt: Date.now(),
      displayName,
    });
  },
});
