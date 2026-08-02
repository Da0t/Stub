import { DeckCard } from "./SwipeDeck";

export interface NextShow {
  artistName: string;
  dateLabel: string;
  venue: string;
  city: string;
  spotifyUrl: string;
}

export function LastCard({ show }: { show: NextShow }) {
  return (
    <DeckCard label={`Hear ${show.artistName} before their next show`}>
      <div className="lastCard">
        <p>You spent the most time with {show.artistName}.</p>
        <h2>{show.venue}<br /><span>{show.city} · {show.dateLabel}</span></h2>
        <a href={show.spotifyUrl} target="_blank" rel="noreferrer">Hear them first ↗</a>
      </div>
    </DeckCard>
  );
}
