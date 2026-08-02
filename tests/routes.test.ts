import assert from "node:assert/strict";
import test from "node:test";
import { POST as taskCopy } from "../app/api/ai/task-copy/route";
import { POST as vision } from "../app/api/ai/vision/route";

test("task-copy route derives verification server-side", async () => {
  delete process.env.OPENAI_API_KEY;
  const response = await taskCopy(new Request("http://localhost/api/ai/task-copy", {
    method: "POST",
    body: JSON.stringify({
      intent: "People miss my opener",
      taskType: "CATCH_OPENER",
      rewardType: "exclusive_frame",
      verification: "answer remote trivia",
      set: { id: "set-a", artistName: "Artist", stageId: "lands", startTime: 1, endTime: 2, slotIndex: 1 },
    }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json() as { description: string };
  assert.match(result.description, /slot index is 0/);
  assert.doesNotMatch(result.description, /trivia/);
});

test("AI routes reject malformed and oversized media input", async () => {
  const malformed = await vision(new Request("http://localhost/api/ai/vision", {
    method: "POST",
    body: "not-json",
  }));
  assert.equal(malformed.status, 400);

  const remoteImage = await vision(new Request("http://localhost/api/ai/vision", {
    method: "POST",
    body: JSON.stringify({ photos: [{ id: "one", dataUrl: "https://attacker.example/image.png" }] }),
  }));
  assert.equal(remoteImage.status, 400);
});
