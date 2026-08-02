export type TaskType =
  | "ATTEND_SET"
  | "CATCH_OPENER"
  | "MINT_N_ONE_DAY"
  | "VISIT_NEW_STAGE"
  | "FULL_SET_COMMITMENT";

export type RewardType = "exclusive_frame" | "artist_shoutout" | "early_access" | "merch_code";

export type TaskParams =
  | { type: "ATTEND_SET"; setId: string }
  | { type: "CATCH_OPENER" }
  | { type: "MINT_N_ONE_DAY"; count: number; dayStart: number; dayEnd: number }
  | { type: "VISIT_NEW_STAGE"; priorStageIds: string[] }
  | { type: "FULL_SET_COMMITMENT"; setId?: string };

export interface ArtistTask {
  id: string;
  type: TaskType;
  params: TaskParams;
  description: string;
  rewardType: RewardType;
  rewardPayload: unknown;
}

/** A projection of an existing cards query joined with its set; never user-submitted proof. */
export interface CardProof {
  id: string;
  setId: string;
  stageId: string;
  mintedAt: number;
  completionRate: number;
  slotIndex: number;
}

export interface TaskCompletion {
  proofCardId: string;
  proofCardIds: string[];
}

export function verifyTaskFromCards(task: ArtistTask, cards: readonly CardProof[]): TaskCompletion | null {
  const params = task.params;
  switch (params.type) {
    case "ATTEND_SET": {
      const proof = cards.find((card) => card.setId === params.setId);
      return proof ? { proofCardId: proof.id, proofCardIds: [proof.id] } : null;
    }
    case "CATCH_OPENER": {
      const proof = cards.find((card) => card.slotIndex === 0);
      return proof ? { proofCardId: proof.id, proofCardIds: [proof.id] } : null;
    }
    case "MINT_N_ONE_DAY": {
      const proofs = cards.filter(
        (card) => card.mintedAt >= params.dayStart && card.mintedAt < params.dayEnd,
      );
      return proofs.length >= params.count
        ? { proofCardId: proofs[0].id, proofCardIds: proofs.slice(0, params.count).map((card) => card.id) }
        : null;
    }
    case "VISIT_NEW_STAGE": {
      const prior = new Set(params.priorStageIds);
      const proof = cards.find((card) => !prior.has(card.stageId));
      return proof ? { proofCardId: proof.id, proofCardIds: [proof.id] } : null;
    }
    case "FULL_SET_COMMITMENT": {
      const proof = cards.find(
        (card) => card.completionRate >= 0.8 && (!params.setId || card.setId === params.setId),
      );
      return proof ? { proofCardId: proof.id, proofCardIds: [proof.id] } : null;
    }
  }
}
