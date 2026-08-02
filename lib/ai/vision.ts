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

function valid(result: unknown, ids: string[]): result is VisionResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as VisionResult;
  if (typeof candidate.bestFrameId !== "string" || !Array.isArray(candidate.photos)) return false;
  if (!ids.includes(candidate.bestFrameId) || candidate.photos.length !== ids.length) return false;
  const returned = new Set(candidate.photos.map((photo) => photo?.id));
  return ids.every((id) => returned.has(id)) && candidate.photos.every((photo) =>
    photo && typeof photo.id === "string"
      && ["stage", "people", "food", "scenery"].includes(photo.subject)
      && typeof photo.quality === "number" && Number.isFinite(photo.quality)
      && photo.quality >= 0 && photo.quality <= 1
      && typeof photo.blurred === "boolean",
  );
}

/** AI failure never changes mint eligibility: first frame wins and subjects stay absent downstream. */
export async function classifyBurst(photos: { id: string; dataUrl: string }[]): Promise<VisionResult> {
  const capped = photos.filter((photo, index) => photos.findIndex(({ id }) => id === photo.id) === index).slice(0, 8);
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
