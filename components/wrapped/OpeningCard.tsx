import { DeckCard } from "./SwipeDeck";

export function OpeningCard(props: { imageUrl: string; artistName: string; stageName: string; dateLabel: string }) {
  return (
    <DeckCard label={`A card from ${props.artistName}`}>
      <div className="openingFrame">
        {/* The URL is a pre-rendered path-7 card in production and an embedded offline seed in the demo. */}
        <img src={props.imageUrl} alt={`Festival card for ${props.artistName}`} />
        <div className="engraving">
          <strong>{props.artistName}</strong>
          <span>{props.stageName} · {props.dateLabel}</span>
        </div>
      </div>
    </DeckCard>
  );
}
