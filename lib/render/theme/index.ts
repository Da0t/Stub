import type { FrameMetrics, RenderContext } from '../types';

export const CARD_WIDTH = 500;
export const CARD_HEIGHT = 700;
export const CARD_RATIO = CARD_WIDTH / CARD_HEIGHT;
export const DEFAULT_SCALE = 2;
export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1920;
export const RARITY_THRESHOLD = 0.7;

export const palette = {
  forest: '#173f35',
  deepForest: '#0b2925',
  cream: '#f2e6c8',
  kraft: '#b98f59',
  ink: '#221b16',
  orange: '#d35c32',
  gold: '#d9aa4f',
  fog: '#dce5df',
  sky: '#75939a',
  disco: '#d8e8eb',
  white: '#fffdf7',
} as const;

export const fonts = {
  display: 'Georgia, Times New Roman, serif',
  sans: 'Arial, Helvetica, sans-serif',
  hand: 'Comic Sans MS, Segoe Print, cursive',
} as const;

export function metrics(width = CARD_WIDTH, height = CARD_HEIGHT): FrameMetrics {
  return { width, height, unit: width / CARD_WIDTH };
}

export function roundedRect(
  ctx: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic texture avoids a visibly changing card on every render. */
export function drawGrain(
  ctx: RenderContext,
  m: FrameMetrics,
  seed: string,
  opacity = 0.055,
  count = 850,
): void {
  let state = hashText(seed) || 1;
  ctx.save();
  ctx.fillStyle = `rgba(20, 16, 12, ${opacity})`;
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const x = (state / 0xffffffff) * m.width;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const y = (state / 0xffffffff) * m.height;
    const size = (index % 3 === 0 ? 1.4 : 0.7) * m.unit;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}
