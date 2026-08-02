// lib/offline/position.ts
//
// Warm-position cache (path 1). Raw plumbing only — dwell *logic* is path 5.
//
// Responsibilities:
//   - Keep a "warm" position fresh from geolocation.watchPosition so capture()
//     can read a coordinate instantly and never stall the shutter on a fix.
//   - Persist a throttled DwellSample (~one per 60–90s) so path 5 can build
//     dwell runs. Low accuracy, generous maximumAge — we resolve meadows, not
//     metres, and the phone is already at 20% by mid-afternoon.
//   - Provide the demo coordinate-spoof affordance (query param or long-press)
//     that pins the device to a stage centroid. Deterministic and invisible.
//
// Nothing here awaits a fetch. Sample writes go to IndexedDB only.

import { putSample, loadGrid } from "@/lib/offline/db";
import type { DwellSample } from "@/lib/types";

export type WarmPosition = {
  lat: number;
  lng: number;
  accuracy: number | null;
  ts: number;
};

const DEFAULT_THROTTLE_MS = 75_000; // mid of the 60–90s window

let warm: WarmPosition | null = null;
let spoofActive = false;

let watchId: number | null = null;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let watchers = 0; // guards against double-start / early stop

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Secure context is required for the app anyway; this is a bare fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** The most recent cached position, or null before the first fix. */
export function getWarmPosition(): WarmPosition | null {
  return warm ? { ...warm } : null;
}

function storeSampleFromWarm(): void {
  if (!warm) return;
  const sample: DwellSample = {
    clientId: newClientId(),
    ts: Date.now(), // device clock — server records arrival time separately
    lat: warm.lat,
    lng: warm.lng,
    accuracy: warm.accuracy,
    synced: false,
  };
  // Fire-and-forget: an IndexedDB hiccup must never surface to the user.
  void putSample(sample).catch(() => {});
}

/**
 * Begin watching position. Returns a stop function.
 * Safe to treat as idempotent: repeated calls share one underlying watch.
 */
export function startPositionWatch(opts?: { throttleMs?: number }): () => void {
  const throttleMs = opts?.throttleMs ?? DEFAULT_THROTTLE_MS;
  watchers += 1;

  // Pick up a spoof from the URL once, on first start. Rehearsable & silent.
  if (watchers === 1) {
    applyUrlSpoof();
  }

  if (watchers === 1 && typeof navigator !== "undefined" && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // A live fix always wins over a stale one — unless we are spoofing,
        // in which case the demo coordinate must not be overwritten.
        if (spoofActive) return;
        warm = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          ts: Date.now(),
        };
      },
      () => {
        // Permission denied / position unavailable. Keep the last warm value;
        // the shutter must never block on location. The UI owns the visible
        // permission state; here we stay silent by design.
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 }
    );
  }

  // A dedicated cadence timer is more reliable than leaning on watchPosition
  // callbacks, which fire irregularly when the user is stationary. It samples
  // the current warm position (real or spoofed) roughly once per throttle.
  if (watchers === 1 && typeof setInterval !== "undefined") {
    sampleTimer = setInterval(storeSampleFromWarm, throttleMs);
  }

  let stopped = false;
  return function stop() {
    if (stopped) return;
    stopped = true;
    watchers = Math.max(0, watchers - 1);
    if (watchers === 0) {
      if (watchId !== null && navigator?.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
      if (sampleTimer !== null) clearInterval(sampleTimer);
      sampleTimer = null;
    }
  };
}

// ---- Demo coordinate spoof (dev affordance) ----------------------------
//
// The whole live demo depends on this being 100% reliable and invisible.
// Mechanism, coordinated with path 2 (polygons) and path 6 (mint):
//   - `?spoof=<lat>,<lng>`  → pin to an explicit coordinate.
//   - `?spoofStage=<idOrIndex>` → pin to that stage's centroid from the grid.
//   - setSpoofPosition()/clearSpoofPosition() → wired to a UI long-press.
// While spoofing, the warm position and every stored sample use the spoof, so
// the entire downstream fact path (resolve → dwell → mint) sees the device at
// the stage. Coordinates are [lat, lng], latitude first — always.

/** Pin the device to a coordinate. Immediately updates the warm position. */
export function setSpoofPosition(lat: number, lng: number): void {
  spoofActive = true;
  warm = { lat, lng, accuracy: null, ts: Date.now() };
}

/** Clear the spoof and hand control back to live fixes. */
export function clearSpoofPosition(): void {
  spoofActive = false;
}

/** Whether a spoof is currently pinning the position. */
export function isSpoofing(): boolean {
  return spoofActive;
}

/**
 * Pin to a stage centroid from the cached grid. Centroids are PolyPoint
 * ([lat, lng]) per CONTRACTS §1. `stage` may be a stage id or a numeric index.
 * Returns true if a matching stage was found.
 */
export async function spoofToStage(stage: string | number): Promise<boolean> {
  const grid = await loadGrid();
  if (!grid || grid.stages.length === 0) return false;
  const s =
    typeof stage === "number"
      ? grid.stages[stage]
      : grid.stages.find((g) => g.id === stage);
  if (!s) return false;
  const [lat, lng] = s.centroid;
  setSpoofPosition(lat, lng);
  return true;
}

function applyUrlSpoof(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);

  const raw = params.get("spoof");
  if (raw) {
    const [latStr, lngStr] = raw.split(",");
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setSpoofPosition(lat, lng);
      return;
    }
  }

  const stageParam = params.get("spoofStage");
  if (stageParam) {
    const asIndex = Number(stageParam);
    // async, but the URL spoof resolves quickly; warm updates when it lands.
    void spoofToStage(Number.isInteger(asIndex) ? asIndex : stageParam);
  }
}
