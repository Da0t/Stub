"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { deriveSignals } from "../lib/dwell/signals";
import { writeWrapped } from "../lib/ai/narrative";
import { renderStrip } from "../lib/render/strip";

/**
 * The one Wrapped computation pipeline (docs/CONVEX_PATH_A_CLAUDE.md:
 * "Do not create a second Wrapped computation pipeline"). Shared by the
 * public `compute` action (frozen CONTRACTS.md §8 signature, called
 * manually) and `computeInternal` (called from eventCompletion.processJob
 * on the 15-minute cron). Both are plain actions, not query/mutation, so
 * this can live in the same "use node" file as them — a "use node" file may
 * only contain actions, which is why the DB-only halves live in
 * wrappedData.ts instead.
 */
async function computeWrapped(
  ctx: ActionCtx,
  userId: Id<"users">,
  eventId: Id<"events">,
): Promise<Id<"wrapped">> {
  const gathered = await ctx.runQuery(internal.wrappedData.gatherStats, { userId, eventId });
  const stats = deriveSignals(gathered.runs, gathered.grid, gathered.priorArtistNames);

  // Narrative and strip are the model/render layer sitting *beside* the
  // fact path (core invariant). Either can fail without taking the
  // deterministic stats down with it.
  let narrative: string[] = [];
  try {
    narrative = await writeWrapped({ ...stats, extras: {} });
  } catch {
    narrative = [];
  }

  let stripBlobRef: Id<"_storage"> | undefined;
  try {
    if (gathered.stripCards.length > 0) {
      const buffer = await renderStrip(gathered.stripCards);
      // Buffer's ArrayBufferLike allows SharedArrayBuffer, which BlobPart
      // rejects; a Uint8Array view over it satisfies the stricter type.
      // A Blob with no explicit type fails ctx.storage.store with
      // "BadHeader: invalid HTTP header" (confirmed by actually running
      // this against a real deployment) — renderStrip's canvas output is
      // PNG, matching path 7's render conventions.
      stripBlobRef = await ctx.storage.store(
        new Blob([new Uint8Array(buffer)], { type: "image/png" }),
      );
    }
  } catch {
    stripBlobRef = undefined;
  }

  return ctx.runMutation(internal.wrappedData.persist, {
    userId,
    eventId,
    stats,
    narrative,
    stripBlobRef,
  });
}

/**
 * api.wrapped.compute — CONTRACTS.md §8 groups this under "Mutations", but
 * it calls path 8's writeWrapped (OpenAI, real network I/O) and path 7's
 * renderStrip (node:crypto, node:net, a native canvas binary — Node-only,
 * confirmed by actually running the bundler against the real files). Convex
 * mutations must be deterministic and the default runtime has no Node
 * APIs, so this is a Convex *action* with "use node". Same api.wrapped.compute
 * name and args from the client; the hook is useAction, not useMutation.
 */
export const compute = action({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }): Promise<Id<"wrapped">> => computeWrapped(ctx, userId, eventId),
});

/**
 * Same pipeline, called from eventCompletion.processJob instead of a
 * client. Internal-only — no client should trigger Wrapped generation
 * directly on a schedule.
 */
export const computeInternal = internalAction({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }): Promise<Id<"wrapped">> => computeWrapped(ctx, userId, eventId),
});
