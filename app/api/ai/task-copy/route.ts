import { NextResponse } from "next/server";
import { writeTaskCopy } from "@/lib/ai/taskCopy";
import type { SetForCopy } from "@/lib/ai/domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    intent?: unknown; set?: SetForCopy; reward?: unknown; verification?: unknown;
  };
  if (typeof body.intent !== "string" || !body.set || typeof body.set.artistName !== "string") {
    return NextResponse.json({ error: "intent and set are required" }, { status: 400 });
  }
  const reward = typeof body.reward === "string" ? body.reward : "the selected reward";
  const verification = typeof body.verification === "string" ? body.verification : undefined;
  return NextResponse.json(await writeTaskCopy(body.intent, body.set, reward, verification));
}
