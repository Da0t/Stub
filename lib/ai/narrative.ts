import { requestStructured } from "./client";
import type { WrappedStats } from "./domain";
import { NARRATIVE_SYSTEM_PROMPT } from "./prompts/narrative";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: { lines: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 } },
};

export function numericTokens(value: unknown): Set<string> {
  return new Set(JSON.stringify(value).match(/-?\d+(?:\.\d+)?/g) ?? []);
}

export function lineUsesOnlySuppliedNumbers(line: string, stats: unknown): boolean {
  const allowed = numericTokens(stats);
  const used = line.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return used.every((token) => allowed.has(token));
}

const VERDICT_LANGUAGE = /\b(you(?:'re| are)|explorer|night owl|superfan|legend(?:ary)?|loyal|adventurous|tasteful|best|true fan|iconic)\b/i;

export function lineIsDescriptive(line: string): boolean {
  return !VERDICT_LANGUAGE.test(line);
}

export function fallbackWrapped(stats: WrappedStats): string[] {
  const lines = [
    `You stayed for ${stats.setsAttended} sets.`,
    `You chose them over ${stats.concurrentSetsSkipped} sets happening elsewhere.`,
    `You stayed through ${stats.fullSetCount} full sets.`,
    `Your weekend crossed ${stats.stageDiversity} stages.`,
  ];
  if (stats.topArtistBySetTime) {
    lines.push(`You gave ${stats.topArtistBySetTime.artistName} ${stats.topArtistBySetTime.dwellSeconds} seconds.`);
  }
  return lines;
}

export async function writeWrapped(stats: WrappedStats): Promise<string[]> {
  try {
    const result = await requestStructured<{ lines: string[] }>({
      schemaName: "wrapped_lines",
      schema,
      system: NARRATIVE_SYSTEM_PROMPT,
      user: JSON.stringify(stats),
    });
    const safe = result.lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && lineUsesOnlySuppliedNumbers(line, stats) && lineIsDescriptive(line));
    return safe.length > 0 ? safe : fallbackWrapped(stats);
  } catch {
    return fallbackWrapped(stats);
  }
}
