import { requestStructured } from "./client";
import type { SetForCopy } from "./domain";
import { TASK_COPY_SYSTEM_PROMPT } from "./prompts/taskCopy";

export interface TaskCopy { description: string; rewardFraming: string }
export const TASK_COPY_TIMEOUT_MS = 6_000;

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
    description: `Complete this task: ${verification}.`,
    rewardFraming: `Complete the task to receive ${reward}.`,
  };
  if (!intent.trim()) return fallback;
  try {
    const result = await requestStructured<TaskCopy>({
      schemaName: "artist_task_copy",
      schema,
      system: TASK_COPY_SYSTEM_PROMPT,
      user: JSON.stringify({ intent: intent.trim(), set, reward, fixedVerificationAction: verification }),
      timeoutMs: TASK_COPY_TIMEOUT_MS,
    });
    if (!result || typeof result.description !== "string" || typeof result.rewardFraming !== "string") return fallback;
    const description = result.description.trim();
    const rewardFraming = result.rewardFraming.trim();
    if (!description || !rewardFraming
      || !description.toLocaleLowerCase().includes(verification.toLocaleLowerCase())
      || !rewardFraming.toLocaleLowerCase().includes(reward.toLocaleLowerCase())) return fallback;
    return { description, rewardFraming };
  } catch {
    return fallback;
  }
}
