# Path 1 — Capture & Offline Core

**Branch:** `path/1-capture-offline`
**Mission:** A camera that opens instantly, writes to disk, and never once awaits the network.

> Project overview: see `README.md` on `main`. Shared types: [docs/CONTRACTS.md](docs/CONTRACTS.md). **Read the contracts before writing code.**

---

## Why this path exists

Everything else in this product is downstream of a photo with a coordinate and a timestamp on it. If capture is slow, the user stops taking photos and there is no product. If capture blocks on network, the app is dead at 2PM Saturday when 75,000 people share one cell sector.

You are also holding the single most important claim in the pitch: **capture is fully offline.** A judge who has worked events will believe the rest of the demo because of this one thing. Do not let it degrade into "offline-ish."

You own step 1 of the build order — *the* step that must never be cut.

---

## Scope

**In**
- Mobile-web camera surface via `getUserMedia`, shutter, capture-to-blob
- IndexedDB layer: `photos`, `samples`, `grid`, `pendingMints` stores
- Warm-position cache fed by `geolocation.watchPosition` (the raw plumbing — dwell *logic* is path 5)
- Service worker: app shell precache, grid cache, offline boot
- Sync engine: opportunistic, batched, idempotent drain of unsynced records
- Permission flows for camera and location, and the failure states of both

**Out**
- Dwell run building, thresholds, derived signals → **path 5**
- Point-in-polygon, stage/set resolution → **path 2**
- Anything about frames, minting, or the shelf → **paths 6 and 7**
- Convex schema and mutation internals → **path 4** (you call the mutations, you do not define them)

---

## Files you own

```
app/page.tsx                    the capture screen (root route)
app/layout.tsx                  shell, viewport meta, PWA manifest link
lib/capture/camera.ts           getUserMedia lifecycle, shutter, blob
lib/capture/useCamera.ts        React hook wrapper
lib/offline/db.ts               IndexedDB open/upgrade + all store accessors
lib/offline/sync.ts             drain loop, batching, retry, ack
lib/offline/position.ts         warm-position cache from watchPosition
public/sw.js                    service worker
public/manifest.webmanifest
```

**Do not edit:** `lib/types.ts`, `convex/*`, `lib/geo/*`, `lib/dwell/*`, `lib/render/*`.

---

## Contracts

### You publish

```ts
// lib/offline/db.ts
putPhoto(p: CapturedPhoto): Promise<void>
putSample(s: DwellSample): Promise<void>
allPhotos(): Promise<CapturedPhoto[]>
allSamples(): Promise<DwellSample[]>
unsyncedPhotos(limit?: number): Promise<CapturedPhoto[]>
unsyncedSamples(limit?: number): Promise<DwellSample[]>
markSynced(store: 'photos'|'samples', ids: string[]): Promise<void>
saveGrid(g: Grid): Promise<void>
loadGrid(): Promise<Grid | null>

// lib/offline/position.ts
startPositionWatch(opts?: { throttleMs?: number }): () => void   // returns stop fn
getWarmPosition(): { lat: number; lng: number; accuracy: number|null; ts: number } | null

// lib/capture/camera.ts
capture(): Promise<CapturedPhoto>    // writes to IndexedDB before it resolves
```

`CapturedPhoto` and `DwellSample` are defined in `docs/CONTRACTS.md` §2. Do not redefine them locally.

### You consume
- `api.ingest.photos` and `api.ingest.samples` from path 4. Both are idempotent on `clientId` — you may retry freely.
- Nothing else. If path 4 is not ready at T+60, write the sync layer against a stub that resolves after 200ms and swap it in later.

---

## Behaviour spec

- The app opens **straight to a camera**. No splash, no onboarding, no login wall. The first thing the user sees is a viewfinder.
- The shutter looks and feels like a camera. **No prompts, no tagging, no "which artist is this."** The user is at a concert in the dark; anything requiring reading is a failure.
- On capture: write `{ clientId, ts, lat, lng, accuracy, blob, synced: false }` to IndexedDB **immediately**, then resolve. Show the shutter confirmation off the IndexedDB write, not off any network call.
- **Never await network. Ever.** There is no code path in this module where a fetch is in front of a user-visible response.
- Frames are applied at **render** time, not capture time. You store the raw blob. You do not decorate it. (Path 7 owns pixels-on-photo.)

### Location at capture — read this twice

Take the **most recent cached position** rather than requesting a fresh fix. A cold GPS fix takes seconds and would stall the shutter. `startPositionWatch` is already keeping a warm position; `capture()` just reads it.

If no warm position exists yet (first seconds after app open), store the photo with `lat/lng` from the last known value, or `null` coordinates flagged for later best-effort backfill from the nearest sample by timestamp. **Never block the shutter on a fix.** A photo with no coordinate is recoverable; a shutter that hangs for four seconds is not.

### Sync

```
on any successful network check:
  drain photos  where synced = false, batched (10 at a time)
  drain samples where synced = false, batched (100 at a time)
  mark synced on ack
```

- Idempotent by client-generated id, so a retry never double-writes.
- Trigger on: app foreground, `online` event, successful Convex reconnect, and a 30s timer. Never on capture.
- Exponential backoff on failure. Failure is the normal case at the festival — it must be silent, not a toast.
- Blobs upload as files; keep the batch small enough that a 3-bar connection can finish one.

---

## Task list

### T+0 → T+25 · Scaffold and camera
- [ ] `npx create-next-app@latest` — TypeScript, App Router, Tailwind. Push scaffold to `main` early so everyone rebases once.
- [ ] `app/page.tsx`: full-bleed `<video>` element, `object-fit: cover`, `playsInline`, `muted`, `autoPlay`.
- [ ] `getUserMedia({ video: { facingMode: 'environment' }, audio: false })`.
- [ ] Shutter button: fixed bottom-center, large tap target (≥72px), safe-area inset padding.
- [ ] Capture path: draw video frame to an offscreen canvas → `canvas.toBlob('image/jpeg', 0.85)`.
- [ ] Handle: permission denied, no camera, tab backgrounded (stop tracks on `visibilitychange`, restart on return).

### T+25 → T+50 · IndexedDB
- [ ] `lib/offline/db.ts` — open DB v1, create the four stores and indexes from `docs/CONTRACTS.md` §2.
- [ ] Implement every accessor in the published contract.
- [ ] Wire `capture()` → `putPhoto()`. Verify with DevTools → Application → IndexedDB that the blob is really there.
- [ ] **Airplane-mode test now, not later.** Toggle airplane mode, take five photos, force-quit the tab, reopen. All five must still be there.

### T+50 → T+75 · Position watch
- [ ] `startPositionWatch()` — `navigator.geolocation.watchPosition` with `enableHighAccuracy: false`, `maximumAge: 60_000`.
- [ ] Throttle stored samples to one per **60–90 seconds**. Continuous high-accuracy GPS drains a phone that is already at 20% by mid-afternoon and is not needed — we are resolving meadows, not metres.
- [ ] Keep the warm position updated on *every* callback even when not storing a sample.
- [ ] Call `startPositionWatch()` once from the app shell; return the stop function for cleanup.
- [ ] Dev affordance: a query param or long-press that **spoofs coordinates to a stage polygon** centroid. The whole live demo depends on this. Coordinate the exact mechanism with path 2 and path 6.

### T+75 → T+105 · Service worker
- [ ] `public/sw.js` — precache app shell (HTML, JS, CSS, icons) on install.
- [ ] Cache-first for the shell, network-first with cache fallback for the grid.
- [ ] Register in `app/layout.tsx`. Skip-waiting + claim so updates are not stuck behind a stale worker.
- [ ] Verify: hard-reload with network off. The app must still boot to a viewfinder.

### T+105 → T+140 · Sync engine
- [ ] `lib/offline/sync.ts` — drain loop, batching, backoff, ack, `markSynced`.
- [ ] Wire to `api.ingest.photos` / `api.ingest.samples` (or the stub, if path 4 is late).
- [ ] Add a tiny, honest status indicator: `n pending`. No spinner, no modal, no error toast.
- [ ] Idempotency test: drain twice from the same unsynced set, confirm Convex row count does not double.

### T+140 → freeze · Hardening
- [ ] Rapid-fire: 20 photos in 20 seconds. No dropped writes, no UI lock.
- [ ] Memory: revoke object URLs, do not hold decoded blobs in React state.
- [ ] iOS Safari pass on a real device — this is where `getUserMedia` surprises you.
- [ ] Dark-venue check: is the shutter findable with the screen at minimum brightness?

---

## Acceptance criteria

You are done when all five hold on a **real phone**, not a laptop:

1. Opening the URL shows a live viewfinder in under two seconds.
2. Airplane mode on: take ten photos. All ten are in IndexedDB with a timestamp and a coordinate.
3. Force-quit the browser, reopen with network still off: the app boots and the ten photos are still there.
4. Turn network on: within 30 seconds all ten appear in Convex, each exactly once.
5. Drain again manually: Convex row count is unchanged.

---

## Cut lines

Cut in this order if you are behind:

1. Service worker offline boot → keep IndexedDB, lose only cold-start-while-offline. Say so honestly in the demo.
2. Backoff sophistication → a fixed 5s retry is fine.
3. Batching → send one at a time.

**Never cut:** IndexedDB write-before-resolve, or the no-await-network rule. Those two *are* the claim.

---

## Demo responsibilities

- The live portion opens on **your screen.** A judge takes a photo in the room. That moment is yours.
- Have airplane mode ready as a visible prop. Turning it on before taking the photo, out loud, is the strongest thirty seconds in the whole pitch.
- Own the sentence: *"Capture is fully offline and that is deliberate — the network at a 75,000-person festival is gone."*
- Make sure the coordinate-spoof affordance is invisible to the audience and 100% reliable to you. Rehearse it.

---

## Gotchas

- `getUserMedia` requires a **secure context**. `localhost` works; a LAN IP over plain HTTP does not. Use a Vercel preview URL on the phone. Do not burn an hour on this at 3PM.
- iOS Safari needs `playsInline` on the video element or it will try to go fullscreen.
- Blobs in IndexedDB are fine in Safari, but do not store the raw `MediaStream` or a `File` you got from a picker — normalise to `Blob`.
- `watchPosition` silently stops when the tab is backgrounded. That is expected and correct; path 5's 5-minute gap rule handles it. Do not fight it with hacks.
- Coordinates are `[lat, lng]`, latitude first, everywhere. Reversing them puts the festival in Antarctica.
- Clock skew: use `Date.now()` on the device for `ts` and let the server record its own arrival time separately. Do not rewrite device timestamps server-side — the whole fact path depends on capture-time truth.
