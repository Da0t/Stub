import assert from "node:assert/strict";
import test from "node:test";
import { verifyTaskFromCards, type ArtistTask, type CardProof, type TaskParams } from "../lib/tasks/types";

const cards: CardProof[] = [
  { id: "a", setId: "set-a", stageId: "lands", mintedAt: 100, completionRate: 0.84, slotIndex: 0 },
  { id: "b", setId: "set-b", stageId: "sutro", mintedAt: 200, completionRate: 0.4, slotIndex: 2 },
  { id: "c", setId: "set-c", stageId: "soma", mintedAt: 300, completionRate: 0.7, slotIndex: 3 },
];

function task(params: TaskParams): ArtistTask {
  return { id: params.type, type: params.type, params, description: "", rewardType: "exclusive_frame", rewardPayload: {} };
}

test("each task type verifies only against existing cards", () => {
  assert.equal(verifyTaskFromCards(task({ type: "ATTEND_SET", setId: "set-b" }), cards)?.proofCardId, "b");
  assert.equal(verifyTaskFromCards(task({ type: "CATCH_OPENER" }), cards)?.proofCardId, "a");
  assert.deepEqual(
    verifyTaskFromCards(task({ type: "MINT_N_ONE_DAY", count: 3, dayStart: 0, dayEnd: 400 }), cards)?.proofCardIds,
    ["a", "b", "c"],
  );
  assert.equal(verifyTaskFromCards(task({ type: "VISIT_NEW_STAGE", priorStageIds: ["lands", "sutro"] }), cards)?.proofCardId, "c");
  assert.equal(verifyTaskFromCards(task({ type: "FULL_SET_COMMITMENT", setId: "set-a" }), cards)?.proofCardId, "a");
});

test("tasks fail closed when no minted card proves them", () => {
  assert.equal(verifyTaskFromCards(task({ type: "ATTEND_SET", setId: "missing" }), cards), null);
  assert.equal(verifyTaskFromCards(task({ type: "MINT_N_ONE_DAY", count: 4, dayStart: 0, dayEnd: 400 }), cards), null);
  assert.equal(verifyTaskFromCards(task({ type: "FULL_SET_COMMITMENT", setId: "set-b" }), cards), null);
});
