// Family intake, library cards and finding returning families.
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ageRange,
  books,
  children,
  distributionItems,
  distributions,
  guardians,
  householdLanguages,
  households,
  libraryCards,
  locations,
  surveyAnswers,
  surveyQuestions,
  surveyResponses,
  surveys,
} from "../db/schema.ts";
import { db, pool, type Tx } from "../api/db.ts";
import { HttpError, parse, pgCode } from "../api/errors.ts";
import type { Staff } from "../api/auth.ts";
import { formatCardNumber, looksLikeCardNumber, parseCardNumber } from "../domain/cards.ts";
import { normalizeEmail, normalizePhone } from "../domain/contact.ts";
import { ageBracket, ageOn, birthYearFromAge } from "../domain/age.ts";

const currentYear = () => new Date().getUTCFullYear();

const guardianInput = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional().nullable(),
    email: z.string().trim().max(254).optional().nullable(),
    phone: z.string().trim().max(32).optional().nullable(),
    ageRange: z.enum(ageRange.enumValues).optional().nullable(),
    preferredLanguage: z.string().trim().min(2).max(8).optional().nullable(),
    contactConsent: z.boolean().optional(),
  })
  .transform((g, ctx) => {
    const email = g.email ? normalizeEmail(g.email) : null;
    const phone = g.phone ? normalizePhone(g.phone) : null;
    if (g.email && !email) ctx.addIssue({ code: "custom", path: ["email"], message: "is not a valid email address" });
    if (g.phone && !phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "is not a valid phone number" });
    if (!g.email && !g.phone) ctx.addIssue({ code: "custom", path: ["email"], message: "an email or a phone number is required" });
    return { ...g, email, phone, lastName: g.lastName || null };
  });

const childInput = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    birthYear: z.number().int().min(1990).max(2100).optional().nullable(),
    birthMonth: z.number().int().min(1).max(12).optional().nullable(),
    // When staff only ask the child's age.
    age: z.number().int().min(0).max(25).optional().nullable(),
  })
  .transform((c, ctx) => {
    if (c.birthYear != null && c.birthYear > currentYear()) {
      ctx.addIssue({ code: "custom", path: ["birthYear"], message: "is in the future" });
    }
    const estimated = c.birthYear == null && c.age != null;
    return {
      firstName: c.firstName,
      birthYear: c.birthYear ?? (c.age != null ? birthYearFromAge(c.age, new Date()) : null),
      birthMonth: c.birthMonth ?? null,
      birthYearEstimated: estimated,
    };
  });

export const intakeInput = z.object({
  locationId: z.number().int().positive(),
  zipCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "must be a 5-digit ZIP code"),
  languages: z.array(z.string().trim().min(2).max(8)).max(10).default([]),
  guardians: z.array(guardianInput).min(1).max(4),
  children: z.array(childInput).max(15).default([]),
});

async function activeLocation(tx: Tx | typeof db, locationId: number) {
  const [loc] = await tx.select().from(locations).where(eq(locations.id, locationId));
  if (!loc || !loc.active) throw new HttpError(400, `Unknown or inactive location ${locationId}`);
  return loc;
}

async function issueCard(tx: Tx, householdId: string, locationId: number, staff: Staff) {
  const loc = await activeLocation(tx, locationId);
  // Sequences never hand out the same value twice, even across rolled-back transactions.
  const { rows } = await tx.execute<{ seq: string }>(sql`select nextval('library_card_seq')::text as seq`);
  const number = formatCardNumber(loc.code, BigInt(rows[0].seq));
  const [card] = await tx
    .insert(libraryCards)
    .values({ householdId, number, issuedLocationId: loc.id, issuedBy: staff.userId })
    .returning();
  return card;
}

/** Households already using any of these emails or phones. */
async function findByContacts(emails: string[], phones: string[]) {
  if (emails.length === 0 && phones.length === 0) return [];
  const conds = [];
  if (emails.length) conds.push(inArray(guardians.email, emails));
  if (phones.length) conds.push(inArray(guardians.phone, phones));
  const rows = await db.selectDistinct({ householdId: guardians.householdId }).from(guardians).where(or(...conds));
  return rows.map((r) => r.householdId);
}

export async function intake(body: unknown, staff: Staff) {
  const input = parse(intakeInput, body);
  const emails = input.guardians.flatMap((g) => (g.email ? [g.email] : []));
  const phones = input.guardians.flatMap((g) => (g.phone ? [g.phone] : []));
  if (new Set(emails).size !== emails.length || new Set(phones).size !== phones.length) {
    throw new HttpError(400, "Two adults in the same family can't share an email or phone number");
  }
  const existing = await findByContacts(emails, phones);
  if (existing.length) {
    throw new HttpError(409, "This family is already registered", {
      households: await Promise.all(existing.map(summary)),
    });
  }

  try {
    const householdId = await db.transaction(async (tx) => {
      await activeLocation(tx, input.locationId);
      const [household] = await tx
        .insert(households)
        .values({ zipCode: input.zipCode, homeLocationId: input.locationId, createdBy: staff.userId })
        .returning();
      const langs = [...new Set([...input.languages, ...input.guardians.flatMap((g) => g.preferredLanguage ?? [])])];
      if (langs.length) {
        await tx.insert(householdLanguages).values(langs.map((code) => ({ householdId: household.id, languageCode: code })));
      }
      await tx.insert(guardians).values(
        input.guardians.map((g) => ({
          householdId: household.id,
          firstName: g.firstName,
          lastName: g.lastName,
          email: g.email,
          phone: g.phone,
          ageRange: g.ageRange ?? null,
          preferredLanguageCode: g.preferredLanguage ?? null,
          contactConsent: g.contactConsent ?? false,
        })),
      );
      if (input.children.length) {
        await tx.insert(children).values(input.children.map((c) => ({ ...c, householdId: household.id })));
      }
      await issueCard(tx, household.id, input.locationId, staff);
      return household.id;
    });
    return detail(householdId);
  } catch (err) {
    if (pgCode(err) === "23505") {
      // Someone registered the same email/phone at the same moment.
      const again = await findByContacts(emails, phones);
      throw new HttpError(409, "This family is already registered", { households: await Promise.all(again.map(summary)) });
    }
    if (pgCode(err) === "23503") throw new HttpError(400, "Unknown language code");
    throw err;
  }
}

/** Short description of a family for search results. */
export async function summary(householdId: string) {
  const [h] = await db.select().from(households).where(eq(households.id, householdId));
  if (!h) throw new HttpError(404, "Family not found");
  const [card] = await db
    .select({ number: libraryCards.number })
    .from(libraryCards)
    .where(and(eq(libraryCards.householdId, householdId), eq(libraryCards.status, "active")));
  const g = await db
    .select({ firstName: guardians.firstName, lastName: guardians.lastName, email: guardians.email, phone: guardians.phone })
    .from(guardians)
    .where(eq(guardians.householdId, householdId))
    .orderBy(asc(guardians.createdAt));
  const c = await db
    .select({ firstName: children.firstName })
    .from(children)
    .where(eq(children.householdId, householdId))
    .orderBy(asc(children.createdAt));
  return {
    householdId,
    cardNumber: card?.number ?? null,
    zipCode: h.zipCode,
    guardians: g,
    children: c.map((x) => x.firstName),
  };
}

export async function detail(householdId: string) {
  const [h] = await db
    .select({ household: households, location: locations })
    .from(households)
    .innerJoin(locations, eq(locations.id, households.homeLocationId))
    .where(eq(households.id, householdId));
  if (!h) throw new HttpError(404, "Family not found");
  const now = new Date();

  const [langs, cards, adults, kids, visits, responses] = await Promise.all([
    db.select({ code: householdLanguages.languageCode }).from(householdLanguages).where(eq(householdLanguages.householdId, householdId)),
    db
      .select({ number: libraryCards.number, status: libraryCards.status, issuedAt: libraryCards.issuedAt, issuedAtLocation: locations.code })
      .from(libraryCards)
      .innerJoin(locations, eq(locations.id, libraryCards.issuedLocationId))
      .where(eq(libraryCards.householdId, householdId))
      .orderBy(desc(libraryCards.issuedAt)),
    db.select().from(guardians).where(eq(guardians.householdId, householdId)).orderBy(asc(guardians.createdAt)),
    db.select().from(children).where(eq(children.householdId, householdId)).orderBy(asc(children.createdAt)),
    db
      .select({
        distributionId: distributions.id,
        distributedAt: distributions.distributedAt,
        location: locations.code,
        isbn: distributionItems.isbn,
        title: books.title,
        category: books.category,
        condition: distributionItems.condition,
        quantity: distributionItems.quantity,
        childId: distributionItems.childId,
      })
      .from(distributions)
      .innerJoin(locations, eq(locations.id, distributions.locationId))
      .innerJoin(distributionItems, eq(distributionItems.distributionId, distributions.id))
      .innerJoin(books, eq(books.isbn, distributionItems.isbn))
      .where(eq(distributions.householdId, householdId))
      .orderBy(desc(distributions.distributedAt), asc(distributionItems.id)),
    db
      .select({
        responseId: surveyResponses.id,
        survey: surveys.key,
        surveyName: surveys.name,
        submittedAt: surveyResponses.submittedAt,
        questionKey: surveyQuestions.key,
        valueNumber: surveyAnswers.valueNumber,
        valueBool: surveyAnswers.valueBool,
        valueText: surveyAnswers.valueText,
        valueChoices: surveyAnswers.valueChoices,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
      .innerJoin(surveyAnswers, eq(surveyAnswers.responseId, surveyResponses.id))
      .innerJoin(surveyQuestions, eq(surveyQuestions.id, surveyAnswers.questionId))
      .where(eq(surveyResponses.householdId, householdId))
      .orderBy(desc(surveyResponses.submittedAt)),
  ]);

  const kidName = new Map(kids.map((k) => [k.id, k.firstName]));
  const giveaways = new Map<number, { distributionId: number; distributedAt: Date; location: string; books: unknown[] }>();
  for (const v of visits) {
    const g = giveaways.get(v.distributionId) ?? { distributionId: v.distributionId, distributedAt: v.distributedAt, location: v.location, books: [] };
    g.books.push({ isbn: v.isbn, title: v.title, category: v.category, condition: v.condition, quantity: v.quantity, forChild: v.childId ? kidName.get(v.childId) ?? null : null });
    giveaways.set(v.distributionId, g);
  }
  const surveysOut = new Map<number, { responseId: number; survey: string; surveyName: string; submittedAt: Date; answers: Record<string, unknown> }>();
  for (const r of responses) {
    const s = surveysOut.get(r.responseId) ?? { responseId: r.responseId, survey: r.survey, surveyName: r.surveyName, submittedAt: r.submittedAt, answers: {} };
    s.answers[r.questionKey] = r.valueNumber ?? r.valueBool ?? r.valueText ?? r.valueChoices;
    surveysOut.set(r.responseId, s);
  }

  return {
    householdId,
    zipCode: h.household.zipCode,
    signedUpAt: h.household.createdAt,
    signedUpAtLocation: h.location.code,
    cardNumber: cards.find((c) => c.status === "active")?.number ?? null,
    cards,
    languages: langs.map((l) => l.code),
    guardians: adults.map((g) => ({
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      ageRange: g.ageRange,
      preferredLanguage: g.preferredLanguageCode,
      contactConsent: g.contactConsent,
    })),
    children: kids.map((k) => {
      const age = k.birthYear != null ? ageOn(k.birthYear, k.birthMonth, now) : null;
      return {
        id: k.id,
        firstName: k.firstName,
        birthYear: k.birthYear,
        birthMonth: k.birthMonth,
        birthYearEstimated: k.birthYearEstimated,
        age,
        ageBracket: age != null ? ageBracket(age) : null,
      };
    }),
    booksReceived: visits.reduce((n, v) => n + v.quantity, 0),
    giveaways: [...giveaways.values()],
    surveyResponses: [...surveysOut.values()],
  };
}

/**
 * Find a returning family by card number, email, phone or name. Card, email and phone are exact;
 * names use trigram similarity so small typos still match.
 */
export async function search(q: string, zip?: string) {
  const query = q.trim();
  if (query.length < 2) throw new HttpError(400, "Type at least 2 characters");

  if (looksLikeCardNumber(query)) {
    const number = parseCardNumber(query);
    if (!number) throw new HttpError(400, "That card number's check digit doesn't match. Check for a typo.");
    const [card] = await db.select().from(libraryCards).where(eq(libraryCards.number, number));
    if (!card) return { matchedBy: "card", results: [] };
    return { matchedBy: "card", cardStatus: card.status, results: [await summary(card.householdId)] };
  }
  const email = normalizeEmail(query);
  if (email) {
    const ids = await findByContacts([email], []);
    return { matchedBy: "email", results: await Promise.all(ids.map(summary)) };
  }
  const phone = /^[\d\s()+.-]+$/.test(query) ? normalizePhone(query) : null;
  if (phone) {
    const ids = await findByContacts([], [phone]);
    return { matchedBy: "phone", results: await Promise.all(ids.map(summary)) };
  }
  if (/^[\d\s()+.-]+$/.test(query)) throw new HttpError(400, "That looks like an incomplete phone number");

  const { rows } = await pool.query<{ household_id: string; score: number }>(
    `select m.household_id, max(m.score)::float as score
     from (
       select household_id,
              greatest(similarity(first_name, $1), similarity(coalesce(last_name, ''), $1),
                       similarity(first_name || ' ' || coalesce(last_name, ''), $1)) as score
       from guardians
       where first_name % $1 or last_name % $1 or (first_name || ' ' || coalesce(last_name, '')) % $1
       union all
       select household_id, similarity(first_name, $1) * 0.9 from children where first_name % $1
     ) m
     join households h on h.id = m.household_id
     where $2::text is null or h.zip_code = $2
     group by m.household_id
     order by score desc
     limit 20`,
    [query, zip?.trim() || null],
  );
  const results = await Promise.all(rows.map(async (r) => ({ ...(await summary(r.household_id)), score: Math.round(r.score * 100) / 100 })));
  return { matchedBy: "name", results };
}

/** Look a family up by a scanned card. Old (lost/replaced) cards still find the family, with a warning. */
export async function byCard(input: string) {
  const number = parseCardNumber(input);
  if (!number) throw new HttpError(400, "Not a valid library card number");
  const [card] = await db.select().from(libraryCards).where(eq(libraryCards.number, number));
  if (!card) throw new HttpError(404, "No family has that card");
  return { scannedCard: { number: card.number, status: card.status }, household: await detail(card.householdId) };
}

const replaceInput = z.object({
  locationId: z.number().int().positive(),
  reason: z.enum(["lost", "replaced"]).default("lost"),
});

export async function replaceCard(householdId: string, body: unknown, staff: Staff) {
  const input = parse(replaceInput, body);
  await db.transaction(async (tx) => {
    const [h] = await tx.select({ id: households.id }).from(households).where(eq(households.id, householdId)).for("update");
    if (!h) throw new HttpError(404, "Family not found");
    await tx
      .update(libraryCards)
      .set({ status: input.reason })
      .where(and(eq(libraryCards.householdId, householdId), eq(libraryCards.status, "active")));
    await issueCard(tx, householdId, input.locationId, staff);
  });
  return detail(householdId);
}

export async function addChild(householdId: string, body: unknown) {
  const child = parse(childInput, body);
  const [h] = await db.select({ id: households.id }).from(households).where(eq(households.id, householdId));
  if (!h) throw new HttpError(404, "Family not found");
  await db.insert(children).values({ ...child, householdId });
  return detail(householdId);
}

