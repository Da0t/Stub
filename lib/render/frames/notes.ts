import type { FrameLayers } from '../types';
import { drawGrain, fonts, palette, roundedRect } from '../theme';
import { drawCenteredLines, fitText } from '../theme/typography';
import { drawRarityMark } from './shared';

export const notesFrame: FrameLayers = {
  treatment(ctx, input, m) {
    const u = m.unit;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(184,139,81,0.26)';
    ctx.fillRect(0, 0, m.width, m.height);
    ctx.restore();
    drawGrain(ctx, m, `${input.artistName}:notes`, 0.09, 1400);
    ctx.save();
    ctx.strokeStyle = 'rgba(34,27,22,0.16)';
    ctx.lineWidth = u;
    for (let y = 70; y < 690; y += 28) {
      ctx.beginPath();
      ctx.moveTo(18 * u, y * u);
      ctx.lineTo(m.width - 18 * u, y * u);
      ctx.stroke();
    }
    ctx.restore();
  },
  chrome(ctx, input, m) {
    const u = m.unit;
    ctx.save();
    ctx.strokeStyle = palette.cream;
    ctx.lineWidth = 12 * u;
    roundedRect(ctx, 26 * u, 54 * u, m.width - 52 * u, 450 * u, 5 * u);
    ctx.stroke();
    ctx.fillStyle = 'rgba(239,216,167,0.82)';
    ctx.translate(64 * u, 45 * u);
    ctx.rotate(-0.08);
    ctx.fillRect(-30 * u, -10 * u, 96 * u, 28 * u);
    ctx.restore();
  },
  text(ctx, input, m) {
    const u = m.unit;
    const fitted = fitText(ctx, input.artistName, {
      maxWidth: m.width - 70 * u,
      maxSize: 41 * u,
      minSize: 19 * u,
      family: fonts.hand,
    });
    ctx.save();
    ctx.fillStyle = palette.ink;
    drawCenteredLines(ctx, fitted, m.width / 2, 554 * u, 40 * u, fonts.hand, 700);
    ctx.font = `700 ${14 * u}px ${fonts.hand}`;
    ctx.fillText(`${input.dateLabel} / ${input.stageName}`, m.width / 2, 607 * u);
    ctx.font = `600 ${12 * u}px ${fonts.hand}`;
    ctx.fillText(`${input.setWindowLabel} • stayed ${input.dwellLabel}`, m.width / 2, 637 * u);
    ctx.textAlign = 'right';
    ctx.font = `700 ${11 * u}px ${fonts.sans}`;
    ctx.fillText('FIELD NOTE  /  OSL 2026', m.width - 30 * u, 674 * u);
    ctx.restore();
    drawRarityMark(ctx, input, m, { color: palette.cream, fill: palette.orange });
  },
};
