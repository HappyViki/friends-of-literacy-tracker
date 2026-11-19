import { createAuthClient } from "@neon/auth";

// Same-origin path to Neon Auth (proxied; see vite.config.ts), so its cookies are first-party.
export const authClient = createAuthClient(new URL(__NEON_AUTH_PATH__, window.location.origin).href);

// The Managed client includes Better Auth's JWT and email OTP plugins at runtime, but @neon/auth 0.8.2's
// vanilla client type does not surface `token()` or `emailOtp`, so describe just those methods here.
type Result<T> = { data: T | null; error: { message?: string; code?: string; status?: number } | null };
type ExtraMethods = {
  token: (opts?: { fetchOptions?: { headers?: Record<string, string> } }) => Promise<Result<{ token: string }>>;
  emailOtp: {
    sendVerificationOtp: (args: { email: string; type: "email-verification" }) => Promise<Result<{ success: boolean }>>;
    verifyEmail: (args: { email: string; otp: string }) => Promise<Result<unknown>>;
  };
};
const extra = authClient as unknown as ExtraMethods;
export const emailOtp = extra.emailOtp;

// The SDK answers any URL containing "/token" from its cached session once getSession() has run,
// so a plain token() returns { session, user } instead of { token } (e.g. right after Google sign-in,
// or on any page reload). X-Force-Fetch makes the SDK skip that cache and call /token.
// The JWT lasts 15 minutes; reuse it until a minute before it expires.
let cachedJwt: { token: string; exp: number } | null = null;

function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function getJwt(): Promise<string | null> {
  if (cachedJwt && cachedJwt.exp - 60_000 > Date.now()) return cachedJwt.token;
  const { data, error } = await extra.token({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } });
  const token = !error && typeof data?.token === "string" ? data.token : null;
  cachedJwt = token ? { token, exp: jwtExpiry(token) } : null;
  return token;
}

/** Forget the cached JWT (on sign-out or account change). */
export function clearJwt() {
  cachedJwt = null;
}

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
  const token = await getJwt();
  if (!token) throw new ApiError("You're signed out. Sign in again.", 401);
  const { json: body, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${__API_URL__}${path}`, {
      ...rest,
      method: rest.method ?? (body !== undefined ? "POST" : "GET"),
      body: body !== undefined ? JSON.stringify(body) : rest.body,
      headers: {
        ...rest.headers,
        Authorization: `Bearer ${token}`,
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

/** Download a file from the staff API (e.g. an export) and save it in the browser. Returns its name and response headers. */
export async function downloadFile(path: string, fallbackName: string): Promise<{ name: string; headers: Headers }> {
  const token = await getJwt();
  if (!token) throw new ApiError("You're signed out. Sign in again.", 401);
  let res: Response;
  try {
    res = await fetch(`${__API_URL__}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError("Can't reach the server. Check the internet connection and try again.", 0);
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json.error ?? `Download failed (HTTP ${res.status})`, res.status, json.code);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { name, headers: res.headers };
}
