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

const LOS_ANGELES_HOUR = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Los_Angeles',
});

function localHour(timestamp: number): number {
  const hour = LOS_ANGELES_HOUR.format(timestamp);
  return Number(hour);
}

/** Contextual, deterministic selection. `field_notes` is never in the draw. */
export function pickFrameVariant(
  set: SetRecord,
  _rarity: number,
  seed: string,
): FrameVariant {
  const weights = { ...BASE_WEIGHTS };
  if (set.isHeadliner) weights.ranger_badge *= 2;
  if (set.estimatedAudience !== null && set.estimatedAudience <= 3_000) {
    weights.trail_marker *= 2;
  }
  if (localHour(set.startTime) >= 19) weights.fog_layer *= 2.5;
  // Reserve an absolute 5% probability before normalizing contextual weights.
  // Boosting a headliner or night frame must never suppress the joke card.
  const roll = hashToUnitInterval(seed);
  if (roll < BASE_WEIGHTS.disco_bison) return 'disco_bison';
  const entries = (Object.entries(weights) as Array<[MintedFrameVariant, number]>)
    .filter(([variant]) => variant !== 'disco_bison');
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = ((roll - BASE_WEIGHTS.disco_bison) / (1 - BASE_WEIGHTS.disco_bison)) * total;
  for (const [variant, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return variant;
  }
  return 'ranger_badge';
}
