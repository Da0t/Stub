import assert from "node:assert/strict";
import test from "node:test";
import { parseJson, stripJsonFences } from "../lib/ai/client";
import { fallbackWrapped, lineIsDescriptive, lineUsesOnlySuppliedNumbers, writeWrapped } from "../lib/ai/narrative";
import { classifyBurst } from "../lib/ai/vision";
import type { WrappedStats } from "../lib/ai/domain";

const stats: WrappedStats = {
  totalDwellSeconds: 8460,
  setsAttended: 12,
  concurrentSetsSkipped: 31,
  perSetSkipped: { hozier: 3 },
  completionRateAvg: 0.82,
  fullSetCount: 4,
  stageDiversity: 5,
  nightRatio: 0.68,
  discoveryRate: 0.33,
  longestRun: null,
  topArtistBySetTime: { setId: "hozier", artistName: "Hozier", dwellSeconds: 2820 },
  extras: { friendPhotos: 43, stagePhotos: 6 },
};

test("defensively strips markdown fences around strict JSON", () => {
  assert.equal(stripJsonFences("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
  assert.deepEqual(parseJson("```\n{\"ok\":true}\n```"), { ok: true });
});

test("number post-check rejects an injected number", () => {
  assert.equal(lineUsesOnlySuppliedNumbers("You stayed for 12 sets.", stats), true);
  assert.equal(lineUsesOnlySuppliedNumbers("You somehow saw 99 sets.", stats), false);
});

test("voice guard rejects personality verdicts", () => {
  assert.equal(lineIsDescriptive("Your weekend was mostly after dark."), true);
  assert.equal(lineIsDescriptive("You're a legendary night owl."), false);
});

test("narrative is complete with no OpenAI key", async () => {
  delete process.env.OPENAI_API_KEY;
  assert.deepEqual(await writeWrapped(stats), fallbackWrapped(stats));
});

test("vision falls back to first capture and leaves subjects absent", async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await classifyBurst([
    { id: "first", dataUrl: "data:image/png;base64,AA==" },
    { id: "second", dataUrl: "data:image/png;base64,AA==" },
  ]);
  assert.deepEqual(result, { bestFrameId: "first", photos: [] });
});
