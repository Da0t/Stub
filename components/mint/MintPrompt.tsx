'use client';

import type { Mintable } from '@/lib/mint/contracts';
import styles from './mint.module.css';

export function MintPrompt({
  mintables,
  onOpen,
}: {
  mintables: Mintable[] | undefined;
  onOpen(mintable: Mintable): void;
}) {
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
