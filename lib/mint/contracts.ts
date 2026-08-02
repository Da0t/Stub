/**
 * Structural copies of frozen shared contracts used while path 4's lib/types.ts
 * is not present on this isolated branch. Replace these imports with lib/types
 * at integration; no runtime conversion is required.
 */
export type StageId = string;
export type SetId = string;
export type CardState = 'LOCKED' | 'AVAILABLE' | 'SPINNING' | 'MINTED';
export type FrameVariant =
  | 'ranger_badge'
  | 'trail_marker'
  | 'fog_layer'
  | 'disco_bison'
  | 'field_notes';

export interface SetRecord {
  id: SetId;
  stageId: StageId;
  artistName: string;
  startTime: number;
  endTime: number;
  slotIndex: number;
  isHeadliner: boolean;
  estimatedAudience: number | null;
  isFestivalDebut: boolean;
  isFinalShow: boolean;
  genreTags: string[];
  jambaseArtistId: string | null;
  spotifyId: string | null;
  nextTourDate: { date: number; venue: string; city: string } | null;
}

export interface Mintable {
  setId: SetId;
  stageId: StageId;
  artistName: string;
  photoClientId: string;
  dwellSeconds: number;
  rarityScore: number;
  state: CardState;
}

export interface CardRenderInput {
  photoUrl: string;
  frameVariant: FrameVariant;
  artistName: string;
  stageName: string;
  dateLabel: string;
  setWindowLabel: string;
  dwellLabel: string;
  rarityScore: number;
  themePack: string;
}

export interface ShelfCard extends CardRenderInput {
  id: string;
  setId: SetId;
  mintedAt: number;
  dwellSeconds: number;
}
