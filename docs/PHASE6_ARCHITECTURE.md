# Phase 6 implementation architecture

## Domain boundary

Eligibility, rarity, variant selection, and state transitions are pure modules. They accept the frozen contracts and have no React, storage, network, or Convex dependency. Variant selection uses a stable hash of `(userId, setId)`; it never uses `Math.random`, and `field_notes` is absent from the draw.

The isolated branch does not contain path 4's canonical `lib/types.ts`, so `lib/mint/contracts.ts` contains structural copies. Integration is a direct import swap, not a data conversion. Likewise `lib/dwell/thresholds.ts` is the minimal shared-constant scaffold demanded by the path plan.

## Persistence and claims

`mintMachineReducer` encodes the only permitted flow: `LOCKED → AVAILABLE → SPINNING → MINTED`. A failed request returns to `AVAILABLE`. `PendingMintStorage` is an adapter with a browser implementation; the same interface can be backed by path 1's IndexedDB `pendingMints` store. Claim submission has an in-flight guard, and the development adapter rechecks `(userId, setId)` after asynchronous latency to prove fast duplicate calls reconcile to one card. The server remains the source of truth and must also dedupe.

## UI integration

`MintClient` is the seam for path 4. This branch ships a reactive in-memory implementation; the integrated implementation supplies hooks backed by `useQuery(api.queries.shelf)`, `useQuery(api.queries.mintableNow)`, and `useMutation(api.mint.claim)`. Reactivity therefore belongs to the data source, not a polling effect in the UI.

`CardTile` accepts path 7's `renderCard` contract. Its internal canvas renderer is an explicit fallback for isolated development. `SpinSheet` waits one 1.5-second beat while the claim runs, skips the wait for reduced-motion users, never suggests the user can lose, and is dismissible at any time.
