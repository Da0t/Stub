import type { CardState, SetId } from './contracts';

export interface MintMachineState {
  state: CardState;
  setId: SetId | null;
  cardId: string | null;
  error: string | null;
}

export type MintMachineEvent =
  | { type: 'ELIGIBILITY_CHANGED'; eligible: boolean; setId: SetId | null }
  | { type: 'SPIN' }
  | { type: 'CLAIMED'; cardId: string }
  | { type: 'CLAIM_FAILED'; message: string }
  | { type: 'RESET' };

export const initialMintState: MintMachineState = {
  state: 'LOCKED',
  setId: null,
  cardId: null,
  error: null,
};

export function mintMachineReducer(
  current: MintMachineState,
  event: MintMachineEvent,
): MintMachineState {
  switch (event.type) {
    case 'ELIGIBILITY_CHANGED':
      if (current.state === 'MINTED' || current.state === 'SPINNING') return current;
      // Once earned, leaving the polygon or set window cannot forfeit the card.
      // A separate UI session may RESET after the sheet closes, while the
      // pending-mint record and server remain authoritative across restarts.
      if (current.state === 'AVAILABLE') return current;
      return event.eligible && event.setId
        ? { state: 'AVAILABLE', setId: event.setId, cardId: null, error: null }
        : initialMintState;
    case 'SPIN':
      return current.state === 'AVAILABLE'
        ? { ...current, state: 'SPINNING', error: null }
        : current;
    case 'CLAIMED':
      return current.state === 'SPINNING'
        ? { ...current, state: 'MINTED', cardId: event.cardId, error: null }
        : current;
    case 'CLAIM_FAILED':
      return current.state === 'SPINNING'
        ? { ...current, state: 'AVAILABLE', error: event.message }
        : current;
    case 'RESET':
      return initialMintState;
  }
}

export interface PendingMintRecord {
  setId: SetId;
  claimedAt: number | null;
}

export interface PendingMintStorage {
  read(setId: SetId): PendingMintRecord | null;
  write(record: PendingMintRecord): void;
  remove(setId: SetId): void;
}

export function browserPendingMintStorage(prefix = 'wrapped:pending-mint:'): PendingMintStorage {
  const storage = () => {
    try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
  };
  return {
    read(setId) {
      let raw: string | null | undefined;
      try { raw = storage()?.getItem(prefix + setId); } catch { return null; }
      if (!raw) return null;
      try {
        const value = JSON.parse(raw) as PendingMintRecord;
        return value.setId === setId && (value.claimedAt === null
          || (typeof value.claimedAt === 'number' && Number.isFinite(value.claimedAt) && value.claimedAt >= 0))
          ? value : null;
      } catch {
        return null;
      }
    },
    write(record) {
      try { storage()?.setItem(prefix + record.setId, JSON.stringify(record)); } catch { /* server remains source of truth */ }
    },
    remove(setId) {
      try { storage()?.removeItem(prefix + setId); } catch { /* no-op */ }
    },
  };
}

export function persistAvailable(storage: PendingMintStorage, setId: SetId): void {
  if (!storage.read(setId)) storage.write({ setId, claimedAt: null });
}

export function persistClaimed(
  storage: PendingMintStorage,
  setId: SetId,
  claimedAt = Date.now(),
): void {
  storage.write({ setId, claimedAt });
}
