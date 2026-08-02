"use client";

import { useState } from "react";
import { DeckCard } from "./SwipeDeck";

export function StripReveal({ initialStripUrl }: { initialStripUrl: string }) {
  const [stripUrl, setStripUrl] = useState(initialStripUrl);
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      const response = await fetch("/api/strip", { method: "POST" });
      if (!response.ok) throw new Error("Strip render unavailable");
      const blob = await response.blob();
      setStripUrl(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const response = await fetch(stripUrl);
    const blob = await response.blob();
    const file = new File([blob], "outside-lands-wrapped.png", { type: blob.type || "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "My festival weekend" });
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = stripUrl;
    anchor.download = file.name;
    anchor.click();
  }

  return (
    <DeckCard label="Your shareable weekend strip">
      <div className="stripPanel">
        <p className="kicker">THREE DAYS · ONE STRIP</p>
        <img src={stripUrl} alt="Twelve-card festival weekend strip" />
        <div className="stripActions">
          <button type="button" onClick={share}>Share or download</button>
          <button type="button" className="quietButton" onClick={regenerate} disabled={busy}>
            {busy ? "Rendering…" : "Render again"}
          </button>
        </div>
      </div>
    </DeckCard>
  );
}
