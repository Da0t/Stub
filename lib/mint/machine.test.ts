import { describe, expect, it } from 'vitest';
import {
  initialMintState,
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

  it('persists AVAILABLE and then records an immutable claim marker', () => {
    const storage = memoryStorage();
    persistAvailable(storage, 'set-1');
    expect(storage.read('set-1')).toEqual({ setId: 'set-1', claimedAt: null });
    persistAvailable(storage, 'set-1');
    persistClaimed(storage, 'set-1', 123);
    expect(storage.read('set-1')).toEqual({ setId: 'set-1', claimedAt: 123 });
  });
});
