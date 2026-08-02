import { requestStructured } from "./client";
import { VISION_SYSTEM_PROMPT } from "./prompts/vision";

export type VisionSubject = "stage" | "people" | "food" | "scenery";
export interface VisionResult {
  bestFrameId: string;
  photos: Array<{ id: string; subject: VisionSubject; quality: number; blurred: boolean }>;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["bestFrameId", "photos"],
  properties: {
    bestFrameId: { type: "string" },
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "subject", "quality", "blurred"],
        properties: {
          id: { type: "string" },
          subject: { type: "string", enum: ["stage", "people", "food", "scenery"] },
          quality: { type: "number", minimum: 0, maximum: 1 },
          blurred: { type: "boolean" },
        },
      },
    },
  },
};

function valid(result: VisionResult, ids: string[]): boolean {
  if (!ids.includes(result.bestFrameId) || result.photos.length !== ids.length) return false;
  const returned = new Set(result.photos.map((photo) => photo.id));
  return ids.every((id) => returned.has(id)) && result.photos.every((p) => p.quality >= 0 && p.quality <= 1);
}

/** AI failure never changes mint eligibility: first frame wins and subjects stay absent downstream. */
export async function classifyBurst(photos: { id: string; dataUrl: string }[]): Promise<VisionResult> {
  const capped = photos.slice(0, 8);
  if (capped.length === 0) return { bestFrameId: "", photos: [] };
  try {
    const result = await requestStructured<VisionResult>({
      schemaName: "festival_burst",
      schema,
      system: VISION_SYSTEM_PROMPT,
      user: `Photo ids, in capture order: ${JSON.stringify(capped.map(({ id }) => id))}`,
      images: capped.map(({ dataUrl }) => ({ dataUrl, detail: "low" })),
    });
    if (!valid(result, capped.map(({ id }) => id))) throw new Error("Invalid vision result");
    return result;
  } catch {
    return { bestFrameId: capped[0].id, photos: [] };
  }
}
