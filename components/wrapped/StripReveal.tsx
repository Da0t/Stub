"use client";

import { DeckCard } from "./SwipeDeck";

/** The demo receives a pre-generated strip, so revealing it never waits on an API. */
export function StripReveal({ initialStripUrl }: { initialStripUrl: string }) {
  async function share() {
    const response = await fetch(initialStripUrl);
    const blob = await response.blob();
    const file = new File([blob], "outside-lands-wrapped.png", { type: blob.type || "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "My festival weekend" });
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = initialStripUrl;
    anchor.download = file.name;
    anchor.click();
  }

  return (
    <DeckCard label="Your shareable weekend strip">
      <div className="stripPanel">
        <p className="kicker">THREE DAYS · ONE STRIP</p>
        <img src={initialStripUrl} alt="Twelve-card festival weekend strip" />
        <div className="stripActions">
          <button type="button" onClick={share}>Share or download</button>
        </div>
      </div>
    </DeckCard>
  );
}
