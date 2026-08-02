import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * api.tasks.verify — "a query over existing cards; no new verification code
 * paths" (README). A task tied to a specific set (`tasks.setId`) is
 * verified by the user holding a MINTED card for that set — the only
 * verification rule the schema can express without path 8's task-type
 * semantics, which aren't specified yet. Idempotent: re-verifying an
 * already-completed task returns the same completion rather than a new row.
 *
 * Frozen as a mutation per CONTRACTS.md §8 (it writes taskCompletions), even
 * though it reads more than it writes.
 */
export const verify = mutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, { userId, taskId }) => {
    const existing = await ctx.db
      .query("taskCompletions")
      .withIndex("by_userId_taskId", (q) => q.eq("userId", userId).eq("taskId", taskId))
      .unique();
    if (existing) return existing;

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    if (!task.setId) {
      // Non-set task types (e.g. "visit 3 stages") aren't specified by any
      // branch yet — path 8 owns task semantics and extends this when they
      // land, per the file's own header comment.
      return null;
    }

    const card = await ctx.db
      .query("cards")
      .withIndex("by_userId_setId", (q) => q.eq("userId", userId).eq("setId", task.setId!))
      .unique();
    if (!card || card.state !== "MINTED") return null;

    const completion = {
      userId,
      taskId,
      verifiedAt: Date.now(),
      proofCardId: card._id,
    };
    const id = await ctx.db.insert("taskCompletions", completion);
    return { _id: id, ...completion };
  },
});
