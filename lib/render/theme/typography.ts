import type { FrameMetrics, FrameVariant, RenderContext } from '../types';
import { fonts } from './index';

export interface FitTextOptions {
  maxWidth: number;
  maxSize: number;
  minSize: number;
  maxLines?: 1 | 2;
  family?: string;
  weight?: string | number;
}

export interface FittedText {
  lines: string[];
  size: number;
}

export const ARTIST_TEXT_STYLES: Record<FrameVariant, {
  maxWidth: number;
  maxSize: number;
  minSize: number;
  family: string;
  weight: string | number;
}> = {
  ranger_badge: { maxWidth: 355, maxSize: 36, minSize: 18, family: fonts.display, weight: 800 },
  trail_marker: { maxWidth: 388, maxSize: 37, minSize: 17, family: fonts.display, weight: 800 },
  fog_layer: { maxWidth: 408, maxSize: 51, minSize: 23, family: fonts.display, weight: 800 },
  disco_bison: { maxWidth: 410, maxSize: 47, minSize: 21, family: fonts.sans, weight: 900 },
  field_notes: { maxWidth: 430, maxSize: 41, minSize: 19, family: fonts.hand, weight: 800 },
};

function splitAtBestSpace(ctx: RenderContext, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text];
  let best = [text];
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const lines = [words.slice(0, index).join(' '), words.slice(index).join(' ')];
    const widths = lines.map((line) => ctx.measureText(line).width);
    const overflow = widths.reduce((total, width) => total + Math.max(0, width - maxWidth), 0);
    const penalty = overflow * 10 + Math.abs(widths[0] - widths[1]);
    if (penalty < bestPenalty) {
      best = lines;
      bestPenalty = penalty;
    }
  }
  return best;
}

export function fitText(ctx: RenderContext, text: string, options: FitTextOptions): FittedText {
  const family = options.family ?? fonts.display;
  const weight = options.weight ?? 800;
  const maxLines = options.maxLines ?? 2;
  for (let size = options.maxSize; size >= options.minSize; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= options.maxWidth) return { lines: [text], size };
    if (maxLines === 2) {
      const lines = splitAtBestSpace(ctx, text, options.maxWidth);
      if (lines.length === 2 && lines.every((line) => ctx.measureText(line).width <= options.maxWidth)) {
        return { lines, size };
      }
    }
  }
  return { lines: maxLines === 2 ? splitAtBestSpace(ctx, text, options.maxWidth) : [text], size: options.minSize };
}

export function fitArtistText(
  ctx: RenderContext,
  variant: FrameVariant,
  text: string,
  m: FrameMetrics,
): FittedText {
  const style = ARTIST_TEXT_STYLES[variant];
  return fitText(ctx, text, {
    maxWidth: style.maxWidth * m.unit,
    maxSize: style.maxSize * m.unit,
    minSize: style.minSize * m.unit,
    family: style.family,
    weight: style.weight,
  });
}

export function drawCenteredLines(
  ctx: RenderContext,
  fitted: FittedText,
  x: number,
  centerY: number,
  lineHeight: number,
  family: string = fonts.display,
  weight: string | number = 800,
): void {
  ctx.font = `${weight} ${fitted.size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const firstY = centerY - ((fitted.lines.length - 1) * lineHeight) / 2;
  fitted.lines.forEach((line, index) => ctx.fillText(line, x, firstY + index * lineHeight));
}

export function drawEngravedLines(
  ctx: RenderContext,
  fitted: FittedText,
  x: number,
  centerY: number,
  lineHeight: number,
  dark: string,
  light: string,
  m: FrameMetrics,
): void {
  ctx.save();
  ctx.fillStyle = light;
  drawCenteredLines(ctx, fitted, x + m.unit, centerY + m.unit, lineHeight);
  ctx.fillStyle = dark;
  drawCenteredLines(ctx, fitted, x, centerY, lineHeight);
  ctx.restore();
}
