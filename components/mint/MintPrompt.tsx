'use client';

import { useEffect, useMemo } from 'react';
import type { Mintable } from '@/lib/mint/contracts';
import { browserPendingMintStorage, persistAvailable } from '@/lib/mint/machine';
import styles from './mint.module.css';

export function MintPrompt({
  mintables,
  onOpen,
}: {
  mintables: Mintable[] | undefined;
  onOpen(mintable: Mintable): void;
}) {
  const storage = useMemo(() => browserPendingMintStorage(), []);
  useEffect(() => {
    for (const mintable of mintables ?? []) {
      if (mintable.state === 'AVAILABLE') persistAvailable(storage, mintable.setId);
    }
  }, [mintables, storage]);
  // The server query owns minted-vs-available truth. Local persistence only
  // ensures an earned unspun card survives offline; reading it during SSR would
  // also make hydration depend on device-local state.
  const available = mintables?.filter((mintable) => mintable.state === 'AVAILABLE') ?? [];
  if (available.length === 0) return null;
  const first = available[0];
  return (
    <aside className={styles.prompt} aria-live="polite">
      <div>
        <span className={styles.promptDot} aria-hidden="true" />
        <p><strong>Card ready</strong><br />{first.artistName} is waiting.</p>
      </div>
      <button type="button" onClick={() => onOpen(first)}>Reveal</button>
    </aside>
  );
}
