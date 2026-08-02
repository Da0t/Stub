'use client';

import { useEffect, useState } from 'react';
import type { ShelfCard } from '@/lib/mint/contracts';
import { useDialogFocus } from '@/lib/mint/useDialogFocus';
import { CardTile, type CardRenderer } from './CardTile';
import styles from './shelf.module.css';

export function CardDetail({
  card,
  renderCard,
  onClose,
}: {
  card: ShelfCard | null;
  renderCard?: CardRenderer;
  onClose(): void;
}) {
  const [showBack, setShowBack] = useState(false);
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(card), onClose);
  useEffect(() => setShowBack(false), [card]);
  if (!card) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.detail}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.artistName} card detail`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className={`${styles.flip} ${showBack ? styles.flipped : ''}`}>
          <div className={styles.flipFront}>
            <CardTile
              card={card}
              renderCard={renderCard}
              onSelect={() => setShowBack(true)}
              tabIndex={showBack ? -1 : 0}
            />
          </div>
          <button
            type="button"
            className={styles.flipBack}
            onClick={() => setShowBack(false)}
            aria-label="Show card front"
            aria-hidden={!showBack}
            tabIndex={showBack ? 0 : -1}
          >
            <p className={styles.eyebrow}>YOU WERE THERE</p>
            <h2>{card.artistName}</h2>
            <dl>
              <div><dt>Stage</dt><dd>{card.stageName}</dd></div>
              <div><dt>Date</dt><dd>{card.dateLabel}</dd></div>
              <div><dt>Set</dt><dd>{card.setWindowLabel}</dd></div>
              <div><dt>Observed</dt><dd>{card.dwellLabel}</dd></div>
              <div><dt>Rarity signal</dt><dd>{Math.round(card.rarityScore * 100)} / 100</dd></div>
            </dl>
            <p className={styles.factNote}>Rarity comes from attendance facts, never an assigned tier.</p>
          </button>
        </div>
        <p className={styles.flipHint}>Tap the card to flip</p>
      </section>
    </div>
  );
}
