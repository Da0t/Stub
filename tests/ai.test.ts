import assert from "node:assert/strict";
import test from "node:test";
import { parseJson, requestStructured, stripJsonFences } from "../lib/ai/client";
import { fallbackWrapped, lineIsDescriptive, lineUsesOnlySuppliedNumbers, writeWrapped } from "../lib/ai/narrative";
import { classifyBurst } from "../lib/ai/vision";
import { TASK_COPY_TIMEOUT_MS } from "../lib/ai/taskCopy";
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

test("Responses request uses the current flagship and strict text.format schema", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_MODEL;
  const originalFetch = globalThis.fetch;
  let sent: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_text: "```json\n{\"ok\":true}\n```" }), { status: 200 });
  };
  try {
    assert.deepEqual(await requestStructured({
      schemaName: "test_schema",
      schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
      system: "Return JSON.",
      user: "test",
    }), { ok: true });
    assert.equal(sent?.model, "gpt-5.6-sol");
    assert.equal((sent?.text as { format?: { type?: string } }).format?.type, "json_schema");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previousModel;
  }
});

test("number post-check rejects an injected number", () => {
  assert.equal(lineUsesOnlySuppliedNumbers("You stayed for 12 sets.", stats), true);
  assert.equal(lineUsesOnlySuppliedNumbers("You somehow saw 99 sets.", stats), false);
  assert.equal(lineUsesOnlySuppliedNumbers("You stayed for twelve sets.", stats), false);
});

test("voice guard rejects personality verdicts", () => {
  assert.equal(lineIsDescriptive("Your weekend was mostly after dark."), true);
  assert.equal(lineIsDescriptive("You're a legendary night owl."), false);
  assert.equal(lineIsDescriptive("Your taste is impeccable."), false);
  assert.equal(lineIsDescriptive("Your festival vibe is authentic."), false);
});

test("narrative is complete with no OpenAI key", async () => {
  delete process.env.OPENAI_API_KEY;
  const fallback = fallbackWrapped(stats);
  assert.deepEqual(await writeWrapped(stats), fallback);
  assert.equal(fallback.every((line) => lineUsesOnlySuppliedNumbers(line, stats)), true);
});

test("six-photo vision accepts fenced structured output and never locates", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  const photos = Array.from({ length: 6 }, (_, index) => ({ id: `photo-${index}`, dataUrl: "data:image/png;base64,AA==" }));
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { input: Array<{ content: Array<Record<string, unknown>> }> };
    assert.equal(body.input[1].content.filter((part) => part.type === "input_image").length, 6);
    const output = {
      bestFrameId: "photo-4",
      photos: photos.map(({ id }, index) => ({ id, subject: index % 2 ? "people" : "stage", quality: 0.8, blurred: false })),
    };
    return new Response(JSON.stringify({ output_text: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` }), { status: 200 });
  };
  try {
    const result = await classifyBurst(photos);
    assert.equal(result.bestFrameId, "photo-4");
    assert.equal(result.photos.length, 6);
    assert.equal(result.photos.some((photo) => "location" in photo || "time" in photo), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("task copy retry budget remains below the fifteen-second acceptance limit", () => {
  assert.ok(TASK_COPY_TIMEOUT_MS * 2 < 15_000);
});

test("vision falls back to first capture and leaves subjects absent", async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await classifyBurst([
    { id: "first", dataUrl: "data:image/png;base64,AA==" },
    { id: "second", dataUrl: "data:image/png;base64,AA==" },
  ]);
  assert.deepEqual(result, { bestFrameId: "first", photos: [] });
});
