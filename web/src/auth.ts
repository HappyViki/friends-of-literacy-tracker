import { createAuthClient } from "@neon/auth";

// Same-origin path to Neon Auth (proxied; see vite.config.ts), so its cookies are first-party.
export const authClient = createAuthClient(new URL(__NEON_AUTH_PATH__, window.location.origin).href);

// The Managed client includes Better Auth's JWT and email OTP plugins at runtime, but @neon/auth 0.8.2's
// vanilla client type does not surface `token()` or `emailOtp`, so describe just those methods here.
type Result<T> = { data: T | null; error: { message?: string; code?: string; status?: number } | null };
type ExtraMethods = {
  token: () => Promise<Result<{ token: string }>>;
  emailOtp: {
    sendVerificationOtp: (args: { email: string; type: "email-verification" }) => Promise<Result<{ success: boolean }>>;
    verifyEmail: (args: { email: string; otp: string }) => Promise<Result<unknown>>;
  };
};
const extra = authClient as unknown as ExtraMethods;
export const emailOtp = extra.emailOtp;

/** An API error, with the message (written for staff), status, and any `code` / `details`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: any,
  ) {
    super(message);
  }
}

// Calls the Neon Function directly with a short-lived Neon Auth JWT.
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { data, error } = await extra.token();
  if (error || !data?.token) throw new ApiError("You're signed out. Sign in again.", 401);
  const { json: body, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${__API_URL__}${path}`, {
      ...rest,
      method: rest.method ?? (body !== undefined ? "POST" : "GET"),
      body: body !== undefined ? JSON.stringify(body) : rest.body,
      headers: {
        ...rest.headers,
        Authorization: `Bearer ${data.token}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check the internet connection and try again.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json.code ?? json.details?.code;
    throw new ApiError(json.error ?? `Something went wrong (HTTP ${res.status})`, res.status, code, json.details);
  }
  return json as T;
}
