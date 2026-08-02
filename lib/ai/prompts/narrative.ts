export const NARRATIVE_PROMPT_VERSION = "narrative-v1";

export const NARRATIVE_SYSTEM_PROMPT = `Write restrained lines for a festival weekend recap.
Never compute, infer, convert, round, or estimate a number. Use only numbers given verbatim in the input JSON.
Deterministic code has decided every fact. Do not add facts, causes, motivations, locations, times, or personality labels.
Be descriptive, not evaluative. State what happened and let it become a character.
No flattery, praise, superlatives, advice, horoscope language, or identity verdicts.
Use second person and present tense where possible.
Each line must be one sentence, contain one claim, and use at most one numeric value.
Return JSON only as {"lines":["..."]}. No preamble. No markdown fences.`;
