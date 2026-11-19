// Vercel Node.js Function: same-origin proxy to Neon Auth, mirroring @neon/auth's own server proxy
// (src/server/proxy in @neon/auth 0.8.2): forward a small header allowlist plus Origin and the
// Neon Auth cookies, and return only the auth response headers. Cookies then belong to this site,
// so sign-in works in browsers that block third-party cookies.
// Node.js runtime: Neon Auth rejects requests carrying an x-forwarded-host header (INVALID_HOSTNAME), so
// the proxy sends a plain request with only the headers below.
// The build replaces __NEON_AUTH_BASE_URL__ with the branch's Neon Auth URL.

const BASE = "__NEON_AUTH_BASE_URL__";
const REQUEST_HEADERS = ["user-agent", "authorization", "referer", "content-type", "x-neon-client-info"];
const RESPONSE_HEADERS = ["content-type", "content-encoding", "date", "set-auth-jwt", "set-auth-token", "x-neon-ret-request-id", "location"];
const COOKIE_PREFIX = "__Secure-neon-auth";

async function handler(request) {
  const url = new URL(request.url);
  const path = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
  if (!/^[A-Za-z0-9._\-\/]*$/.test(path) || path.includes("..")) return new Response("Bad path", { status: 400 });
  url.searchParams.delete("path");
  const upstream = new URL(`${BASE}/${path}`);
  upstream.search = url.searchParams.toString();

  const headers = new Headers();
  for (const h of REQUEST_HEADERS) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("origin", request.headers.get("origin") || url.origin);
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith(COOKIE_PREFIX));
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  headers.set("x-neon-auth-middleware", "true");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const res = await fetch(upstream, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    redirect: "manual",
  });

  const out = new Headers();
  for (const h of RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  for (const c of res.headers.getSetCookie?.() ?? []) out.append("set-cookie", c);
  out.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers: out });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
