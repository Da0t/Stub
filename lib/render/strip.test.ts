import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { POST } from '@/app/api/strip/route';
import { clearStripCache, dayGroups, isPrivateOrReservedAddress, renderStrip } from './strip';
import type { CardRenderInput } from './types';

const photoCanvas = createCanvas(500, 700);
const photoContext = photoCanvas.getContext('2d');
photoContext.fillStyle = '#75939a';
photoContext.fillRect(0, 0, 500, 700);
photoContext.fillStyle = '#173f35';
photoContext.fillRect(80, 210, 340, 490);
const photo = photoCanvas.toDataURL('image/png');

function seededCards(count = 11): CardRenderInput[] {
  const variants = ['ranger_badge', 'fog_layer', 'disco_bison', 'trail_marker'] as const;
  const days = ['Fri Aug 7', 'Sat Aug 8', 'Sun Aug 9'];
  return Array.from({ length: count }, (_, index) => ({
    photoUrl: photo,
    frameVariant: variants[index % variants.length],
    artistName: index === 0 ? 'Godspeed You! Black Emperor' : `Festival Artist ${index + 1}`,
    stageName: ['Lands End', 'Twin Peaks', 'Sutro'][index % 3],
    dateLabel: days[Math.min(2, Math.floor(index / 4))],
    setWindowLabel: '7:40 – 8:55 PM',
    dwellLabel: `${20 + index * 3} min`,
    rarityScore: index % 2 ? 0.5 : 0.9,
    themePack: 'outside-lands-2026',
  }));
}

function pngDimensions(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('share strip', () => {
  it('renders the seeded eleven cards as a 1080×1920 PNG in under three seconds', async () => {
    clearStripCache();
    const started = performance.now();
    const png = await renderStrip(seededCards());
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(pngDimensions(png)).toEqual([1080, 1920]);
  }, 10_000);

  it('caches identical input and gracefully renders empty input', async () => {
    clearStripCache();
    const cards = seededCards(2);
    const first = await renderStrip(cards);
    const second = await renderStrip(cards);
    expect(second).toBe(first);
    expect(pngDimensions(await renderStrip([]))).toEqual([1080, 1920]);
  });

  it('selects four cards from each of three days even when the first day is overfull', () => {
    const cards = [
      ...seededCards(8).map((card) => ({ ...card, dateLabel: 'Fri Aug 7' })),
      ...seededCards(6).map((card) => ({ ...card, dateLabel: 'Sat Aug 8' })),
      ...seededCards(5).map((card) => ({ ...card, dateLabel: 'Sun Aug 9' })),
    ];
    expect(dayGroups(cards).map((group) => [group.label, group.cards.length])).toEqual([
      ['Fri Aug 7', 4], ['Sat Aug 8', 4], ['Sun Aug 9', 4],
    ]);
  });

  it('classifies private and reserved network targets', () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '169.254.169.254', '192.168.1.2', '::1', 'fd00::1', 'fe80::1']) {
      expect(isPrivateOrReservedAddress(address), address).toBe(true);
    }
    expect(isPrivateOrReservedAddress('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('serves PNG and rejects malformed route input', async () => {
    clearStripCache();
    const routeStarted = performance.now();
    const response = await POST(new Request('http://localhost/api/strip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cards: seededCards(11) }),
    }));
    expect(response.status).toBe(200);
    expect(performance.now() - routeStarted).toBeLessThan(3_000);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(pngDimensions(Buffer.from(await response.arrayBuffer()))).toEqual([1080, 1920]);

    const invalid = await POST(new Request('http://localhost/api/strip', {
      method: 'POST',
      body: JSON.stringify({ cards: [{ artistName: 'missing slots' }] }),
    }));
    expect(invalid.status).toBe(422);

    const unsafePhoto = seededCards(1);
    unsafePhoto[0].photoUrl = 'file:///etc/passwd';
    const unsafe = await POST(new Request('http://localhost/api/strip', {
      method: 'POST',
      body: JSON.stringify({ cards: unsafePhoto }),
    }));
    expect(unsafe.status).toBe(422);

    unsafePhoto[0].photoUrl = 'https://[::1]/private.png';
    const privateHost = await POST(new Request('http://localhost/api/strip', {
      method: 'POST',
      body: JSON.stringify({ cards: unsafePhoto }),
    }));
    expect(privateHost.status).toBe(422);

    const oversized = await POST(new Request('http://localhost/api/strip', {
      method: 'POST',
      headers: { 'content-length': String(13 * 1024 * 1024) },
      body: '{}',
    }));
    expect(oversized.status).toBe(413);

    const longText = seededCards(1);
    longText[0].artistName = 'x'.repeat(161);
    const longTextResponse = await POST(new Request('http://localhost/api/strip', {
      method: 'POST', body: JSON.stringify({ cards: longText }),
    }));
    expect(longTextResponse.status).toBe(422);
  });
});
