"use client";

import type { ReactNode } from "react";

export function SwipeDeck({ children }: { children: ReactNode }) {
  return (
    <main className="swipeDeck" aria-label="Your festival Wrapped">
      {children}
    </main>
  );
}

export function DeckCard({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="deckCard" aria-label={label}>
      {children}
      <span className="swipeHint" aria-hidden="true">swipe</span>
    </section>
  );
}
