# Project checklist — everything this needs to be real

Status marks reflect what was **verified by running it**, not what exists as a file.
✅ done and checked · ⚠️ partially there · ❌ not started · 🔒 blocked on someone else

Last verified 2026-08-02, 88 tests passing, build green, 14 routes.

---

## 1. Credentials and access

- [x] ✅ `OPENAI_API_KEY` — verified: 125 models, `/api/ai/narrative` returns lines in 4.4s
- [x] ✅ `JAMBASE_API_KEY` — verified: real 2026 lineup, artist `sameAs`, tour dates
- [ ] 🔒 **Convex CLI authorized** — `~/.convex/config.json` holds a token for a *different* account than team bryan-pham. `npx convex dev` needs a human login. **Everything in §3 is downstream of this.**
- [x] ✅ `.env.local` populated and gitignored (verified absent from all commits)
- [x] ✅ `.env.example` committed, enumerated from `git grep process.env`
- [ ] ❌ Both keys rotated after the event — they were pasted in plaintext chat
- [ ] Vercel account for HTTPS phone testing (`getUserMedia` needs a secure context; a LAN IP will not work). CLI not installed: `npm i -g vercel`
- [x] **Not needed:** a Spotify API key. IDs come free from JamBase `sameAs`; the tap-through is a plain `open.spotify.com/artist/{id}` link. Don't let anyone build OAuth.

---

## 2. Repo and build health

- [x] ✅ All eight path branches merged into `main`
- [x] ✅ `npm test` — 88 passing, one runner (vitest)
- [x] ✅ `npm run build` — succeeds, 14 routes
- [x] ✅ `npx tsc --noEmit` — clean
- [x] ✅ Dev server boots, all 8 pages return 200
- [ ] ⚠️ `convex` and `scripts` are **excluded** from typecheck — a temporary workaround for missing codegen. Re-include after §3.1
- [ ] ❌ `convex/_generated/` un-ignored and committed (Convex docs require it in the repo)
- [ ] Path branches rebased onto `main` before anyone continues on one, or they rebuild against stale code

---

## 3. The integration joins — where the work actually is

Every path built against fixtures. Nothing is joined. This is the remaining project.

### 3.1 Convex live 🔒
- [ ] `npx convex dev` — interactive login, team bryan-pham
- [ ] `convex/_generated/api.d.ts` has real per-function types, **not `AnyApi`**
- [ ] Schema pushed; every index in CONTRACTS §8 exists
- [ ] `ConvexClientProvider` mounted in `app/layout.tsx` (exists in `lib/convex/client.tsx`, **currently never mounted**) — without disturbing the PWA manifest or safe-area insets the camera depends on
- [ ] Reactivity proven: two browser windows, mutate in one, the other updates with no refresh
- [ ] `deviceId` identity — UUID in localStorage → `users` row. No login screen.
- [ ] A way to switch to the seeded demo user (the demo seam depends on it)

### 3.2 Ingest 🔒
- [ ] `setIngestClient` actually called — it is exported from `lib/offline/sync.ts` and **never invoked**, which is why a photo clears to "synced" with nothing persisted
- [ ] Hardcoded `"local-device"` / `"local-event"` replaced with real ids
- [ ] Blob upload via Convex file storage → `blobRef`
- [ ] Idempotency proven: drain the same batch twice, row count unchanged
- [ ] Offline promise intact: airplane mode → 10 photos → force-quit → reopen → all present → network on → all sync exactly once
- [ ] Shutter still never waits on network

### 3.3 Grid ⚠️
- [x] ✅ JamBase client fixed — `api.data.jambase.com/v3`, Bearer auth
- [ ] Bootstrap actually run against the live API
- [ ] **Careful:** `normalize.ts` drops any set whose stage has no polygon, and JamBase supplies no stage names. Back up `data/grid.sample.json` and diff before overwriting — a blind run can empty the grid the demo reads.
- [x] ✅ `api.grid.bootstrap` exists — the earlier naming mismatch with `upsertEvent`/`upsertStages`/`upsertSets` is fixed
- [ ] `CONVEX_URL` set — `bootstrap-grid.ts` reads it with **no fallback**; without it the Convex write silently skips

### 3.4 Shelf and mint 🔒
- [ ] `app/shelf/page.tsx:90` swapped off `createFixtureMintClient`
- [ ] `mintableNow` / `mint.claim` against real data
- [ ] Two devices, same set, two visibly different cards

### 3.5 Wrapped 🔒
- [ ] Real `DerivedSignals` → narrative → strip, end to end
- [ ] Pre-generated and cached for the seeded user. **Zero live API calls in the demo path** — the narrative call takes 4.4s, which feels like four minutes in front of judges.

---

## 4. The core invariant — verify these hold

> Deterministic code decides what happened. The model only writes the sentence around it.

- [x] ✅ Stage resolution is point-in-polygon, offline, deterministic
- [x] ✅ Artist resolution is a table lookup against the cached grid
- [x] ✅ Dwell is arithmetic over samples; gaps >5 min are never interpolated
- [x] ✅ Null is a valid answer — off-stage points never snap to a stage
- [ ] Removing `OPENAI_API_KEY` changes **no number anywhere** — only prose. Test this explicitly.
- [ ] Every number in generated copy traces to an input stat (digit-scan post-check)
- [ ] No task is completable by tapping a button — verification is a query over `cards`

---

## 5. Honesty ledger — what we can and cannot claim

- [ ] **Set times and stage assignments are synthesized.** JamBase gives artists and day-level dates only — no stage, no times. Artists, days and headliners (Charli XCX / The Strokes / RÜFÜS DU SOL) are real and match the live API.
- [ ] Decision made on how to close it: ask Andy Gadiel · scrape the published stage schedule · or say plainly that the grid is modeled
- [ ] `_provenance` carried on records so nothing overclaims by accident
- [ ] Whoever demos knows which parts are real, in one sentence, without hedging

---

## 6. Demo readiness

- [ ] Seeded user: 3 days, 11 sets, ~49 photos weighted toward people, uneven dwell, at least one >5 min gap
- [ ] The specific numbers behind the headline lines are true of the seed (47 minutes, 43 vs 6 photos, four unknown artists)
- [ ] Real photographs in the seed, not grey rectangles
- [ ] Coordinate spoof to a stage polygon — invisible to the audience, 100% reliable
- [ ] **The seam rehearsed**: live capture → seeded Wrapped. Know the exact taps. Demos die here.
- [ ] Strip pre-rendered and cached — never render live on stage
- [ ] Run the whole demo once with the network off
- [ ] Run it once with `OPENAI_API_KEY` unset
- [ ] Phone charged, screen brightness up, notifications off
- [ ] Deployed to an HTTPS URL and opened on the actual demo phone

---

## 7. The talk track

- [ ] *"Spotify knows what you played. It doesn't know what you chose."*
- [ ] *"Playing a song costs you nothing. Attending a set costs you every other set in that window."*
- [ ] *"Two people at the same set walk away with different objects."* — said while it happens on two phones
- [ ] *"Capture is fully offline, and that's deliberate — the network at a 75,000-person festival is gone."*
- [ ] *"We didn't build navigation. The festival app already does that. We built the part nobody owns."*
- [ ] *"Deterministic code decides what happened. The model only writes the sentence around it."*
- [ ] *"The festival ends Sunday at 10PM and every other product goes dark. Monday morning is unclaimed."*
- [ ] Sponsors visible in the pitch, not buried: JamBase decides what is true · Convex holds what you collected · OpenAI describes what it sees

---

## 8. Known gaps worth naming before a judge does

- [ ] Narrative voice is stat-readout (*"Your average completion rate is 0.82"*) rather than the spec's *"You stayed 47 minutes. You meant to stay 20."* Numbers are correct; the prompt needs work.
- [ ] The strip caps at 4 cards per day / 12 total and truncates silently — fine for the seed's shape, but it is an undocumented cap
- [ ] `estimatedAudience` is `null` from JamBase, so rarity loses its strongest term unless another source fills it
- [ ] No vision pass has run against real photos yet

---

## 9. Cut order if the clock wins

Per the plan, in order: **artist tasks → extra frame variants → dwell.**

**Never cut:** capture, resolution, or the strip. Steps 1 and 2 are the entire trick; the strip is the artifact that gets posted.
