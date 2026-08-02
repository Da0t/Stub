import type { FrameLayers } from '../types';
import { drawGrain, fonts, palette, roundedRect } from '../theme';
import { drawCenteredLines, fitText } from '../theme/typography';
import { drawBorder, drawInfoPill, drawRarityMark } from './shared';

export const trailFrame: FrameLayers = {
  treatment(ctx, input, m) {
    const gradient = ctx.createLinearGradient(0, m.height * 0.3, 0, m.height);
    gradient.addColorStop(0, 'rgba(68,44,28,0.03)');
    gradient.addColorStop(1, 'rgba(30,20,13,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, m.width, m.height);
    drawGrain(ctx, m, `${input.artistName}:trail`, 0.08, 1100);
  },
  chrome(ctx, input, m) {
    const u = m.unit;
    drawBorder(ctx, m, palette.kraft, 17, 9);
    ctx.save();
    roundedRect(ctx, 30 * u, 52 * u, m.width - 60 * u, 140 * u, 8 * u);
    ctx.fillStyle = '#6f452b';
    ctx.strokeStyle = palette.cream;
    ctx.lineWidth = 3 * u;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((m.width - 31 * u), 103 * u);
    ctx.lineTo((m.width - 4 * u), 122 * u);
    ctx.lineTo((m.width - 31 * u), 141 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawInfoPill(ctx, input, m, { fill: '#6f452b', ink: palette.cream });
  },
  text(ctx, input, m) {
    const u = m.unit;
    const fitted = fitText(ctx, input.artistName.toUpperCase(), {
      maxWidth: m.width - 112 * u,
      maxSize: 37 * u,
      minSize: 17 * u,
      family: fonts.display,
    });
    ctx.fillStyle = palette.cream;
    drawCenteredLines(ctx, fitted, m.width / 2 - 4 * u, 111 * u, 35 * u);
    ctx.font = `700 ${12 * u}px ${fonts.sans}`;
    ctx.fillText(`→  ${input.stageName.toUpperCase()}`, m.width / 2 - 4 * u, 169 * u);
    drawRarityMark(ctx, input, m, { x: 49 * u, y: 225 * u, color: palette.cream, fill: '#6f452b' });
  },
};
