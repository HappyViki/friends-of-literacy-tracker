import type { ZodType } from "zod";

/** An error with an HTTP status and a message safe to show staff. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 502,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
  throw new HttpError(400, issues.join("; "), result.error.issues);
}

/** Postgres error code, when the error came from the database. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}
