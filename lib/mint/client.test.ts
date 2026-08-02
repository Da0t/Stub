import { describe, expect, it } from 'vitest';
import { createFixtureMintClient, type ClaimMintArgs } from './client';

const claim: ClaimMintArgs = {
  userId: 'user-1',
  mintable: {
    setId: 'set-1', stageId: 'stage-1', artistName: 'Artist', photoClientId: 'photo-1',
    dwellSeconds: 300, rarityScore: 0.4, state: 'AVAILABLE',
  },
  frameVariant: 'ranger_badge',
  renderInput: {
    photoUrl: '', frameVariant: 'ranger_badge', artistName: 'Artist', stageName: 'Stage',
    dateLabel: 'Fri Aug 7', setWindowLabel: '7:00 – 8:00 PM', dwellLabel: '5 min',
    rarityScore: 0.4, themePack: 'outside-lands-2026',
  },
};

describe('fixture claim adapter', () => {
  it('dedupes two fast claims for the same user/set pair', async () => {
    const client = createFixtureMintClient({ latencyMs: 1 });
    const [first, second] = await Promise.all([client.claim(claim), client.claim(claim)]);
    expect(first.id).toBe(second.id);
    expect(first.setId).toBe('set-1');
  });

  it('scopes dedupe to user and keeps the claimed variant authoritative', async () => {
    const client = createFixtureMintClient();
    const otherClaim: ClaimMintArgs = {
      ...claim,
      userId: 'user-2',
      frameVariant: 'disco_bison',
      renderInput: { ...claim.renderInput, photoUrl: 'blob:user-2-photo' },
    };
    const [first, second] = await Promise.all([client.claim(claim), client.claim(otherClaim)]);
    expect(first.id).not.toBe(second.id);
    expect(second.photoUrl).toBe('blob:user-2-photo');
    expect(second.frameVariant).toBe('disco_bison');
  });
});
