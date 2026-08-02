import type { CardRenderInput, FrameMetrics, RenderContext } from '../types';
import { fonts, palette, RARITY_THRESHOLD, roundedRect } from '../theme';

export function shouldDrawRarity(score: number): boolean {
  return Number.isFinite(score) && score > RARITY_THRESHOLD;
}

export function drawRarityMark(
  ctx: RenderContext,
  input: Readonly<CardRenderInput>,
  m: FrameMetrics,
  options: { x?: number; y?: number; color?: string; fill?: string } = {},
): void {
  if (!shouldDrawRarity(input.rarityScore)) return;
  const u = m.unit;
  const x = options.x ?? m.width - 47 * u;
  const y = options.y ?? 46 * u;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = options.fill ?? palette.gold;
  ctx.strokeStyle = options.color ?? palette.deepForest;
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  for (let point = 0; point < 16; point += 1) {
    const angle = -Math.PI / 2 + (Math.PI * point) / 8;
    const radius = (point % 2 === 0 ? 24 : 18) * u;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // An unlabeled compass spark: the mark is visible without inventing a tier.
  ctx.fillStyle = options.color ?? palette.deepForest;
  ctx.beginPath();
  ctx.moveTo(0, -10 * u);
  ctx.lineTo(3 * u, -3 * u);
  ctx.lineTo(10 * u, 0);
  ctx.lineTo(3 * u, 3 * u);
  ctx.lineTo(0, 10 * u);
  ctx.lineTo(-3 * u, 3 * u);
  ctx.lineTo(-10 * u, 0);
  ctx.lineTo(-3 * u, -3 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawInfoPill(
  ctx: RenderContext,
  input: Readonly<CardRenderInput>,
  m: FrameMetrics,
  colors: { fill: string; ink: string },
): void {
  const u = m.unit;
  const x = 42 * u;
  const y = 608 * u;
  const width = m.width - 84 * u;
  const height = 48 * u;
  ctx.save();
  roundedRect(ctx, x, y, width, height, 11 * u);
  ctx.fillStyle = colors.fill;
  ctx.globalAlpha = 0.94;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.ink;
  ctx.font = `700 ${12 * u}px ${fonts.sans}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(input.dateLabel.toUpperCase(), x + 16 * u, y + 17 * u);
  ctx.font = `600 ${10.5 * u}px ${fonts.sans}`;
  ctx.fillText(input.setWindowLabel, x + 16 * u, y + 33 * u);
  ctx.textAlign = 'right';
  ctx.font = `800 ${12 * u}px ${fonts.sans}`;
  ctx.fillText(input.dwellLabel, x + width - 16 * u, y + 25 * u);
  ctx.restore();
}

export function drawBorder(ctx: RenderContext, m: FrameMetrics, color: string, inset = 18, width = 8): void {
  const u = m.unit;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * u;
  roundedRect(ctx, inset * u, inset * u, m.width - inset * 2 * u, m.height - inset * 2 * u, 24 * u);
  ctx.stroke();
  ctx.restore();
}
