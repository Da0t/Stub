'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderCard } from '@/lib/render/renderCard';
import { FRAME_VARIANTS, type CardRenderInput, type FrameVariant } from '@/lib/render/types';

const BASE_INPUT: CardRenderInput = {
  photoUrl: '/theme/outside-lands-2026/debug-photo.svg',
  frameVariant: 'ranger_badge',
  artistName: 'Godspeed You! Black Emperor',
  stageName: 'Lands End',
  dateLabel: 'Fri Aug 7',
  setWindowLabel: '7:40 – 8:55 PM',
  dwellLabel: '47 min',
  rarityScore: 0.9,
  themePack: 'outside-lands-2026',
};

function FramePreview({ input, selected }: { input: CardRenderInput; selected: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    setError(null);
    void renderCard(input, canvasRef.current, 2).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [input]);
  return (
    <figure style={{ margin: 0, opacity: selected ? 1 : 0.74 }}>
      <canvas
        ref={canvasRef}
        aria-label={`${input.frameVariant} frame preview`}
        style={{ display: 'block', width: 'min(250px, 100%)', borderRadius: 15, boxShadow: selected ? '0 0 0 4px #d9aa4f, 0 20px 45px #071d19' : '0 14px 35px #071d19' }}
      />
      <figcaption style={{ paddingTop: 12, font: '700 12px Arial', letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {input.frameVariant.replaceAll('_', ' ')}
      </figcaption>
      {error && <p role="alert" style={{ color: '#ffb4a0', maxWidth: 250 }}>{error}</p>}
    </figure>
  );
}

export default function FrameDebugPage() {
  const [artistName, setArtistName] = useState(BASE_INPUT.artistName);
  const [rarityScore, setRarityScore] = useState(BASE_INPUT.rarityScore);
  const [selected, setSelected] = useState<FrameVariant>('ranger_badge');
  const inputs = useMemo(() => FRAME_VARIANTS.map((frameVariant) => ({
    ...BASE_INPUT,
    artistName,
    rarityScore,
    frameVariant,
  })), [artistName, rarityScore]);

  return (
    <main style={{ minHeight: '100vh', padding: '36px clamp(20px, 4vw, 64px) 64px', color: '#f2e6c8', background: '#0b2925' }}>
      <header style={{ maxWidth: 900, marginBottom: 30 }}>
        <p style={{ margin: 0, font: '800 12px Arial', letterSpacing: 2.5, color: '#d9aa4f' }}>RENDER LAB / OUTSIDE LANDS 2026</p>
        <h1 style={{ margin: '8px 0', font: '800 clamp(36px, 6vw, 72px) Georgia' }}>Five frames. One slot contract.</h1>
        <p style={{ font: '16px/1.55 Arial', maxWidth: 680 }}>Stress-test long names, the strict rarity threshold, and every layered template without waiting on upstream data.</p>
      </header>
      <section aria-label="Frame controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 22, padding: 20, marginBottom: 34, background: '#173f35', borderRadius: 14 }}>
        <label style={{ display: 'grid', gap: 7, minWidth: 280, flex: 1, font: '700 12px Arial' }}>
          ARTIST NAME
          <input value={artistName} onChange={(event) => setArtistName(event.target.value)} style={{ padding: 11, border: 0, borderRadius: 7, fontSize: 16 }} />
        </label>
        <label style={{ display: 'grid', gap: 7, minWidth: 220, font: '700 12px Arial' }}>
          RARITY {rarityScore.toFixed(2)}
          <input type="range" min="0" max="1" step="0.05" value={rarityScore} onChange={(event) => setRarityScore(Number(event.target.value))} />
        </label>
        <label style={{ display: 'grid', gap: 7, minWidth: 220, font: '700 12px Arial' }}>
          FOCUS VARIANT
          <select value={selected} onChange={(event) => setSelected(event.target.value as FrameVariant)} style={{ padding: 11, border: 0, borderRadius: 7, fontSize: 15 }}>
            {FRAME_VARIANTS.map((variant) => <option key={variant}>{variant}</option>)}
          </select>
        </label>
      </section>
      <section aria-label="All frame previews" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 28, alignItems: 'start' }}>
        {inputs.map((input) => <FramePreview key={input.frameVariant} input={input} selected={input.frameVariant === selected} />)}
      </section>
    </main>
  );
}
