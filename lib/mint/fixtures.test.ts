import { describe, expect, it } from 'vitest';
import type { SetRecord } from './contracts';
import { rarityScore } from './rarity';
import { pickFrameVariant } from './variants';

const base: SetRecord = {
  id: 'set-1', stageId: 'stage-1', artistName: 'Artist',
  startTime: Date.parse('2026-08-08T03:00:00Z'), endTime: Date.parse('2026-08-08T04:00:00Z'),
  slotIndex: 1, isHeadliner: false, estimatedAudience: 1_000, isFestivalDebut: false,
  isFinalShow: false, genreTags: [], jambaseArtistId: null, spotifyId: null, nextTourDate: null,
};

describe('rarityScore', () => {
  it('scores a genuinely smaller audience above a headliner', () => {
    const small = rarityScore({ ...base, estimatedAudience: 500 }, { concurrentHeadlinerRunning: false });
    const headliner = rarityScore(
      { ...base, id: 'headliner', estimatedAudience: 70_000, isHeadliner: true },
      { concurrentHeadlinerRunning: false },
    );
    expect(small).toBeGreaterThan(headliner);
  });

  it('renormalizes when audience is unavailable and remains bounded', () => {
    const score = rarityScore(
      { ...base, estimatedAudience: null, isFestivalDebut: true },
      { concurrentHeadlinerRunning: true },
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('pickFrameVariant', () => {
  it('is stable for the same user/set seed', () => {
    const results = Array.from({ length: 20 }, () => pickFrameVariant(base, 0.5, 'user-1:set-1'));
    expect(new Set(results).size).toBe(1);
  });

  it('never mints the Wrapped-only field_notes variant', () => {
    const results = Array.from({ length: 1_000 }, (_, index) =>
      pickFrameVariant(base, 0.5, `user-${index}:set-1`),
    );
    expect(results).not.toContain('field_notes');
    expect(results).toContain('disco_bison');
  });
});
