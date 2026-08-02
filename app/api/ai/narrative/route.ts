import { NextResponse } from "next/server";
import { writeWrapped } from "@/lib/ai/narrative";
import type { WrappedStats } from "@/lib/ai/domain";
import { finiteNumber, InvalidRequestError, isRecord, readJson } from "@/lib/ai/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 32_000);
    if (!isRecord(body) || !isRecord(body.stats)) throw new InvalidRequestError("stats are required");
    const stats = body.stats;
    const numericFields = ["totalDwellSeconds", "setsAttended", "concurrentSetsSkipped", "completionRateAvg", "fullSetCount", "stageDiversity", "nightRatio", "discoveryRate"];
    if (!numericFields.every((field) => finiteNumber(stats[field])) || !isRecord(stats.perSetSkipped)
      || !Object.values(stats.perSetSkipped).every(finiteNumber) || !isRecord(stats.extras)) {
      throw new InvalidRequestError("stats must match the DerivedSignals contract and include extras");
    }
    return NextResponse.json({ lines: await writeWrapped(stats as unknown as WrappedStats) });
  } catch (error) {
    const message = error instanceof InvalidRequestError ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
