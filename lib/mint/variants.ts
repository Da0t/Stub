import type { FrameVariant, SetRecord } from './contracts';

type MintedFrameVariant = Exclude<FrameVariant, 'field_notes'>;

const BASE_WEIGHTS: Record<MintedFrameVariant, number> = {
  ranger_badge: 0.45,
  trail_marker: 0.3,
  fog_layer: 0.2,
  disco_bison: 0.05,
};

function hashToUnitInterval(seed: string): number {
  // FNV-1a with Math.imul is stable across browsers and JS runtimes.
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function localHour(timestamp: number): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Los_Angeles',
  }).format(timestamp);
  return Number(hour);
}

/** Contextual, deterministic selection. `field_notes` is never in the draw. */
export function pickFrameVariant(
  set: SetRecord,
  rarity: number,
  seed: string,
): FrameVariant {
  const weights = { ...BASE_WEIGHTS };
  if (set.isHeadliner) weights.ranger_badge *= 2;
  if (set.estimatedAudience !== null && set.estimatedAudience <= 3_000) {
    weights.trail_marker *= 2;
  }
  if (localHour(set.startTime) >= 19) weights.fog_layer *= 2.5;
  if (rarity > 0.7) weights.trail_marker *= 1.15;

  // The joke card remains a flat five-point weight: never boosted or suppressed.
  const entries = Object.entries(weights) as Array<[MintedFrameVariant, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = hashToUnitInterval(seed) * total;
  for (const [variant, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return variant;
  }
  return 'ranger_badge';
}
