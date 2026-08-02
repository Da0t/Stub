import { drawCardLayers } from './core';
import { CARD_HEIGHT, CARD_WIDTH, DEFAULT_SCALE } from './theme';
import type { CardRenderInput } from './types';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadBrowserImage(url: string): Promise<HTMLImageElement> {
  const existing = imageCache.get(url);
  if (existing) return existing;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(url)) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load card photo: ${url.slice(0, 80)}`));
    image.src = url;
  });
  imageCache.set(url, pending);
  pending.catch(() => imageCache.delete(url));
  return pending;
}

/** Client-side, offline-capable canvas renderer. Does not mutate input or call fetch. */
export async function renderCard(
  input: Readonly<CardRenderInput>,
  canvas: HTMLCanvasElement,
  scale = DEFAULT_SCALE,
): Promise<void> {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('scale must be a positive number');
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  const image = await loadBrowserImage(input.photoUrl);
  canvas.width = Math.round(CARD_WIDTH * scale);
  canvas.height = Math.round(CARD_HEIGHT * scale);
  canvas.style.aspectRatio = '5 / 7';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawCardLayers(ctx, image, input);
}

export function clearCardImageCache(): void {
  imageCache.clear();
}
