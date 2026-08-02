import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * docs/CONVEX_PATH_A_CLAUDE.md — automated event lifecycle. A cron scans
 * ended events every 15 minutes, claims one wrappedJobs row per (user,
 * event), and schedules processJob to run the shared Wrapped pipeline
 * (convex/wrapped.ts). processJob is a plain action (not "use node") — it
 * never touches Node APIs itself, only ctx.runAction's into wrapped.ts's
 * Node action — so it can live alongside the mutations/queries below in one
 * file, matching this path's exclusive file list.
 */

export const MAX_EVENTS_PER_SCAN = 10;
export const MAX_PARTICIPANTS_PER_EVENT = 100;
export const STALE_RUNNING_MS = 30 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const MAX_ERROR_LENGTH = 500;

export interface JobState {
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  attempts: number;
  updatedAt: number;
}

/** Pure claim/retry rule — kept free of Convex so it's directly testable. */
export function isClaimable(existing: JobState | null, now: number): boolean {
  if (!existing) return true;
  switch (existing.state) {
    case "SUCCEEDED":
      return false;
    case "RUNNING":
      return now - existing.updatedAt > STALE_RUNNING_MS;
    case "FAILED":
      return existing.attempts < MAX_ATTEMPTS;
    case "PENDING":
      return true;
  }
}

/** Dedupe participant user IDs discovered from samples and photos. */
export function mergeParticipantIds(sampleUserIds: string[], photoUserIds: string[]): string[] {
  return [...new Set([...sampleUserIds, ...photoUserIds])];
}

/** Never store stack traces, prompts, tokens, or secrets in lastError. */
export function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * internal.eventCompletion.scanEndedEvents — the cron target. Finds ended
 * events, discovers participants from event-scoped dwellSamples/photos, and
 * atomically claims one job per participant that's absent, stale-RUNNING,
 * or FAILED under the attempt cap.
 */
export const scanEndedEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const endedEvents = await ctx.db
      .query("events")
      .withIndex("by_endDate", (q) => q.lte("endDate", now))
      .take(MAX_EVENTS_PER_SCAN);

    for (const event of endedEvents) {
      const sampleRows = await ctx.db
        .query("dwellSamples")
        .withIndex("by_eventId_userId", (q) => q.eq("eventId", event._id))
        .take(MAX_PARTICIPANTS_PER_EVENT);
      const photoRows = await ctx.db
        .query("photos")
        .withIndex("by_eventId_userId", (q) => q.eq("eventId", event._id))
        .take(MAX_PARTICIPANTS_PER_EVENT);

      const participantIds = mergeParticipantIds(
        sampleRows.map((s) => s.userId),
        photoRows.map((p) => p.userId),
      ).slice(0, MAX_PARTICIPANTS_PER_EVENT) as Id<"users">[];

      for (const userId of participantIds) {
        const existing = await ctx.db
          .query("wrappedJobs")
          .withIndex("by_userId_eventId", (q) => q.eq("userId", userId).eq("eventId", event._id))
          .unique();

        if (!isClaimable(existing, now)) continue;

        let jobId: Id<"wrappedJobs">;
        if (existing) {
          jobId = existing._id;
          await ctx.db.patch(jobId, {
            state: "RUNNING",
            attempts: existing.attempts + 1,
            updatedAt: now,
            lastError: undefined,
          });
        } else {
          jobId = await ctx.db.insert("wrappedJobs", {
            userId,
            eventId: event._id,
            state: "RUNNING",
            attempts: 1,
            updatedAt: now,
          });
        }

        await ctx.scheduler.runAfter(0, internal.eventCompletion.processJob, { jobId });
      }
    }
  },
});

export const getJob = internalQuery({
  args: { jobId: v.id("wrappedJobs") },
  handler: async (ctx, { jobId }) => ctx.db.get(jobId),
});

export const markSucceeded = internalMutation({
  args: { jobId: v.id("wrappedJobs") },
  handler: async (ctx, { jobId }) => {
    await ctx.db.patch(jobId, { state: "SUCCEEDED", updatedAt: Date.now(), lastError: undefined });
  },
});

export const markFailed = internalMutation({
  args: { jobId: v.id("wrappedJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    await ctx.db.patch(jobId, { state: "FAILED", updatedAt: Date.now(), lastError: error });
  },
});

/**
 * internal.eventCompletion.processJob — re-checks the job is still RUNNING
 * (it may have been reclaimed by a later scan if this run stalled) before
 * invoking the shared Wrapped pipeline. Rethrows on failure so Convex
 * records the run as failed for observability; the job row itself is what
 * later scans use to decide whether to retry.
 */
export const processJob = internalAction({
  args: { jobId: v.id("wrappedJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.eventCompletion.getJob, { jobId });
    if (!job || job.state !== "RUNNING") return;

    try {
      await ctx.runAction(internal.wrapped.computeInternal, {
        userId: job.userId,
        eventId: job.eventId,
      });
      await ctx.runMutation(internal.eventCompletion.markSucceeded, { jobId });
    } catch (err) {
      await ctx.runMutation(internal.eventCompletion.markFailed, {
        jobId,
        error: sanitizeError(err),
      });
      throw err;
    }
  },
});
