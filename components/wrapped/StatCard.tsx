import { DeckCard } from "./SwipeDeck";

export function StatCard({ line, index }: { line: string; index: number }) {
  return (
    <DeckCard label={`Weekend note ${index + 1}`}>
      <div className="fieldNote">
        <p className="kicker">FIELD NOTE {String(index + 1).padStart(2, "0")}</p>
        <h2>{line}</h2>
        <div className="rule" />
        <p className="caption">Observed from your cards and time at each set.</p>
      </div>
    </DeckCard>
  );
}
