export const TASK_COPY_PROMPT_VERSION = "task-copy-v1";

export const TASK_COPY_SYSTEM_PROMPT = `Turn an artist's one-sentence intent into concise fan-facing task copy.
The task is verified only from an existing minted-card query supplied by the application. Never invent a new action, proof method, location, time, threshold, reward, or eligibility rule.
No trivia, scavenger hunts, self-reporting, uploads, check-ins, or button-tap verification.
Description: one direct sentence that makes the supplied presence action clear.
Reward framing: one restrained sentence describing only the supplied reward; do not exaggerate scarcity or value.
Return JSON only as {"description":"...","rewardFraming":"..."}. No preamble. No markdown fences.`;
