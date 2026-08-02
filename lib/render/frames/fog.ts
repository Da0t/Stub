import type { FrameLayers } from '../types';
import { drawGrain, fonts, palette } from '../theme';
import { drawCenteredLines, fitText } from '../theme/typography';
import { drawBorder, drawInfoPill, drawRarityMark } from './shared';

export function fogIntensity(setWindowLabel: string): number {
  const match = setWindowLabel.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)/i);
  if (!match) return 0.52;
  let hour = Number(match[1]);
  if (match[2].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (match[2].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return Math.min(0.82, Math.max(0.32, 0.32 + Math.max(0, hour - 15) * 0.1));
}

export const fogFrame: FrameLayers = {
  treatment(ctx, input, m) {
    const strength = fogIntensity(input.setWindowLabel);
    const gradient = ctx.createLinearGradient(0, m.height * 0.12, m.width, m.height * 0.86);
    gradient.addColorStop(0, `rgba(235,242,237,${strength * 0.35})`);
    gradient.addColorStop(0.45, `rgba(216,229,223,${strength})`);
    gradient.addColorStop(0.7, `rgba(150,173,174,${strength * 0.42})`);
    gradient.addColorStop(1, 'rgba(18,48,47,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, m.width, m.height);
    ctx.save();
    ctx.globalAlpha = strength * 0.38;
    ctx.fillStyle = palette.white;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(m.width * (0.12 + i * 0.23), m.height * (0.27 + (i % 2) * 0.08), 130 * m.unit, 46 * m.unit, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawGrain(ctx, m, `${input.artistName}:fog`, 0.035);
  },
  chrome(ctx, input, m) {
    drawBorder(ctx, m, 'rgba(242,230,200,0.92)', 21, 4);
    drawInfoPill(ctx, input, m, { fill: palette.deepForest, ink: palette.cream });
  },
  text(ctx, input, m) {
    const u = m.unit;
    const fitted = fitText(ctx, input.artistName, {
      maxWidth: m.width - 92 * u,
      maxSize: 51 * u,
      minSize: 23 * u,
      family: fonts.display,
    });
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8 * u;
    ctx.fillStyle = palette.white;
    drawCenteredLines(ctx, fitted, m.width / 2, 522 * u, 48 * u);
    ctx.font = `700 ${13 * u}px ${fonts.sans}`;
    ctx.fillText(input.stageName.toUpperCase(), m.width / 2, 572 * u);
    ctx.restore();
    drawRarityMark(ctx, input, m, { color: palette.cream, fill: palette.forest });
  },
};
