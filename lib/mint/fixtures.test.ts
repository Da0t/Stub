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

  it('drops unknown optional facts instead of treating them as false', () => {
    const unknown = rarityScore({ ...base, estimatedAudience: 1_000 }, { concurrentHeadlinerRunning: false });
    const knownAbsent = rarityScore(
      { ...base, estimatedAudience: 1_000, hasSurpriseGuest: false } as SetRecord,
      { concurrentHeadlinerRunning: false },
    );
    expect(unknown).toBeGreaterThan(knownAbsent);
    expect(rarityScore({ ...base, estimatedAudience: 0 }, { concurrentHeadlinerRunning: false }))
      .toBe(rarityScore({ ...base, estimatedAudience: null }, { concurrentHeadlinerRunning: false }));
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

  it('keeps disco bison near five percent even when other variants are boosted', () => {
    const contextual = { ...base, isHeadliner: true, estimatedAudience: 900 };
    const results = Array.from({ length: 10_000 }, (_, index) =>
      pickFrameVariant(contextual, 0.95, `distribution-user-${index}:set-1`),
    );
    const ratio = results.filter((variant) => variant === 'disco_bison').length / results.length;
    expect(ratio).toBeGreaterThan(0.04);
    expect(ratio).toBeLessThan(0.06);
  });

  it('biases headliners, small stages, and night sets toward their contextual frames', () => {
    const seeds = Array.from({ length: 12_000 }, (_, index) => `bias-user-${index}:set-1`);
    const count = (set: SetRecord, variant: string) => seeds
      .filter((seed) => pickFrameVariant(set, 0.5, seed) === variant).length;
    const neutral = {
      ...base,
      startTime: Date.parse('2026-08-08T20:00:00Z'),
      estimatedAudience: 10_000,
      isHeadliner: false,
    };
    expect(count({ ...neutral, isHeadliner: true }, 'ranger_badge')).toBeGreaterThan(count(neutral, 'ranger_badge'));
    expect(count({ ...neutral, estimatedAudience: 1_000 }, 'trail_marker')).toBeGreaterThan(count(neutral, 'trail_marker'));
    expect(count({ ...neutral, startTime: Date.parse('2026-08-09T03:00:00Z') }, 'fog_layer'))
      .toBeGreaterThan(count(neutral, 'fog_layer'));
  });

  it('produces collection variety across users while remaining stable per user', () => {
    const variants = Array.from({ length: 200 }, (_, index) =>
      pickFrameVariant(base, 0.5, `different-user-${index}:${base.id}`),
    );
    expect(new Set(variants).size).toBeGreaterThan(2);
  });
});
