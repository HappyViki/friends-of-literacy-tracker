// Locations, languages and the staff list.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { languages, locations, locationType, staffMembers, staffRole } from "../db/schema.ts";
import { db } from "../api/db.ts";
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

export const listStaff = () => db.select().from(staffMembers).orderBy(asc(staffMembers.email));

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
  return row;
}
