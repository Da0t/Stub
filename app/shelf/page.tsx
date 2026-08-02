'use client';

import { useMemo, useState } from 'react';
import { MintPrompt } from '@/components/mint/MintPrompt';
import { SpinSheet } from '@/components/mint/SpinSheet';
import { CardDetail } from '@/components/shelf/CardDetail';
import { CardTile } from '@/components/shelf/CardTile';
import { createFixtureMintClient, MintClientProvider, useMintClient } from '@/lib/mint/client';
import type { Mintable, SetRecord, ShelfCard } from '@/lib/mint/contracts';
import styles from './page.module.css';

const SETS: Record<string, SetRecord> = {
  'set-amama': {
    id: 'set-amama', stageId: 'duboce', artistName: 'Amaarae',
    startTime: Date.parse('2026-08-08T02:10:00Z'), endTime: Date.parse('2026-08-08T03:05:00Z'),
    slotIndex: 5, isHeadliner: false, estimatedAudience: 1_200, isFestivalDebut: true,
    isFinalShow: false, genreTags: ['alté', 'pop'], jambaseArtistId: null, spotifyId: null,
    nextTourDate: null,
  },
  'set-parcels': {
    id: 'set-parcels', stageId: 'sutro', artistName: 'Parcels',
    startTime: Date.parse('2026-08-09T01:40:00Z'), endTime: Date.parse('2026-08-09T02:55:00Z'),
    slotIndex: 4, isHeadliner: false, estimatedAudience: 8_500, isFestivalDebut: false,
    isFinalShow: false, genreTags: ['disco', 'indie'], jambaseArtistId: null, spotifyId: null,
    nextTourDate: null,
  },
};

const MINTABLES: Mintable[] = [{
  setId: 'set-amama', stageId: 'duboce', artistName: 'Amaarae', photoClientId: 'photo-live-1',
  dwellSeconds: 2_820, rarityScore: 0.84, state: 'AVAILABLE',
}];

const INITIAL_SHELF: ShelfCard[] = [{
  id: 'card-parcels', setId: 'set-parcels', mintedAt: Date.parse('2026-08-09T03:00:00Z'),
  dwellSeconds: 3_780, photoUrl: '', frameVariant: 'fog_layer', artistName: 'Parcels', stageName: 'Sutro',
  dateLabel: 'Sat, Aug 8', setWindowLabel: '6:40 PM – 7:55 PM', dwellLabel: '63 min', rarityScore: 0.46,
  themePack: 'outside-lands-2026',
}];

function ShelfContent() {
  const { shelf, mintableNow } = useMintClient();
  const [selected, setSelected] = useState<ShelfCard | null>(null);
  const [spinning, setSpinning] = useState<Mintable | null>(null);
  const ordered = useMemo(
    () => [...(shelf ?? [])].sort((a, b) => b.mintedAt - a.mintedAt),
    [shelf],
  );
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div><p>OUTSIDE LANDS · 2026</p><h1>Your shelf</h1></div>
        <span className={styles.count}>{ordered.length} {ordered.length === 1 ? 'moment' : 'moments'}</span>
      </header>
      {shelf === undefined ? (
        <div className={styles.loading}>Finding your cards…</div>
      ) : ordered.length === 0 ? (
        <div className={styles.empty}><p><span>✦</span>Nothing yet. Go stand in front of something.</p></div>
      ) : (
        <section className={styles.grid} aria-label="Minted cards">
          {ordered.map((card) => (
            <CardTile key={card.setId} card={card} onSelect={setSelected} />
          ))}
        </section>
      )}
      <MintPrompt mintables={mintableNow} onOpen={setSpinning} />
      <CardDetail card={selected} onClose={() => setSelected(null)} />
      <SpinSheet
        mintable={spinning}
        set={spinning ? SETS[spinning.setId] : null}
        userSeed="fixture-device-01"
        photoUrl=""
        stageName="Duboce Triangle"
        onClose={() => setSpinning(null)}
      />
    </main>
  );
}

export default function ShelfPage() {
  const client = useMemo(
    () => createFixtureMintClient({ shelf: INITIAL_SHELF, mintableNow: MINTABLES, latencyMs: 180 }),
    [],
  );
  return (
    <MintClientProvider client={client} userId="fixture-device-01">
      <ShelfContent />
    </MintClientProvider>
  );
}
