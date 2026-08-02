export type FrameVariant =
  | 'ranger_badge'
  | 'trail_marker'
  | 'fog_layer'
  | 'disco_bison'
  | 'field_notes';

/** Frozen rendering boundary shared with minting and Wrapped. */
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

export const FRAME_VARIANTS: readonly FrameVariant[] = [
  'ranger_badge',
  'trail_marker',
  'fog_layer',
  'disco_bison',
  'field_notes',
] as const;

/** Canvas subset shared by the browser and @napi-rs/canvas. */
export type RenderContext = CanvasRenderingContext2D;

export interface FrameMetrics {
  width: number;
  height: number;
  unit: number;
}

export interface FrameLayers {
  treatment(ctx: RenderContext, input: Readonly<CardRenderInput>, metrics: FrameMetrics): void;
  chrome(ctx: RenderContext, input: Readonly<CardRenderInput>, metrics: FrameMetrics): void;
  text(ctx: RenderContext, input: Readonly<CardRenderInput>, metrics: FrameMetrics): void;
}
