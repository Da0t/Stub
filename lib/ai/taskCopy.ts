import { requestStructured } from "./client";
import type { SetForCopy } from "./domain";
import { TASK_COPY_SYSTEM_PROMPT } from "./prompts/taskCopy";

export interface TaskCopy { description: string; rewardFraming: string }

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["description", "rewardFraming"],
  properties: { description: { type: "string" }, rewardFraming: { type: "string" } },
};

export async function writeTaskCopy(
  intent: string,
  set: SetForCopy,
  reward = "the selected reward",
  verification = `mint a card from ${set.artistName}'s set`,
): Promise<TaskCopy> {
  const fallback = {
    description: `Mint a card from ${set.artistName}'s set to complete this task.`,
    rewardFraming: `Complete the task to receive ${reward}.`,
  };
  if (!intent.trim()) return fallback;
  try {
    const result = await requestStructured<TaskCopy>({
      schemaName: "artist_task_copy",
      schema,
      system: TASK_COPY_SYSTEM_PROMPT,
      user: JSON.stringify({ intent: intent.trim(), set, reward, fixedVerificationAction: verification }),
    });
    if (!result.description.trim() || !result.rewardFraming.trim()) return fallback;
    return result;
  } catch {
    return fallback;
  }
}
