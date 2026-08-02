import { describe, expect, it } from 'vitest';
import { CARD_MINT_DWELL_SECONDS } from '@/lib/dwell/thresholds';
import { checkEligibility, type EligibilityArgs } from './eligibility';

const eligible: EligibilityArgs = {
  stageId: 'sutro', setId: 'set-1', dwellSeconds: CARD_MINT_DWELL_SECONDS,
  hasPhotoInWindow: true, alreadyMinted: false,
};

describe('checkEligibility', () => {
  it('returns AVAILABLE only when all five conditions hold', () => {
    expect(checkEligibility(eligible)).toBe('AVAILABLE');
  });

  it.each([
    ['outside the stage polygon', { stageId: null }],
    ['outside a set window', { setId: null }],
    ['below the dwell threshold', { dwellSeconds: CARD_MINT_DWELL_SECONDS - 1 }],
    ['without a photo in the window', { hasPhotoInWindow: false }],
    ['when already minted', { alreadyMinted: true }],
  ])('is LOCKED %s', (_label, change) => {
    expect(checkEligibility({ ...eligible, ...change })).toBe('LOCKED');
  });

  it('rejects non-finite dwell', () => {
    expect(checkEligibility({ ...eligible, dwellSeconds: Number.NaN })).toBe('LOCKED');
  });
});
