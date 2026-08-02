import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadGrid } from "./lib";
import { deriveSignals } from "../lib/dwell/signals";
import { writeWrapped } from "../lib/ai/narrative";
import { renderStrip } from "../lib/render/types";
import type { CardRenderInput, DwellRun as WireDwellRun } from "../lib/types";

/**
 * api.wrapped.compute — CONTRACTS.md §8 groups this under "Mutations", but
 * it calls path 8's writeWrapped (OpenAI, real network I/O) and path 7's
 * renderStrip. Convex mutations must be deterministic and can't do fetch —
 * so this is a Convex *action* that reads via an internal query and writes
 * via an internal mutation. Same api.wrapped.compute name and args from the
 * client's point of view; the client hook is useAction, not useMutation.
 */
export const compute = action({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }): Promise<Id<"wrapped">> => {
    const gathered = await ctx.runQuery(internal.wrapped.gatherStats, { userId, eventId });
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
        stripBlobRef = await ctx.storage.store(new Blob([buffer]));
      }
    } catch {
      stripBlobRef = undefined;
    }

    return ctx.runMutation(internal.wrapped.persist, {
      userId,
      eventId,
      stats,
      narrative,
      stripBlobRef,
    });
  },
});

export const gatherStats = internalQuery({
  args: { userId: v.id("users"), eventId: v.id("events") },
  handler: async (ctx, { userId, eventId }) => {
    const grid = await loadGrid(ctx, eventId);
    const eventSetIds = new Set(grid.sets.map((s) => s.id));
    const event = await ctx.db.get(eventId);

    const allRuns = await ctx.db
      .query("dwellRuns")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const runs: WireDwellRun[] = allRuns
      .filter((r) => eventSetIds.has(r.setId))
      .map((r) => ({
        stageId: r.stageId,
        setId: r.setId,
        startTs: r.startTs,
        endTs: r.endTs,
        dwellSeconds: r.dwellSeconds,
        completionRate: r.completionRate,
        sampleCount: r.sampleCount,
      }));

    const allCards = await ctx.db
      .query("cards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const mintedThisEvent = allCards.filter((c) => c.state === "MINTED" && eventSetIds.has(c.setId));
    const mintedPrior = allCards.filter((c) => c.state === "MINTED" && !eventSetIds.has(c.setId));

    const priorArtistNames: string[] = [];
    for (const c of mintedPrior) {
      const s = await ctx.db.get(c.setId);
      if (s) priorArtistNames.push(s.artistName);
    }

    const stripCards: CardRenderInput[] = [];
    for (const c of mintedThisEvent) {
      const set = grid.sets.find((s) => s.id === c.setId);
      if (!set) continue;
      const stage = grid.stages.find((s) => s.id === set.stageId);
      const photo = await ctx.db.get(c.photoId);
      const photoUrl = photo ? await ctx.storage.getUrl(photo.blobRef) : null;
      if (!photoUrl) continue; // no face for this card yet; leave it off the strip
      stripCards.push({
        photoUrl,
        frameVariant: c.frameVariant,
        artistName: set.artistName,
        stageName: stage?.name ?? "Unknown stage",
        dateLabel: formatDateLabel(set.startTime, grid.timezone),
        setWindowLabel: formatWindowLabel(set.startTime, set.endTime, grid.timezone),
        dwellLabel: formatDwellLabel(c.dwellSeconds),
        rarityScore: c.rarityScore,
        themePack: event?.themePack ?? "outside-lands-2026",
      });
    }

    return { grid, runs, priorArtistNames, stripCards };
  },
});

export const persist = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.id("events"),
    stats: v.any(),
    narrative: v.array(v.string()),
    stripBlobRef: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args): Promise<Id<"wrapped">> => {
    const existing = await ctx.db
      .query("wrapped")
      .withIndex("by_userId_eventId", (q) => q.eq("userId", args.userId).eq("eventId", args.eventId))
      .unique();

    const row = { ...args, computedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert("wrapped", row);
  },
});

function formatDateLabel(startTime: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: timezone }).format(
    new Date(startTime),
  );
}

function formatWindowLabel(startTime: number, endTime: number, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${fmt.format(new Date(startTime))} - ${fmt.format(new Date(endTime))}`;
}

function formatDwellLabel(dwellSeconds: number): string {
  return `${Math.round(dwellSeconds / 60)} min`;
}
