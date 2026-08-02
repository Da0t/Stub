import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import { drawCardLayers } from './core';
import { fonts, palette, SHARE_HEIGHT, SHARE_WIDTH } from './theme';
import { fitText } from './theme/typography';
import type { CardRenderInput, RenderContext } from './types';

const stripCache = new Map<string, Buffer>();
let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  // Theme packs can add licensed .ttf files at these stable locations. The
  // renderer explicitly registers them when present and otherwise uses the
  // bundled system-safe fallbacks defined by the theme.
  for (const [path, family] of [
    ['public/theme/outside-lands-2026/display.ttf', 'OSL Display'],
    ['public/theme/outside-lands-2026/hand.ttf', 'OSL Hand'],
  ] as const) {
    try { GlobalFonts.registerFromPath(path, family); } catch { /* optional theme asset */ }
  }
}

function cacheKey(cards: readonly CardRenderInput[]): string {
  return createHash('sha256').update(JSON.stringify(cards)).digest('hex');
}

const MAX_REMOTE_PHOTO_BYTES = 8 * 1024 * 1024;
const REMOTE_PHOTO_TIMEOUT_MS = 2_000;

export function isPrivateOrReservedAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (/^(?:fc|fd|fe[89ab]|ff)/.test(normalized)) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateOrReservedAddress(mapped) : false;
  }
  return true;
}

async function resolvesOnlyToPublicAddresses(hostname: string): Promise<boolean> {
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.length > 0 && results.every(({ address }) => !isPrivateOrReservedAddress(address));
  } catch {
    return false;
  }
}

async function safeLoadImage(url: string): Promise<Image | null> {
  try {
    if (/^https?:/i.test(url)) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
      if (!(await resolvesOnlyToPublicAddresses(parsed.hostname))) return null;
      const response = await fetch(parsed, {
        signal: AbortSignal.timeout(REMOTE_PHOTO_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) return null;
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) return null;
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_REMOTE_PHOTO_BYTES) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > MAX_REMOTE_PHOTO_BYTES) return null;
      return await loadImage(bytes);
    }
    if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(url)) return await loadImage(url);
    return null;
  } catch {
    return null;
  }
}

function paperBackground(ctx: RenderContext): void {
  ctx.fillStyle = '#b88b55';
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  let state = 20260807;
  for (let index = 0; index < 9000; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const x = (state / 0xffffffff) * SHARE_WIDTH;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const y = (state / 0xffffffff) * SHARE_HEIGHT;
    ctx.fillStyle = index % 3 ? 'rgba(52,35,22,.025)' : 'rgba(255,244,214,.035)';
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.strokeStyle = 'rgba(63,39,23,.16)';
  for (let y = 150; y < SHARE_HEIGHT; y += 38) {
    ctx.beginPath();
    ctx.moveTo(35, y);
    ctx.lineTo(SHARE_WIDTH - 35, y);
    ctx.stroke();
  }
}

export function dayGroups(cards: readonly CardRenderInput[]): Array<{ label: string; cards: CardRenderInput[] }> {
  const groups = new Map<string, CardRenderInput[]>();
  let selected = 0;
  for (const card of cards) {
    let group = groups.get(card.dateLabel);
    if (!group) {
      if (groups.size >= 3) continue;
      group = [];
      groups.set(card.dateLabel, group);
    }
    if (group.length >= 4) continue;
    group.push(card);
    selected += 1;
    if (selected === 12) break;
  }
  return Array.from(groups, ([label, values]) => ({ label, cards: values }));
}

/** Server-side 1080×1920 PNG renderer. Input-content cached for repeat Wrapped views. */
export async function renderStrip(cards: CardRenderInput[]): Promise<Buffer> {
  if (!Array.isArray(cards)) throw new TypeError('cards must be an array');
  registerFonts();
  const groups = dayGroups(cards);
  const key = cacheKey(groups.flatMap((group) => group.cards));
  const cached = stripCache.get(key);
  if (cached) return cached;

  const canvas = createCanvas(SHARE_WIDTH, SHARE_HEIGHT);
  const ctx = canvas.getContext('2d') as unknown as RenderContext;
  paperBackground(ctx);
  ctx.fillStyle = palette.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Fit the title to the canvas instead of trusting a fixed 74px — at that size
  // the display face overflows 1080px and renders as "RAPPED FOR THE WEEKEN",
  // clipped at both ends. This is the headline of the shareable image.
  const title = fitText(ctx, 'WRAPPED FOR THE WEEKEND', {
    maxWidth: SHARE_WIDTH - 96,
    maxSize: 74,
    minSize: 40,
    maxLines: 1,
    weight: 900,
  });
  ctx.font = `900 ${title.size}px ${fonts.display}`;
  ctx.fillText(title.lines[0], SHARE_WIDTH / 2, 82);
  ctx.font = `700 27px ${fonts.sans}`;
  ctx.fillText('OUTSIDE LANDS 2026  •  GOLDEN GATE PARK', SHARE_WIDTH / 2, 139);

  const cardWidth = 274;
  const cardHeight = Math.round(cardWidth * 7 / 5);
  const gap = 44;
  const totalWidth = groups.length * cardWidth + Math.max(0, groups.length - 1) * gap;
  const startX = (SHARE_WIDTH - totalWidth) / 2;
  const startY = 236;
  const rowGap = 18;

  await Promise.all(groups.flatMap((group) => group.cards.map(async (card, row) => {
    const column = groups.indexOf(group);
    const x = startX + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + rowGap);
    const mini = createCanvas(cardWidth, cardHeight);
    const miniCtx = mini.getContext('2d') as unknown as RenderContext;
    const image = await safeLoadImage(card.photoUrl);
    drawCardLayers(miniCtx, image as unknown as { width: number; height: number } | null, card, cardWidth, cardHeight);
    ctx.drawImage(mini as unknown as CanvasImageSource, x, y, cardWidth, cardHeight);
  })));

  groups.forEach((group, column) => {
    const x = startX + column * (cardWidth + gap) + cardWidth / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(239,216,167,.92)';
    ctx.translate(x, 196);
    ctx.rotate(column % 2 ? 0.018 : -0.02);
    ctx.fillRect(-105, -24, 210, 48);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 24px ${fonts.hand}`;
    ctx.fillText(group.label, 0, 1);
    ctx.restore();
  });

  if (groups.length === 0) {
    ctx.fillStyle = 'rgba(34,27,22,.72)';
    ctx.font = `700 34px ${fonts.hand}`;
    ctx.fillText('Your field notes are waiting.', SHARE_WIDTH / 2, SHARE_HEIGHT / 2);
  }
  ctx.fillStyle = 'rgba(34,27,22,.78)';
  ctx.font = `700 20px ${fonts.sans}`;
  ctx.fillText('PHOTOS, PLACE & TIME  /  ONE WEEKEND IN THE PARK', SHARE_WIDTH / 2, SHARE_HEIGHT - 63);

  const png = canvas.toBuffer('image/png');
  stripCache.set(key, png);
  if (stripCache.size > 12) stripCache.delete(stripCache.keys().next().value as string);
  return png;
}

export function clearStripCache(): void {
  stripCache.clear();
}
