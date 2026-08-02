import { NextResponse } from "next/server";
import { classifyBurst } from "@/lib/ai/vision";
import { InvalidRequestError, isRecord, readJson, shortString } from "@/lib/ai/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 12_000_000);
    if (!isRecord(body) || !Array.isArray(body.photos) || body.photos.length < 1 || body.photos.length > 8) {
      throw new InvalidRequestError("photos must contain 1 to 8 images");
    }
    const photos = body.photos.map((value) => {
      if (!isRecord(value) || !shortString(value.id, 128) || !shortString(value.dataUrl, 1_500_000)
        || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value.dataUrl)) {
        throw new InvalidRequestError("Each photo needs a short id and a PNG, JPEG, or WebP data URL");
      }
      return { id: value.id, dataUrl: value.dataUrl };
    });
    if (new Set(photos.map(({ id }) => id)).size !== photos.length) throw new InvalidRequestError("Photo ids must be unique");
    return NextResponse.json(await classifyBurst(photos));
  } catch (error) {
    const message = error instanceof InvalidRequestError ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
