import { NextResponse } from "next/server";
import { writeTaskCopy } from "@/lib/ai/taskCopy";
import type { SetForCopy } from "@/lib/ai/domain";
import { finiteNumber, InvalidRequestError, isRecord, readJson, shortString } from "@/lib/ai/http";
import type { RewardType, TaskType } from "@/lib/tasks/types";

export const runtime = "nodejs";

const verificationByType: Record<TaskType, string> = {
  ATTEND_SET: "mint a card from this specific set",
  CATCH_OPENER: "mint a card from a set whose slot index is 0",
  MINT_N_ONE_DAY: "mint 3 cards inside the configured festival day",
  VISIT_NEW_STAGE: "mint at a stage absent from the fan's prior collection",
  FULL_SET_COMMITMENT: "mint this set with a completion rate of at least 0.8",
};

const rewardByType: Record<RewardType, string> = {
  exclusive_frame: "Exclusive frame",
  artist_shoutout: "Artist shoutout",
  early_access: "Early access",
  merch_code: "Merch code",
};

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 16_000);
    if (!isRecord(body) || !shortString(body.intent, 180) || !isRecord(body.set)
      || !shortString(body.set.id, 128) || !shortString(body.set.artistName, 160)
      || !shortString(body.set.stageId, 128) || !finiteNumber(body.set.startTime)
      || !finiteNumber(body.set.endTime) || !Number.isInteger(body.set.slotIndex)
      || typeof body.taskType !== "string" || !Object.hasOwn(verificationByType, body.taskType)
      || typeof body.rewardType !== "string" || !Object.hasOwn(rewardByType, body.rewardType)) {
      throw new InvalidRequestError("intent, set, reward, and a supported taskType are required");
    }
    const set = body.set as unknown as SetForCopy;
    const verification = verificationByType[body.taskType as TaskType];
    const reward = rewardByType[body.rewardType as RewardType];
    return NextResponse.json(await writeTaskCopy(body.intent, set, reward, verification));
  } catch (error) {
    const message = error instanceof InvalidRequestError ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
