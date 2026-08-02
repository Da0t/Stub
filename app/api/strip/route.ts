import { renderStrip } from '@/lib/render/strip';
import { FRAME_VARIANTS, type CardRenderInput } from '@/lib/render/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isCard(value: unknown): value is CardRenderInput {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return typeof card.photoUrl === 'string'
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
