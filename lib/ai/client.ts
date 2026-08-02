export class AIUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AIUnavailableError";
  }
}

export function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseJson<T>(value: string): T {
  return JSON.parse(stripJsonFences(value)) as T;
}

type InputImage = { dataUrl: string; detail?: "low" | "high" | "auto" };

export interface StructuredRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  images?: InputImage[];
  timeoutMs?: number;
}

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(response: OpenAIResponse): string {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new AIUnavailableError("OpenAI returned no text output");
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function requestStructured<T>(request: StructuredRequest): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIUnavailableError("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
  const endpoint = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/responses";
  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: request.user }];
  for (const image of request.images ?? []) {
    userContent.push({ type: "input_image", image_url: image.dataUrl, detail: image.detail ?? "low" });
  }
  const body = {
    model,
    store: false,
    max_output_tokens: 1_200,
    reasoning: { effort: "none" },
    input: [
      { role: "system", content: [{ type: "input_text", text: request.system }] },
      { role: "user", content: userContent },
    ],
    text: {
      verbosity: "low",
      format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema },
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 8_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        const error = new AIUnavailableError(`OpenAI ${response.status}: ${detail}`);
        if (!isRetryable(response.status) || attempt === 1) throw error;
        lastError = error;
        continue;
      }
      return parseJson<T>(outputText((await response.json()) as OpenAIResponse));
    } catch (error) {
      lastError = error;
      if (attempt === 1 || (error instanceof AIUnavailableError && !/429|5\d\d|408|409/.test(error.message))) {
        throw new AIUnavailableError("Structured generation failed", { cause: error });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AIUnavailableError("Structured generation failed", { cause: lastError });
}
