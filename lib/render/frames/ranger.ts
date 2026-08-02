import type { FrameLayers } from '../types';
import { drawGrain, fonts, palette, roundedRect } from '../theme';
import { drawEngravedLines, fitText } from '../theme/typography';
import { drawBorder, drawInfoPill, drawRarityMark } from './shared';

export const rangerFrame: FrameLayers = {
  treatment(ctx, input, m) {
    const gradient = ctx.createLinearGradient(0, m.height * 0.4, 0, m.height);
    gradient.addColorStop(0, 'rgba(11,41,37,0)');
    gradient.addColorStop(0.72, 'rgba(11,41,37,0.32)');
    gradient.addColorStop(1, 'rgba(11,41,37,0.75)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, m.width, m.height);
    drawGrain(ctx, m, input.artistName);
  },
  chrome(ctx, input, m) {
    const u = m.unit;
    drawBorder(ctx, m, palette.cream, 17, 10);
    drawBorder(ctx, m, palette.forest, 28, 3);
    ctx.save();
    roundedRect(ctx, 55 * u, 50 * u, m.width - 110 * u, 92 * u, 42 * u);
    ctx.fillStyle = palette.forest;
    ctx.strokeStyle = palette.cream;
    ctx.lineWidth = 4 * u;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.cream;
    ctx.font = `800 ${12 * u}px ${fonts.sans}`;
    ctx.textAlign = 'center';
    ctx.fillText('OUTSIDE LANDS • PARK PASS', m.width / 2, 76 * u);
    ctx.restore();
    drawInfoPill(ctx, input, m, { fill: palette.cream, ink: palette.forest });
  },
  text(ctx, input, m) {
    const u = m.unit;
    const fitted = fitText(ctx, input.artistName.toUpperCase(), {
      maxWidth: m.width - 145 * u,
      maxSize: 36 * u,
      minSize: 18 * u,
      family: fonts.display,
    });
    drawEngravedLines(ctx, fitted, m.width / 2, 108 * u, 34 * u, palette.cream, '#6b8977', m);
    ctx.fillStyle = palette.cream;
    ctx.font = `700 ${13 * u}px ${fonts.sans}`;
    ctx.textAlign = 'center';
    ctx.fillText(input.stageName.toUpperCase(), m.width / 2, 132 * u);
    drawRarityMark(ctx, input, m);
  },
};
