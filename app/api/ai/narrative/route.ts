import { NextResponse } from "next/server";
import { writeWrapped } from "@/lib/ai/narrative";
import type { WrappedStats } from "@/lib/ai/domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { stats?: WrappedStats };
  if (!body.stats || typeof body.stats.setsAttended !== "number" || typeof body.stats.extras !== "object") {
    return NextResponse.json({ error: "stats must match the DerivedSignals contract and include extras" }, { status: 400 });
  }
  return NextResponse.json({ lines: await writeWrapped(body.stats) });
}
