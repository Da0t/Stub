import { describe, expect, it } from "vitest";
import {
  isClaimable,
  mergeParticipantIds,
  sanitizeError,
  MAX_ATTEMPTS,
  STALE_RUNNING_MS,
  MAX_ERROR_LENGTH,
  type JobState,
} from "../eventCompletion";

// Pure claim/retry/sanitize helpers, tested without mocking Convex — the
// orchestration (scanEndedEvents, processJob) is a thin wrapper around
// these decisions plus ctx.db/ctx.scheduler calls.

describe("isClaimable", () => {
  const now = 1_000_000;

  it("absent job is claimable", () => {
    expect(isClaimable(null, now)).toBe(true);
  });

  it("SUCCEEDED job is never claimable", () => {
    const job: JobState = { state: "SUCCEEDED", attempts: 1, updatedAt: now };
    expect(isClaimable(job, now)).toBe(false);
  });

  it("fresh RUNNING job is not claimable", () => {
    const job: JobState = { state: "RUNNING", attempts: 1, updatedAt: now - 1000 };
    expect(isClaimable(job, now)).toBe(false);
  });

  it("stale RUNNING job is reclaimable", () => {
    const job: JobState = { state: "RUNNING", attempts: 1, updatedAt: now - STALE_RUNNING_MS - 1 };
    expect(isClaimable(job, now)).toBe(true);
  });

  it("FAILED job below three attempts is retryable", () => {
    const job: JobState = { state: "FAILED", attempts: MAX_ATTEMPTS - 1, updatedAt: now };
    expect(isClaimable(job, now)).toBe(true);
  });

  it("three-attempt job is terminal", () => {
    const job: JobState = { state: "FAILED", attempts: MAX_ATTEMPTS, updatedAt: now };
    expect(isClaimable(job, now)).toBe(false);
  });
});

describe("mergeParticipantIds", () => {
  it("deduplicates user IDs sourced from photos and samples", () => {
    const merged = mergeParticipantIds(["u1", "u2", "u1"], ["u2", "u3"]);
    expect(merged.sort()).toEqual(["u1", "u2", "u3"]);
  });
});

describe("sanitizeError", () => {
  it("truncates and excludes stack data", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at Object.<anonymous> (/very/long/fake/stack/trace/line.ts:1:1)".repeat(20);
    const sanitized = sanitizeError(err);
    expect(sanitized.length).toBeLessThanOrEqual(MAX_ERROR_LENGTH);
    expect(sanitized).toBe("boom");
    expect(sanitized).not.toContain("at Object");
  });

  it("caps a long message at 500 characters", () => {
    const sanitized = sanitizeError(new Error("x".repeat(1000)));
    expect(sanitized.length).toBe(MAX_ERROR_LENGTH);
  });
});
