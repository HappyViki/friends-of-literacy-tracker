// Locations, languages and the staff list.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { languages, locations, locationType, staffMembers, staffRole } from "../db/schema.ts";
import { db, pool } from "../api/db.ts";
import { HttpError, parse, pgCode } from "../api/errors.ts";
import type { Staff } from "../api/auth.ts";
import { normalizeEmail } from "../domain/contact.ts";

export const listLocations = () => db.select().from(locations).orderBy(asc(locations.code));
export const listLanguages = () => db.select().from(languages).orderBy(asc(languages.name));

const locationInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}$/, "2–5 letters, printed on library cards"),
  name: z.string().trim().min(1).max(200),
  type: z.enum(locationType.enumValues).default("branch"),
  address: z.string().trim().max(300).optional().nullable(),
  zipCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/).optional().nullable(),
});

export async function createLocation(body: unknown) {
  const input = parse(locationInput, body);
  try {
    const [row] = await db.insert(locations).values(input).returning();
    return row;
  } catch (err) {
    if (pgCode(err) === "23505") throw new HttpError(409, `Location code ${input.code} is already used`);
    throw err;
  }
}

const locationPatch = locationInput.omit({ code: true }).partial().extend({ active: z.boolean().optional() });

// The code can't change: it is printed on every card issued there.
export async function updateLocation(id: number, body: unknown) {
  const input = parse(locationPatch, body);
  const [row] = await db.update(locations).set(input).where(eq(locations.id, id)).returning();
  if (!row) throw new HttpError(404, "Location not found");
  return row;
}

/**
 * The staff list joined with each person's Neon Auth account (if they have one): how they sign in,
 * whether the account is blocked, and when they were last active.
 */
export async function listStaff() {
  const { rows } = await pool.query(
    `select s.email, s.role, s.active, s.created_at as "createdAt", s.added_by as "addedBy",
            u.id as "authUserId", u.name, u.banned,
            coalesce((select array_agg(distinct a."providerId" order by a."providerId") from neon_auth.account a where a."userId" = u.id), '{}') as "signIn",
            (select max(x."updatedAt") from neon_auth.session x where x."userId" = u.id) as "lastActive"
     from staff_members s
     left join neon_auth."user" u on lower(u.email) = s.email
     order by s.active desc, s.email`,
  );
  return rows;
}

/**
 * Keep the person's Neon Auth account in step with the staff list: admins get Neon Auth's admin role
 * (needed to create accounts and set passwords); removing access blocks the account and ends every
 * session, so they can't sign in again; restoring access unblocks it.
 */
async function syncAuthAccount(email: string, role: "admin" | "staff", active: boolean) {
  const { rows } = await pool.query<{ id: string }>(
    `update neon_auth."user"
        set role = $2, banned = $3, "banReason" = case when $3 then 'Access removed by a Friends of Literacy admin' else null end,
            "banExpires" = null, "updatedAt" = now()
      where lower(email) = $1
      returning id`,
    [email, active && role === "admin" ? "admin" : "user", !active],
  );
  if (!active && rows.length) await pool.query(`delete from neon_auth.session where "userId" = any($1)`, [rows.map((r) => r.id)]);
}

/** On sign-in: an admin on the staff list also needs Neon Auth's admin role (first sign-in, or set up by CLI). */
export async function ensureAuthAdmin(email: string) {
  await pool.query(`update neon_auth."user" set role = 'admin', "updatedAt" = now() where lower(email) = $1 and role is distinct from 'admin'`, [email]);
}

const staffInput = z.object({
  email: z.string(),
  role: z.enum(staffRole.enumValues).default("staff"),
  active: z.boolean().default(true),
});

export async function upsertStaff(body: unknown, by: Staff) {
  const input = parse(staffInput, body);
  const email = normalizeEmail(input.email);
  if (!email) throw new HttpError(400, "Not a valid email address");
  if (email === by.email && (input.role !== "admin" || !input.active)) {
    throw new HttpError(400, "You can't remove your own admin access");
  }
  const [row] = await db
    .insert(staffMembers)
    .values({ email, role: input.role, active: input.active, addedBy: by.userId })
    .onConflictDoUpdate({ target: staffMembers.email, set: { role: input.role, active: input.active } })
    .returning();
  await syncAuthAccount(email, input.role, input.active);
  return row;
}
