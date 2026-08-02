// lib/offline/db.ts
//
// IndexedDB layer for capture & offline core (path 1).
// Owns the DB schema (v1) and every published store accessor.
//
// Invariants:
//   - Nothing here awaits a fetch. Everything works with the network off.
//   - `putPhoto` resolves only after the record is durably in IndexedDB.
//
// Encoding note: IndexedDB cannot index boolean values (a boolean is not a
// valid key), so the contract's `synced` index would silently index nothing.
// We store `synced` as 0|1 on disk so the index is real and queryable, and
// convert back to boolean at the API boundary so every returned object
// matches the CONTRACTS §2 types exactly.

import type { CapturedPhoto, DwellSample, Grid } from "@/lib/types";

const DB_NAME = "capture-offline";
const DB_VERSION = 1;

const SYNCED_UNSET = 0;
const SYNCED_SET = 1;

type StoredPhoto = Omit<CapturedPhoto, "synced"> & { synced: 0 | 1 };
type StoredSample = Omit<DwellSample, "synced"> & { synced: 0 | 1 };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable (server or unsupported context).")
    );
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("photos")) {
        const photos = db.createObjectStore("photos", { keyPath: "clientId" });
        photos.createIndex("ts", "ts", { unique: false });
        photos.createIndex("synced", "synced", { unique: false });
      }
      if (!db.objectStoreNames.contains("samples")) {
        const samples = db.createObjectStore("samples", {
          keyPath: "clientId",
        });
        samples.createIndex("ts", "ts", { unique: false });
        samples.createIndex("synced", "synced", { unique: false });
      }
      if (!db.objectStoreNames.contains("grid")) {
        db.createObjectStore("grid", { keyPath: "festivalId" });
      }
      // pendingMints schema is owned in spirit by path 6; path 1 owns db.ts and
      // therefore creates the v1 store so a later path never needs a migration.
      if (!db.objectStoreNames.contains("pendingMints")) {
        const pending = db.createObjectStore("pendingMints", {
          keyPath: "setId",
        });
        pending.createIndex("claimedAt", "claimedAt", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab triggers a version change, close so it isn't blocked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () =>
      reject(new Error("IndexedDB open blocked by another connection"));
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

// ---- encoding helpers --------------------------------------------------

function encodePhoto(p: CapturedPhoto): StoredPhoto {
  return { ...p, synced: p.synced ? SYNCED_SET : SYNCED_UNSET };
}
function decodePhoto(s: StoredPhoto): CapturedPhoto {
  return { ...s, synced: s.synced === SYNCED_SET };
}
function encodeSample(s: DwellSample): StoredSample {
  return { ...s, synced: s.synced ? SYNCED_SET : SYNCED_UNSET };
}
function decodeSample(s: StoredSample): DwellSample {
  return { ...s, synced: s.synced === SYNCED_SET };
}

// ---- photos ------------------------------------------------------------

export async function putPhoto(p: CapturedPhoto): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").put(encodePhoto(p));
  // Resolve on tx.oncomplete, i.e. once the write is durable — not on the
  // request's success, which fires before the transaction commits.
  await txDone(tx);
}

export async function allPhotos(): Promise<CapturedPhoto[]> {
  const db = await openDb();
  const tx = db.transaction("photos", "readonly");
  const rows = await reqDone(tx.objectStore("photos").getAll());
  return (rows as StoredPhoto[]).map(decodePhoto);
}

export async function unsyncedPhotos(limit?: number): Promise<CapturedPhoto[]> {
  return unsynced("photos", limit).then((rows) =>
    (rows as StoredPhoto[]).map(decodePhoto)
  );
}

// ---- samples -----------------------------------------------------------

export async function putSample(s: DwellSample): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("samples", "readwrite");
  tx.objectStore("samples").put(encodeSample(s));
  await txDone(tx);
}

export async function allSamples(): Promise<DwellSample[]> {
  const db = await openDb();
  const tx = db.transaction("samples", "readonly");
  const rows = await reqDone(tx.objectStore("samples").getAll());
  return (rows as StoredSample[]).map(decodeSample);
}

export async function unsyncedSamples(limit?: number): Promise<DwellSample[]> {
  return unsynced("samples", limit).then((rows) =>
    (rows as StoredSample[]).map(decodeSample)
  );
}

// ---- shared unsynced cursor -------------------------------------------

async function unsynced(
  store: "photos" | "samples",
  limit?: number
): Promise<unknown[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const index = tx.objectStore(store).index("synced");
  const range = IDBKeyRange.only(SYNCED_UNSET);
  const out: unknown[] = [];
  const cursorReq = index.openCursor(range);
  await new Promise<void>((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || (limit !== undefined && out.length >= limit)) {
        resolve();
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    cursorReq.onerror = () =>
      reject(cursorReq.error ?? new Error("IndexedDB cursor failed"));
  });
  return out;
}

// ---- mark synced -------------------------------------------------------

export async function markSynced(
  store: "photos" | "samples",
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  // Issue every get synchronously and flip+put inside each get's onsuccess.
  // Never await mid-transaction: an await can let IndexedDB auto-commit the
  // transaction before the follow-up put on some browsers (notably Safari).
  for (const id of ids) {
    const getReq = os.get(id);
    getReq.onsuccess = () => {
      const rec = getReq.result as StoredPhoto | StoredSample | undefined;
      if (rec) {
        rec.synced = SYNCED_SET;
        os.put(rec);
      }
    };
  }
  await txDone(tx);
}

// ---- grid --------------------------------------------------------------

export async function saveGrid(g: Grid): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("grid", "readwrite");
  tx.objectStore("grid").put(g);
  await txDone(tx);
}

export async function loadGrid(): Promise<Grid | null> {
  const db = await openDb();
  const tx = db.transaction("grid", "readonly");
  const rows = await reqDone(tx.objectStore("grid").getAll());
  return (rows as Grid[])[0] ?? null;
}
