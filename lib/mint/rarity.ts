import type { SetRecord } from './contracts';

type RaritySet = SetRecord & { hasSurpriseGuest?: boolean };

const AUDIENCE_MIN = 300;
const AUDIENCE_MAX = 80_000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Log scale keeps meaningful separation among small stages without flattening headliners. */
function inverseAudienceScore(audience: number): number {
  const bounded = Math.max(AUDIENCE_MIN, Math.min(AUDIENCE_MAX, audience));
  const normalized =
    (Math.log(bounded) - Math.log(AUDIENCE_MIN)) /
    (Math.log(AUDIENCE_MAX) - Math.log(AUDIENCE_MIN));
  return 1 - normalized;
}

/**
 * Scores only looked-up facts. Missing audience data removes that term and the
 * remaining weights are renormalized; no audience value is invented.
 */
export function rarityScore(
  set: SetRecord,
  ctx: { concurrentHeadlinerRunning: boolean },
): number {
  const source = set as RaritySet;
  const facts: Array<{ weight: number; value: number }> = [
    { weight: 0.18, value: set.isFestivalDebut ? 1 : 0 },
    { weight: 0.17, value: set.isFinalShow ? 1 : 0 },
    { weight: 0.1, value: ctx.concurrentHeadlinerRunning ? 1 : 0 },
  ];

  // This field is optional until the setlist feed publishes it. Missing means
  // unknown, not false, so its weight must disappear from the denominator.
  if (typeof source.hasSurpriseGuest === 'boolean') {
    facts.push({ weight: 0.1, value: source.hasSurpriseGuest ? 1 : 0 });
  }

  if (set.estimatedAudience !== null && Number.isFinite(set.estimatedAudience) && set.estimatedAudience > 0) {
    facts.push({ weight: 0.45, value: inverseAudienceScore(set.estimatedAudience) });
  } else {
    // Across an audience-less grid, headliner status is the only deterministic
    // crowd-size signal available in the frozen contract.
    facts.push({ weight: 0.15, value: set.isHeadliner ? 0 : 1 });
  }

  const totalWeight = facts.reduce((sum, fact) => sum + fact.weight, 0);
  const weighted = facts.reduce((sum, fact) => sum + fact.weight * fact.value, 0);
  return clamp01(totalWeight === 0 ? 0 : weighted / totalWeight);
}
