import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawCardLayers, drawPhotoCover } from './core';
import { fogIntensity } from './frames/fog';
import { shouldDrawRarity } from './frames/shared';
import { CARD_HEIGHT, CARD_WIDTH, metrics } from './theme';
import { ARTIST_TEXT_STYLES, fitArtistText, fitText } from './theme/typography';
import { FRAME_VARIANTS, type CardRenderInput, type RenderContext } from './types';
import { clearCardImageCache, renderCard } from './renderCard';

const photo = 'data:image/png;base64,unused-in-this-test';

const base: CardRenderInput = {
  photoUrl: photo,
  frameVariant: 'ranger_badge',
  artistName: 'Godspeed You! Black Emperor',
  stageName: 'Lands End',
  dateLabel: 'Fri Aug 7',
  setWindowLabel: '7:40 – 8:55 PM',
  dwellLabel: '47 min',
  rarityScore: 0.9,
  themePack: 'outside-lands-2026',
};

describe('card layer engine', () => {
  afterEach(() => {
    clearCardImageCache();
    vi.unstubAllGlobals();
  });
  it('renders every variant from the same input without mutation', async () => {
    const image = createCanvas(800, 600);
    const imageContext = image.getContext('2d');
    imageContext.fillStyle = '#75939a';
    imageContext.fillRect(0, 0, 800, 600);
    for (const frameVariant of FRAME_VARIANTS) {
      const input = Object.freeze({ ...base, frameVariant });
      const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
      const ctx = canvas.getContext('2d') as unknown as RenderContext;
      expect(() => drawCardLayers(ctx, image as never, input)).not.toThrow();
      expect(canvas.toBuffer('image/png').byteLength).toBeGreaterThan(5_000);
    }
  });

  it('center-crops landscape and portrait photos to 5:7', () => {
    const calls: unknown[][] = [];
    const ctx = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as RenderContext;
    drawPhotoCover(ctx, { width: 1400, height: 700 });
    drawPhotoCover(ctx, { width: 500, height: 1400 });
    expect(calls[0].slice(1)).toEqual([450, 0, 500, 700, 0, 0, 500, 700]);
    expect(calls[1].slice(1)).toEqual([0, 350, 500, 700, 0, 0, 500, 700]);
  });

  it('fits the required long artist name in no more than two lines', () => {
    const ctx = createCanvas(500, 700).getContext('2d') as unknown as RenderContext;
    const fitted = fitText(ctx, base.artistName, { maxWidth: 350, maxSize: 48, minSize: 18 });
    ctx.font = `800 ${fitted.size}px Georgia`;
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines.every((line) => ctx.measureText(line).width <= 350)).toBe(true);
  });

  it('fits the required long artist name inside every frame-specific text box', () => {
    const ctx = createCanvas(500, 700).getContext('2d') as unknown as RenderContext;
    for (const variant of FRAME_VARIANTS) {
      const style = ARTIST_TEXT_STYLES[variant];
      const fitted = fitArtistText(ctx, variant, base.artistName.toUpperCase(), metrics());
      ctx.font = `${style.weight} ${fitted.size}px ${style.family}`;
      expect(fitted.lines.length, variant).toBeLessThanOrEqual(2);
      expect(fitted.lines.every((line) => ctx.measureText(line).width <= style.maxWidth), variant).toBe(true);
    }
  });

  it('renders a blob URL without making a network request', async () => {
    const gradient = { addColorStop: vi.fn() };
    const context = new Proxy<Record<string, unknown>>({}, {
      get(target, property) {
        if (property in target) return target[property as string];
        if (property === 'createLinearGradient') return () => gradient;
        if (property === 'measureText') return (value: string) => ({ width: value.length * 7 });
        return () => undefined;
      },
      set(target, property, value) { target[property as string] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    class OfflineImage {
      width = 900;
      height = 600;
      decoding = '';
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        expect(value).toBe('blob:http://localhost/offline-photo');
        queueMicrotask(() => this.onload?.());
      }
    }
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('Image', OfflineImage);
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
    const canvas = {
      width: 0, height: 0, style: { aspectRatio: '' }, getContext: () => context,
    } as unknown as HTMLCanvasElement;
    await renderCard({ ...base, photoUrl: 'blob:http://localhost/offline-photo' }, canvas);
    expect(canvas.width).toBe(1_000);
    expect(canvas.height).toBe(1_400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fact-driven treatments', () => {
  it('uses a strict rarity threshold', () => {
    expect(shouldDrawRarity(0.5)).toBe(false);
    expect(shouldDrawRarity(0.7)).toBe(false);
    expect(shouldDrawRarity(0.9)).toBe(true);
  });

  it('makes evening fog stronger than afternoon fog', () => {
    expect(fogIntensity('8:00 – 9:00 PM')).toBeGreaterThan(fogIntensity('2:00 – 3:00 PM'));
    expect(fogIntensity('unknown')).toBe(0.52);
  });
});
