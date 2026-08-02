'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CardTile, type CardRenderer } from '@/components/shelf/CardTile';
import { useMintClient } from '@/lib/mint/client';
import type { CardRenderInput, Mintable, SetRecord, ShelfCard } from '@/lib/mint/contracts';
import {
  browserPendingMintStorage,
  initialMintState,
  mintMachineReducer,
  persistAvailable,
  persistClaimed,
} from '@/lib/mint/machine';
import { pickFrameVariant } from '@/lib/mint/variants';
import { useDialogFocus } from '@/lib/mint/useDialogFocus';
import styles from './mint.module.css';

function labels(set: SetRecord, dwellSeconds: number) {
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  }).format(set.startTime);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  });
  return {
    dateLabel: date,
    setWindowLabel: `${time.format(set.startTime)} – ${time.format(set.endTime)}`,
    dwellLabel: `${Math.max(1, Math.round(dwellSeconds / 60))} min`,
  };
}

export function SpinSheet({
  mintable,
  set,
  userSeed,
  photoUrl,
  stageName,
  themePack = 'outside-lands-2026',
  renderCard,
  onClose,
}: {
  mintable: Mintable | null;
  set: SetRecord | null;
  userSeed: string;
  photoUrl: string;
  stageName: string;
  themePack?: string;
  renderCard?: CardRenderer;
  onClose(): void;
}) {
  const { claim } = useMintClient();
  const [machine, dispatch] = useReducer(mintMachineReducer, initialMintState);
  const [card, setCard] = useState<ShelfCard | null>(null);
  const inFlight = useRef<Promise<ShelfCard> | null>(null);
  const storage = useMemo(() => browserPendingMintStorage(), []);
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(mintable && set), onClose);
  const variant = useMemo(
    () => mintable && set
      ? pickFrameVariant(set, mintable.rarityScore, `${userSeed}:${mintable.setId}`)
      : 'ranger_badge',
    [mintable, set, userSeed],
  );

  useEffect(() => {
    dispatch({ type: 'RESET' });
    setCard(null);
    if (!mintable) return;
    persistAvailable(storage, mintable.setId);
    dispatch({ type: 'ELIGIBILITY_CHANGED', eligible: true, setId: mintable.setId });
  }, [mintable, storage]);

  if (!mintable || !set) return null;
  const renderInput: CardRenderInput = {
    photoUrl,
    frameVariant: variant,
    artistName: mintable.artistName,
    stageName,
    ...labels(set, mintable.dwellSeconds),
    rarityScore: mintable.rarityScore,
    themePack,
  };

  const spin = async () => {
    if (machine.state !== 'AVAILABLE' || inFlight.current) return;
    dispatch({ type: 'SPIN' });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimumReveal = reducedMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 1_500));
    const request = claim({ mintable, frameVariant: variant, renderInput });
    inFlight.current = request;
    try {
      const [claimed] = await Promise.all([request, minimumReveal]);
      setCard(claimed);
      persistClaimed(storage, mintable.setId);
      dispatch({ type: 'CLAIMED', cardId: claimed.id });
      if ('vibrate' in navigator) navigator.vibrate(35);
    } catch (error) {
      dispatch({
        type: 'CLAIM_FAILED',
        message: error instanceof Error ? error.message : 'Could not claim the card. Try again.',
      });
    } finally {
      inFlight.current = null;
    }
  };

  return (
    <div className={styles.sheetBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spin-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} />
        <button className={styles.dismiss} type="button" onClick={onClose} aria-label="Close">×</button>
        {machine.state === 'MINTED' && card ? (
          <div className={styles.result}>
            <p className={styles.kicker}>IT’S YOURS</p>
            <h2 id="spin-title">{card.artistName}</h2>
            <div className={styles.landedCard}>
              <CardTile card={card} renderCard={renderCard} onSelect={() => undefined} />
            </div>
            <p>One set. Your photo. Your card.</p>
            <button className={styles.primary} type="button" onClick={onClose}>See it on my shelf</button>
          </div>
        ) : (
          <div className={styles.ready}>
            <p className={styles.kicker}>PRESENCE VERIFIED</p>
            <h2 id="spin-title">Your {mintable.artistName} card is ready.</h2>
            <p>The card is already earned. The reveal only shows which frame you got.</p>
            <div className={`${styles.cardSilhouette} ${machine.state === 'SPINNING' ? styles.spinning : ''}`}>
              <span>{machine.state === 'SPINNING' ? 'Revealing…' : mintable.artistName}</span>
            </div>
            {machine.error && <p className={styles.error} role="alert">{machine.error}</p>}
            <button
              className={styles.primary}
              type="button"
              onClick={() => void spin()}
              disabled={machine.state !== 'AVAILABLE'}
            >
              {machine.state === 'SPINNING' ? 'Landing your card…' : 'Reveal my frame'}
            </button>
            <button className={styles.later} type="button" onClick={onClose}>Later — it will wait</button>
          </div>
        )}
      </section>
    </div>
  );
}
