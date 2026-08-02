// lib/offline/sync.ts
//
// Sync engine (path 1): opportunistic, batched, idempotent drain of unsynced
// records to path 4's ingest mutations.
//
// Rules from the spec:
//   - Idempotent by client-generated id, so a retry never double-writes.
//   - Trigger on: app foreground, `online` event, successful Convex reconnect,
//     and a 30s timer. NEVER on capture.
//   - Exponential backoff on failure. Failure is the normal case at the
//     festival — it is silent, never a toast.
//   - Photos batch 10, samples batch 100. Small enough for a 3-bar connection.
//   - Nothing user-visible ever waits on this.
//
// Path 4 dependency: `api.ingest.photos` / `api.ingest.samples`. Until that
// lands, we run against a stub that resolves after 200ms and acks everything.
// Swap in the real client with setIngestClient() — no other change needed.

import {
  unsyncedPhotos,
  unsyncedSamples,
  markSynced,
} from "@/lib/offline/db";
import type { CapturedPhoto, DwellSample } from "@/lib/types";

const PHOTO_BATCH = 10;
const SAMPLE_BATCH = 100;
const DEFAULT_TIMER_MS = 30_000;
const DEFAULT_BASE_BACKOFF_MS = 5_000;
const DEFAULT_MAX_BACKOFF_MS = 5 * 60_000;

/**
 * The ingest boundary. path 4 publishes idempotent mutations keyed on
 * clientId; an implementation returns the clientIds it durably accepted so we
 * only mark those synced. Partial acks are honoured.
 */
export interface IngestClient {
  photos(
    userId: string,
    eventId: string,
    photos: CapturedPhoto[]
  ): Promise<{ acked: string[] }>;
  samples(
    userId: string,
    eventId: string,
    samples: DwellSample[]
  ): Promise<{ acked: string[] }>;
}

// ---- path-4 stub -------------------------------------------------------
// Resolves after 200ms and acks every clientId. Deterministic; no network.
const stubClient: IngestClient = {
  async photos(_userId, _eventId, photos) {
    await delay(200);
    return { acked: photos.map((p) => p.clientId) };
  },
  async samples(_userId, _eventId, samples) {
    await delay(200);
    return { acked: samples.map((s) => s.clientId) };
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- module state ------------------------------------------------------

let client: IngestClient = stubClient;
let userId = "local-device"; // wired from path 4 / auth later
let eventId = "local-event";

let timerMs = DEFAULT_TIMER_MS;
let baseBackoffMs = DEFAULT_BASE_BACKOFF_MS;
let maxBackoffMs = DEFAULT_MAX_BACKOFF_MS;

let draining = false;
let rerunRequested = false;
let backoffMs = 0;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;

const pendingListeners = new Set<(n: number) => void>();
let lastPending = 0;

/** Swap the stub for path 4's real ingest client. */
export function setIngestClient(c: IngestClient): void {
  client = c;
}

/** Set the identity used for ingest calls (from path 4 / auth). */
export function configureSync(opts: { userId?: string; eventId?: string }): void {
  if (opts.userId) userId = opts.userId;
  if (opts.eventId) eventId = opts.eventId;
}

// ---- pending count (drives the honest "n pending" indicator) -----------

export async function getPendingCount(): Promise<number> {
  const [p, s] = await Promise.all([unsyncedPhotos(), unsyncedSamples()]);
  return p.length + s.length;
}

export function onPendingChange(cb: (n: number) => void): () => void {
  pendingListeners.add(cb);
  cb(lastPending);
  return () => pendingListeners.delete(cb);
}

/** Recompute pending and notify listeners. Call after a capture for immediacy. */
export async function notifyPendingChanged(): Promise<void> {
  const n = await getPendingCount();
  if (n !== lastPending) {
    lastPending = n;
    for (const cb of pendingListeners) cb(n);
  } else {
    lastPending = n;
  }
}

// ---- drain -------------------------------------------------------------

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function drainStore<T extends { clientId: string }>(
  store: "photos" | "samples",
  fetchBatch: (limit: number) => Promise<T[]>,
  send: (batch: T[]) => Promise<{ acked: string[] }>,
  batchSize: number
): Promise<void> {
  // Loop through as many batches as exist; stop on empty or on a partial ack
  // (which signals the far side pushed back — let backoff handle the rest).
  // A throw propagates to drainOnce, which schedules a silent retry.
  for (;;) {
    const batch = await fetchBatch(batchSize);
    if (batch.length === 0) return;
    const { acked } = await send(batch);
    if (acked.length > 0) await markSynced(store, acked);
    await notifyPendingChanged();
    if (acked.length < batch.length) return;
  }
}

async function drainOnce(): Promise<void> {
  if (draining) {
    rerunRequested = true; // a trigger arrived mid-drain; run once more after
    return;
  }
  if (!online()) return;

  draining = true;
  try {
    await drainStore(
      "photos",
      unsyncedPhotos,
      (b) => client.photos(userId, eventId, b),
      PHOTO_BATCH
    );
    await drainStore(
      "samples",
      unsyncedSamples,
      (b) => client.samples(userId, eventId, b),
      SAMPLE_BATCH
    );
    // Success: clear any backoff.
    backoffMs = 0;
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  } catch {
    // Silent by design. Schedule an exponential-backoff retry.
    scheduleBackoff();
  } finally {
    draining = false;
    if (rerunRequested) {
      rerunRequested = false;
      void drainOnce();
    }
  }
}

function scheduleBackoff(): void {
  backoffMs = backoffMs
    ? Math.min(backoffMs * 2, maxBackoffMs)
    : baseBackoffMs;
  if (backoffTimer) clearTimeout(backoffTimer);
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void drainOnce();
  }, backoffMs);
}

/** Kick a drain now. Safe to call from any trigger; single-flighted inside. */
export function syncNow(): void {
  void drainOnce();
}

// ---- lifecycle ---------------------------------------------------------

/**
 * Start the sync engine. Wires the 30s timer, `online`, and foreground
 * triggers, and kicks an initial drain. Returns a stop function.
 * NOTE: capture is deliberately NOT a trigger.
 */
export function startSync(opts?: {
  userId?: string;
  eventId?: string;
  client?: IngestClient;
  timerMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}): () => void {
  if (opts?.client) client = opts.client;
  if (opts?.userId) userId = opts.userId;
  if (opts?.eventId) eventId = opts.eventId;
  if (opts?.timerMs) timerMs = opts.timerMs;
  if (opts?.baseBackoffMs) baseBackoffMs = opts.baseBackoffMs;
  if (opts?.maxBackoffMs) maxBackoffMs = opts.maxBackoffMs;

  const onOnline = () => syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") syncNow();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
  }
  intervalTimer = setInterval(() => syncNow(), timerMs);

  // Prime the indicator and attempt an initial drain.
  void notifyPendingChanged();
  syncNow();

  return function stop() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    }
    if (intervalTimer) clearInterval(intervalTimer);
    intervalTimer = null;
    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = null;
  };
}
