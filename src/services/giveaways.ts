// Giving books to a family: one visit, one or more books, stock taken from the location.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { bookCondition, children, distributionItems, distributions, households, libraryCards, locations, stockMovements } from "../db/schema.ts";
import { db } from "../api/db.ts";
import { HttpError, parse } from "../api/errors.ts";
import type { Staff } from "../api/auth.ts";
import { parseCardNumber } from "../domain/cards.ts";
import { lockStock, requireIsbn } from "./books.ts";
import { detail } from "./households.ts";

const giveawayInput = z
  .object({
    householdId: z.uuid().optional(),
    cardNumber: z.string().optional(),
    locationId: z.number().int().positive(),
    items: z
      .array(
        z.object({
          isbn: z.string(),
          condition: z.enum(bookCondition.enumValues),
          quantity: z.number().int().min(1).max(50).default(1),
          childId: z.uuid().optional().nullable(),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine((g) => g.householdId || g.cardNumber, { message: "householdId or cardNumber is required", path: ["householdId"] });

export async function giveAway(body: unknown, staff: Staff) {
  const input = parse(giveawayInput, body);
  const items = input.items.map((i) => ({ ...i, isbn: requireIsbn(i.isbn) }));

  const distributionId = await db.transaction(async (tx) => {
    let householdId = input.householdId;
    let cardId: number | null = null;
    if (input.cardNumber) {
      const number = parseCardNumber(input.cardNumber);
      if (!number) throw new HttpError(400, "Not a valid library card number");
      const [card] = await tx.select().from(libraryCards).where(eq(libraryCards.number, number));
      if (!card) throw new HttpError(404, "No family has that card");
      if (card.status !== "active") {
        throw new HttpError(409, `This card was marked ${card.status}. Look the family up and use their current card.`, {
          householdId: card.householdId,
        });
      }
      if (householdId && householdId !== card.householdId) throw new HttpError(400, "That card belongs to a different family");
      householdId = card.householdId;
      cardId = card.id;
    }
    const [household] = await tx.select({ id: households.id }).from(households).where(eq(households.id, householdId!));
    if (!household) throw new HttpError(404, "Family not found");
    const [loc] = await tx.select().from(locations).where(eq(locations.id, input.locationId));
    if (!loc?.active) throw new HttpError(400, `Unknown or inactive location ${input.locationId}`);

    const childIds = [...new Set(items.flatMap((i) => (i.childId ? [i.childId] : [])))];
    if (childIds.length) {
      const found = await tx
        .select({ id: children.id })
        .from(children)
        .where(and(inArray(children.id, childIds), eq(children.householdId, household.id)));
      if (found.length !== childIds.length) throw new HttpError(400, "A selected child isn't part of this family");
    }

    // Check stock for each book/condition, locking in a fixed order so concurrent giveaways can't deadlock.
    const needed = new Map<string, { isbn: string; condition: "new" | "used"; quantity: number }>();
    for (const i of items) {
      const key = `${i.isbn}:${i.condition}`;
      const n = needed.get(key) ?? { isbn: i.isbn, condition: i.condition, quantity: 0 };
      n.quantity += i.quantity;
      needed.set(key, n);
    }
    const shortages = [];
    for (const n of [...needed.values()].sort((a, b) => `${a.isbn}${a.condition}`.localeCompare(`${b.isbn}${b.condition}`))) {
      const onHand = await lockStock(tx, n.isbn, loc.id, n.condition);
      if (onHand < n.quantity) shortages.push({ ...n, onHand });
    }
    if (shortages.length) {
      throw new HttpError(409, `Not enough copies at ${loc.code}. Add them to inventory first.`, { shortages });
    }

    const [dist] = await tx
      .insert(distributions)
      .values({ householdId: household.id, locationId: loc.id, cardId, createdBy: staff.userId })
      .returning();
    for (const i of items) {
      const [line] = await tx
        .insert(distributionItems)
        .values({ distributionId: dist.id, isbn: i.isbn, condition: i.condition, quantity: i.quantity, childId: i.childId ?? null })
        .returning();
      await tx.insert(stockMovements).values({
        isbn: i.isbn,
        locationId: loc.id,
        condition: i.condition,
        quantity: -i.quantity,
        reason: "giveaway",
        distributionItemId: line.id,
        createdBy: staff.userId,
      });
    }
    return { id: dist.id, householdId: household.id };
  });

  const family = await detail(distributionId.householdId);
  return { distributionId: distributionId.id, household: family };
}
