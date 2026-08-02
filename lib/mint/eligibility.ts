import { CARD_MINT_DWELL_SECONDS } from '@/lib/dwell/thresholds';
import type { CardState, SetId, StageId } from './contracts';

export interface EligibilityArgs {
  stageId: StageId | null;
  setId: SetId | null;
  dwellSeconds: number;
  hasPhotoInWindow: boolean;
  alreadyMinted: boolean;
}

/** All conditions are facts calculated elsewhere; this function only gates them. */
export function checkEligibility(args: EligibilityArgs): CardState {
  const hasLocationAndWindow = args.stageId !== null && args.setId !== null;
  const hasEnoughObservedDwell =
    Number.isFinite(args.dwellSeconds) && args.dwellSeconds >= CARD_MINT_DWELL_SECONDS;

  return hasLocationAndWindow &&
    hasEnoughObservedDwell &&
    args.hasPhotoInWindow &&
    !args.alreadyMinted
    ? 'AVAILABLE'
    : 'LOCKED';
}
