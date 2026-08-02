import { NextResponse } from "next/server";
import { classifyBurst } from "@/lib/ai/vision";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { photos?: Array<{ id?: unknown; dataUrl?: unknown }> };
  const photos = (body.photos ?? []).filter(
    (photo): photo is { id: string; dataUrl: string } => typeof photo.id === "string" && typeof photo.dataUrl === "string",
  );
  if (photos.length === 0) return NextResponse.json({ error: "photos must contain an id and dataUrl" }, { status: 400 });
  return NextResponse.json(await classifyBurst(photos));
}
