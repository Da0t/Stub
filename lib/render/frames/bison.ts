import type { FrameLayers, FrameMetrics, RenderContext } from '../types';
import { drawGrain, fonts, palette } from '../theme';
import { drawCenteredLines, fitArtistText } from '../theme/typography';
import { drawBorder, drawInfoPill, drawRarityMark } from './shared';

function drawDiscoBall(ctx: RenderContext, m: FrameMetrics): void {
  const u = m.unit;
  const x = 407 * u;
  const y = 92 * u;
  const r = 49 * u;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = palette.disco;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const colors = ['#f9f2b8', '#afdae0', '#e8b9d5', '#8aa6b3'];
  for (let row = -3; row <= 3; row += 1) {
    for (let column = -3; column <= 3; column += 1) {
      ctx.fillStyle = colors[Math.abs(row * 3 + column) % colors.length];
      ctx.fillRect(x + column * 15 * u - 6 * u, y + row * 15 * u - 6 * u, 11 * u, 11 * u);
    }
  }
  ctx.restore();
  ctx.strokeStyle = palette.white;
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, y - r);
  ctx.stroke();
}

function drawBison(ctx: RenderContext, m: FrameMetrics): void {
  const u = m.unit;
  ctx.save();
  ctx.translate(78 * u, 530 * u);
  ctx.fillStyle = palette.deepForest;
  ctx.beginPath();
  ctx.ellipse(55 * u, 30 * u, 55 * u, 31 * u, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(13 * u, 23 * u, 28 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(30 * u, 48 * u, 10 * u, 33 * u);
  ctx.fillRect(82 * u, 48 * u, 9 * u, 31 * u);
  ctx.strokeStyle = palette.gold;
  ctx.lineWidth = 4 * u;
  ctx.beginPath();
  ctx.arc(-4 * u, 10 * u, 19 * u, 3.7, 5.6);
  ctx.stroke();
  ctx.restore();
}

export const bisonFrame: FrameLayers = {
  treatment(ctx, input, m) {
    const gradient = ctx.createLinearGradient(0, 0, m.width, m.height);
    gradient.addColorStop(0, 'rgba(211,92,50,0.15)');
    gradient.addColorStop(0.55, 'rgba(73,34,93,0.12)');
    gradient.addColorStop(1, 'rgba(11,41,37,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, m.width, m.height);
    drawGrain(ctx, m, `${input.artistName}:bison`, 0.06, 1000);
  },
  chrome(ctx, input, m) {
    drawBorder(ctx, m, palette.orange, 16, 11);
    drawBorder(ctx, m, palette.gold, 30, 3);
    drawDiscoBall(ctx, m);
    drawBison(ctx, m);
    drawInfoPill(ctx, input, m, { fill: palette.orange, ink: palette.white });
  },
  text(ctx, input, m) {
    const u = m.unit;
    const fitted = fitArtistText(ctx, 'disco_bison', input.artistName.toUpperCase(), m);
    ctx.save();
    ctx.shadowColor = palette.orange;
    ctx.shadowOffsetX = 3 * u;
    ctx.shadowOffsetY = 3 * u;
    ctx.fillStyle = palette.white;
    drawCenteredLines(ctx, fitted, m.width / 2, 460 * u, 43 * u, fonts.sans, 900);
    ctx.shadowColor = 'transparent';
    ctx.font = `800 ${13 * u}px ${fonts.sans}`;
    ctx.fillStyle = palette.gold;
    ctx.fillText(`${input.stageName.toUpperCase()} • PARK AFTER DARK`, m.width / 2, 519 * u);
    ctx.restore();
    drawRarityMark(ctx, input, m, { x: 54 * u, y: 55 * u, color: palette.deepForest, fill: palette.gold });
  },
};
