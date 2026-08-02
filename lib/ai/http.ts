export class InvalidRequestError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reads JSON with an enforced byte ceiling even when Content-Length is absent or dishonest. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new InvalidRequestError("Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new InvalidRequestError("Request body is too large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidRequestError("Request body must be valid JSON");
  }
}

export function shortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
