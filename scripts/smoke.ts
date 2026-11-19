// Production-safe smoke test of the deployed API. Creates nothing a report would count: it signs up a
// temporary staff account, calls read-only routes and one ISBN scan (which only adds a catalog row),
// then deletes the account. Usage:
//   node --env-file=.env.production --import tsx scripts/smoke.ts
import pg from "pg";
import { functionBaseUrl } from "@neon/env";

const API = process.env.API_URL ?? functionBaseUrl("api");
const AUTH = process.env.NEON_AUTH_BASE_URL!;
const ORIGIN = "http://localhost:4173";
const email = `smoke-${Date.now().toString(36)}@example.com`;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  ${JSON.stringify(detail).slice(0, 200)}`}`);
};
const get = async (path: string, token?: string) => {
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
};

console.log(`branch ${process.env.NEON_BRANCH}  api ${API}`);
try {
  const health = await get("/health");
  check("health", health.status === 200 && health.body?.branch === process.env.NEON_BRANCH, health.body);
  check("no token -> 401", (await get("/api/locations")).status === 401);

  const auth = (path: string, body?: unknown, cookie?: string) =>
    fetch(`${AUTH}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const signUp = await auth("/sign-up/email", { email, password: "correct-horse-battery", name: "smoke" });
  check("Neon Auth sign-up", signUp.ok, signUp.status);
  const tokenFor = async () => {
    const r = await auth("/sign-in/email", { email, password: "correct-horse-battery" });
    const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return ((await (await auth("/token", undefined, cookie)).json()) as { token: string }).token;
  };

  check("unverified account -> 403", (await get("/api/locations", await tokenFor())).body?.code === "email_not_verified");
  await db.query(`update neon_auth."user" set "emailVerified" = true where email = $1`, [email]);
  check("verified, not staff -> 403", (await get("/api/locations", await tokenFor())).body?.code === "not_staff");
  await db.query(`insert into staff_members (email, role, added_by) values ($1, 'staff', 'smoke')`, [email]);
  const token = await tokenFor();

  const me = await get("/api/me", token);
  check("staff /api/me", me.status === 200 && me.body?.email === email, me.body?.role);
  for (const path of ["/api/locations", "/api/languages", "/api/surveys", "/api/categories", "/api/inventory", "/api/reports/summary"]) {
    const r = await get(path, token);
    check(`GET ${path}`, r.status === 200, Array.isArray(r.body) ? `${r.body.length} rows` : Object.keys(r.body ?? {}).slice(0, 4));
  }
  const search = await get("/api/households/search?q=nobody-here", token);
  check("family search", search.status === 200, search.body?.matchedBy);
  const scan = await get("/api/books/9780399226908", token);
  check("ISBN scan + categorize", scan.status === 200 && !!scan.body?.book?.category, [scan.body?.book?.title, scan.body?.book?.category, scan.body?.book?.categoryModel]);
  check("staff can't create locations", (await fetch(`${API}/api/locations`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" })).status === 403);
} finally {
  await db.query("delete from staff_members where email = $1", [email]);
  await db.query(`delete from neon_auth."user" where email = $1`, [email]);
  console.log(`removed temporary account ${email}`);
  await db.end();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
