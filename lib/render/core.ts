import { frames } from './frames';
import { CARD_HEIGHT, CARD_WIDTH, metrics, palette } from './theme';
import type { CardRenderInput, RenderContext } from './types';

export interface DrawableImage {
  width: number;
  height: number;
}

export function drawPhotoCover(
  ctx: RenderContext,
  image: DrawableImage,
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
): void {
  if (!(image.width > 0 && image.height > 0)) throw new Error('Photo has invalid dimensions');
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }
  ctx.drawImage(
    image as unknown as CanvasImageSource,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

export function drawCardLayers(
  ctx: RenderContext,
  image: DrawableImage | null,
  input: Readonly<CardRenderInput>,
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
): void {
  const m = metrics(width, height);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (image) drawPhotoCover(ctx, image, width, height);
  else {
    const fallback = ctx.createLinearGradient(0, 0, width, height);
    fallback.addColorStop(0, palette.sky);
    fallback.addColorStop(1, palette.deepForest);
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, width, height);
  }
  const selected = frames[input.frameVariant];
  if (!selected) throw new Error(`Unknown frame variant: ${String(input.frameVariant)}`);
  selected.treatment(ctx, input, m);
  selected.chrome(ctx, input, m);
  selected.text(ctx, input, m);
  ctx.restore();
}
