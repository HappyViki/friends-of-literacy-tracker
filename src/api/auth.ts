import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { staffMembers } from "../db/schema.ts";
import { db } from "./db.ts";

export type Staff = { userId: string; email: string; role: "admin" | "staff" };
export type AppEnv = { Variables: { staff: Staff } };

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const baseUrl = process.env.NEON_AUTH_BASE_URL;
if (!jwksUrl || !baseUrl) throw new Error("Neon Auth is not configured (NEON_AUTH_JWKS_URL / NEON_AUTH_BASE_URL)");
const jwks = createRemoteJWKSet(new URL(jwksUrl));
const issuer = new URL(baseUrl).origin;

/**
 * Staff only. A valid Neon Auth JWT is not enough, because anyone can create an account:
 * the account's email must also be verified and listed in staff_members.
 */
export const requireStaff = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return c.json({ error: "Sign in required" }, 401);
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(header.slice(7), jwks, { issuer }));
  } catch {
    return c.json({ error: "Sign in required" }, 401);
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!payload.sub || !email) return c.json({ error: "Sign in required" }, 401);
  if (payload.emailVerified !== true) {
    return c.json({ error: "Verify your email address to continue", code: "email_not_verified" }, 403);
  }
  const [member] = await db.select().from(staffMembers).where(eq(staffMembers.email, email));
  if (!member?.active) return c.json({ error: "This account is not on the staff list", code: "not_staff" }, 403);
  c.set("staff", { userId: String(payload.sub), email, role: member.role });
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("staff").role !== "admin") return c.json({ error: "Admins only" }, 403);
  await next();
});
