import { renderStrip } from '@/lib/render/strip';
import { FRAME_VARIANTS, type CardRenderInput } from '@/lib/render/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isSafePhotoUrl(value: string): boolean {
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return value.length <= 12_000_000;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || /\.(?:localhost|local|internal)$/.test(hostname)) return false;
    if (hostname.includes(':') || hostname.startsWith('[')) return false;
    const octets = hostname.split('.').map(Number);
    if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const [a, b] = octets;
      if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 198 && (b === 18 || b === 19)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isCard(value: unknown): value is CardRenderInput {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return typeof card.photoUrl === 'string'
    && isSafePhotoUrl(card.photoUrl)
    && FRAME_VARIANTS.includes(card.frameVariant as CardRenderInput['frameVariant'])
    && ['artistName', 'stageName', 'dateLabel', 'setWindowLabel', 'dwellLabel', 'themePack']
      .every((key) => typeof card[key] === 'string')
    && typeof card.rarityScore === 'number'
    && Number.isFinite(card.rarityScore)
    && card.rarityScore >= 0
    && card.rarityScore <= 1;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const cards = Array.isArray(body) ? body : (body as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards) || cards.length > 12 || !cards.every(isCard)) {
    return Response.json({ error: 'Expected up to 12 valid CardRenderInput objects.' }, { status: 422 });
  }
  const png = await renderStrip(cards);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      'Content-Length': String(png.byteLength),
    },
  });
}
