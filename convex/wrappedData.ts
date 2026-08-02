import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { loadGrid } from "./lib";
import type { CardRenderInput, DwellRun as WireDwellRun } from "../lib/types";

/**
 * DB-only halves of wrapped.compute, split out of convex/wrapped.ts. That
 * file needs "use node" (path 7's renderStrip pulls in node:crypto,
 * node:net, and a native canvas binary), and a "use node" file may only
 * contain actions — no queries or mutations. These two stay on the default
 * runtime and are called from the action via ctx.runQuery/ctx.runMutation.
 */

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
