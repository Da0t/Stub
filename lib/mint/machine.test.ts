import { describe, expect, it } from 'vitest';
import {
  initialMintState,
  browserPendingMintStorage,
  mintMachineReducer,
  persistAvailable,
  persistClaimed,
  type PendingMintRecord,
  type PendingMintStorage,
} from './machine';

function memoryStorage(): PendingMintStorage {
  const values = new Map<string, PendingMintRecord>();
  return {
    read: (id) => values.get(id) ?? null,
    write: (record) => values.set(record.setId, record),
    remove: (id) => { values.delete(id); },
  };
}

describe('mint machine', () => {
  it('allows only LOCKED → AVAILABLE → SPINNING → MINTED', () => {
    const available = mintMachineReducer(initialMintState, {
      type: 'ELIGIBILITY_CHANGED', eligible: true, setId: 'set-1',
    });
    const spinning = mintMachineReducer(available, { type: 'SPIN' });
    const minted = mintMachineReducer(spinning, { type: 'CLAIMED', cardId: 'card-1' });
    expect([available.state, spinning.state, minted.state]).toEqual(['AVAILABLE', 'SPINNING', 'MINTED']);
    expect(mintMachineReducer(minted, { type: 'SPIN' })).toBe(minted);
  });

  it('returns a failed claim to AVAILABLE so an earned card is not lost', () => {
    const available = mintMachineReducer(initialMintState, {
      type: 'ELIGIBILITY_CHANGED', eligible: true, setId: 'set-1',
    });
    const spinning = mintMachineReducer(available, { type: 'SPIN' });
    expect(mintMachineReducer(spinning, { type: 'CLAIM_FAILED', message: 'offline' })).toMatchObject({
      state: 'AVAILABLE', setId: 'set-1', error: 'offline',
    });
  });

  it('never revokes AVAILABLE when live eligibility later disappears', () => {
    const available = mintMachineReducer(initialMintState, {
      type: 'ELIGIBILITY_CHANGED', eligible: true, setId: 'set-1',
    });
    expect(mintMachineReducer(available, {
      type: 'ELIGIBILITY_CHANGED', eligible: false, setId: null,
    })).toBe(available);
  });

  it('persists AVAILABLE and then records an immutable claim marker', () => {
    const storage = memoryStorage();
    persistAvailable(storage, 'set-1');
    expect(storage.read('set-1')).toEqual({ setId: 'set-1', claimedAt: null });
    persistAvailable(storage, 'set-1');
    persistClaimed(storage, 'set-1', 123);
    expect(storage.read('set-1')).toEqual({ setId: 'set-1', claimedAt: 123 });
  });

  it('restores AVAILABLE through a fresh browser adapter after reload', () => {
    const values = new Map<string, string>();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      } },
    });
    try {
      persistAvailable(browserPendingMintStorage(), 'set-reload');
      expect(browserPendingMintStorage().read('set-reload')).toEqual({ setId: 'set-reload', claimedAt: null });
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    }
  });
});
