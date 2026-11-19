import { createAuthClient } from "@neon/auth";

export const authClient = createAuthClient(__NEON_AUTH_URL__);

// The Managed client includes Better Auth's JWT plugin at runtime, but @neon/auth 0.8.2's
// vanilla client type does not surface `token()`, so describe just that method here.
type TokenResult = { data: { token: string } | null; error: { message?: string } | null };
const tokenClient = authClient as unknown as { token: () => Promise<TokenResult> };

// Calls the Neon Function directly with a short-lived Neon Auth JWT.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await tokenClient.token();
  if (error || !data?.token) throw new Error("Not signed in");
  const res = await fetch(`${__API_URL__}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${data.token}`,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail ?? json.error ?? `HTTP ${res.status}`);
  return json as T;
}
