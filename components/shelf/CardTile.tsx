'use client';

import { useEffect, useRef } from 'react';
import type { CardRenderInput, ShelfCard } from '@/lib/mint/contracts';
import styles from './shelf.module.css';

export type CardRenderer = (
  input: CardRenderInput,
  canvas: HTMLCanvasElement,
  scale?: number,
) => Promise<void>;

function fallbackRender(card: ShelfCard, canvas: HTMLCanvasElement): void {
  const scale = 2;
  canvas.width = 500 * scale;
  canvas.height = 700 * scale;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(scale, scale);
  const colors: Record<string, [string, string]> = {
    ranger_badge: ['#173c2c', '#e7ddbc'],
    trail_marker: ['#6e3d20', '#f2d79b'],
    fog_layer: ['#56666b', '#e8eeea'],
    disco_bison: ['#49245e', '#f5d55b'],
    field_notes: ['#7a5a32', '#f1dfb6'],
  };
  const [background, foreground] = colors[card.frameVariant];
  context.fillStyle = background;
  context.fillRect(0, 0, 500, 700);
  context.strokeStyle = foreground;
  context.lineWidth = 8;
  context.strokeRect(18, 18, 464, 664);
  context.fillStyle = 'rgba(255,255,255,.1)';
  context.fillRect(42, 44, 416, 440);
  context.fillStyle = foreground;
  context.font = '700 38px Georgia, serif';
  context.fillText(card.artistName.slice(0, 20), 44, 550);
  context.font = '600 20px system-ui';
  context.fillText(card.stageName.toUpperCase(), 46, 589);
  context.font = '16px system-ui';
  context.fillText(`${card.dateLabel}  ·  ${card.dwellLabel}`, 46, 629);
  if (card.rarityScore > 0.7) {
    context.beginPath();
    context.arc(432, 626, 18, 0, Math.PI * 2);
    context.fill();
  }
}

export function CardTile({
  card,
  renderCard,
  onSelect,
  tabIndex = 0,
}: {
  card: ShelfCard;
  renderCard?: CardRenderer;
  onSelect(card: ShelfCard): void;
  tabIndex?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (renderCard) {
      void renderCard(card, canvas, 2).catch(() => fallbackRender(card, canvas));
    } else {
      fallbackRender(card, canvas);
    }
  }, [card, renderCard]);

  return (
    <button
      className={styles.tile}
      type="button"
      onClick={() => onSelect(card)}
      aria-label={`Open ${card.artistName} card`}
      tabIndex={tabIndex}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </button>
  );
}
