// Book catalog (ISBN scan → lookup → categorize), stock per location, and giveaway history.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bookCondition,
  books,
  children,
  distributionItems,
  distributions,
  libraryCards,
  locations,
  stockMovements,
  type books as BooksTable,
} from "../db/schema.ts";
import { db, pool, type Tx } from "../api/db.ts";
import { HttpError, parse } from "../api/errors.ts";
import type { Staff } from "../api/auth.ts";
import { CATEGORIES } from "../books/categories.ts";
import { categorize, hasAiProvider } from "../books/categorize.ts";
import { lookupBook } from "../books/lookup.ts";
import { normalizeIsbn } from "../books/isbn.ts";

type BookRow = typeof BooksTable.$inferSelect;
type Condition = (typeof bookCondition.enumValues)[number];

export function requireIsbn(input: string): string {
  const isbn = normalizeIsbn(input);
  if (!isbn) throw new HttpError(400, "Not a valid ISBN. Check the number under the barcode.");
  return isbn;
}

/**
 * The catalog row for an ISBN. Looks the book up and categorizes it the first time it is scanned.
 * `firstScan` is true when this call added it to the catalog.
 */
export async function ensureBook(isbnInput: string, opts: { refresh?: boolean } = {}): Promise<{ book: BookRow; firstScan: boolean }> {
  const isbn = requireIsbn(isbnInput);
  const [cached] = await db.select().from(books).where(eq(books.isbn, isbn));
  if (cached && !opts.refresh) {
    // A book the keyword rules categorized gets another try once an AI model is configured.
    if (cached.categoryModel === "rules" && hasAiProvider()) {
      const result = await categorize({ ...cached, source: cached.source as "google", raw: {} });
      if (result.model !== "rules") {
        const [row] = await db
          .update(books)
          .set({ category: result.category, categoryModel: result.model, categoryConfidence: result.confidence, updatedAt: sql`now()` })
          .where(eq(books.isbn, isbn))
          .returning();
        return { book: row, firstScan: false };
      }
    }
    return { book: cached, firstScan: false };
  }
  if (cached?.categoryModel === "manual" && opts.refresh) return { book: cached, firstScan: false };

  const info = await lookupBook(isbn, process.env.GOOGLE_BOOKS_API_KEY);
  if (!info) {
    if (cached) return { book: cached, firstScan: false };
    throw new HttpError(404, "Couldn't find this ISBN in Google Books or Open Library. Add it by hand.", { isbn, code: "isbn_not_found" });
  }
  const { category, model, confidence } = await categorize(info);
  const values = { ...info, category, categoryModel: model, categoryConfidence: confidence, updatedAt: sql`now()` };
  const [row] = await db.insert(books).values(values).onConflictDoUpdate({ target: books.isbn, set: values }).returning();
  return { book: row, firstScan: !cached };
}

const manualBookInput = z.object({
  isbn: z.string(),
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  category: z.enum(CATEGORIES),
});

/** For books the lookup services don't know (older or local printings). */
export async function addBookByHand(body: unknown) {
  const input = parse(manualBookInput, body);
  const isbn = requireIsbn(input.isbn);
  const values = {
    isbn,
    title: input.title,
    authors: input.authors,
    source: "manual",
    category: input.category,
    categoryModel: "manual",
    categoryConfidence: null,
    updatedAt: sql`now()`,
  };
  const [row] = await db.insert(books).values(values).onConflictDoUpdate({ target: books.isbn, set: values }).returning();
  return present(row);
}

function present(row: BookRow) {
  const { raw: _raw, ...book } = row;
  return book;
}

export async function stockFor(isbn: string) {
  const { rows } = await pool.query<{ location_id: number; location: string; condition: Condition; on_hand: number }>(
    `select s.location_id, l.code as location, s.condition, s.on_hand
     from stock_on_hand s join locations l on l.id = s.location_id
     where s.isbn = $1 and s.on_hand <> 0
     order by l.code, s.condition`,
    [isbn],
  );
  return rows.map((r) => ({ locationId: r.location_id, location: r.location, condition: r.condition, onHand: r.on_hand }));
}

/** Everything staff see after scanning a book: catalog details, copies on hand, and when it was given away. */
export async function scan(isbnInput: string, opts: { refresh?: boolean } = {}) {
  const { book, firstScan } = await ensureBook(isbnInput, opts);
  const [stock, history] = await Promise.all([
    stockFor(book.isbn),
    db
      .select({
        distributedAt: distributions.distributedAt,
        location: locations.code,
        householdId: distributions.householdId,
        cardNumber: libraryCards.number,
        condition: distributionItems.condition,
        quantity: distributionItems.quantity,
        forChild: children.firstName,
      })
      .from(distributionItems)
      .innerJoin(distributions, eq(distributions.id, distributionItems.distributionId))
      .innerJoin(locations, eq(locations.id, distributions.locationId))
      .leftJoin(libraryCards, eq(libraryCards.id, distributions.cardId))
      .leftJoin(children, eq(children.id, distributionItems.childId))
      .where(eq(distributionItems.isbn, book.isbn))
      .orderBy(desc(distributions.distributedAt))
      .limit(100),
  ]);
  const given = await pool.query<{ total: number; last: Date | null }>(
    `select coalesce(sum(quantity), 0)::int as total, max(d.distributed_at) as last
     from distribution_items i join distributions d on d.id = i.distribution_id where i.isbn = $1`,
    [book.isbn],
  );
  return {
    book: present(book),
    firstScan,
    stock,
    onHand: stock.reduce((n, s) => n + s.onHand, 0),
    givenAway: { total: given.rows[0].total, lastGivenAt: given.rows[0].last },
    giveaways: history,
  };
}

/** Serialize stock changes for one book/location/condition and return the current count. */
export async function lockStock(tx: Tx, isbn: string, locationId: number, condition: Condition): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${isbn}:${locationId}:${condition}`}))`);
  const [row] = await tx
    .select({ onHand: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)::int` })
    .from(stockMovements)
    .where(and(eq(stockMovements.isbn, isbn), eq(stockMovements.locationId, locationId), eq(stockMovements.condition, condition)));
  return row.onHand;
}

async function requireLocation(tx: Tx, id: number) {
  const [loc] = await tx.select().from(locations).where(eq(locations.id, id));
  if (!loc || !loc.active) throw new HttpError(400, `Unknown or inactive location ${id}`);
  return loc;
}

const conditionField = z.enum(bookCondition.enumValues);

const receiveInput = z.object({
  isbn: z.string(),
  locationId: z.number().int().positive(),
  condition: conditionField,
  quantity: z.number().int().min(1).max(5000).default(1),
  reason: z.enum(["donation", "purchase"]).default("donation"),
  donor: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** Add copies to a location's stock. Scans (and catalogs) the ISBN first if it's new. */
export async function receive(body: unknown, staff: Staff) {
  const input = parse(receiveInput, body);
  const { book, firstScan } = await ensureBook(input.isbn);
  await db.transaction(async (tx) => {
    await requireLocation(tx, input.locationId);
    await tx.insert(stockMovements).values({
      isbn: book.isbn,
      locationId: input.locationId,
      condition: input.condition,
      quantity: input.quantity,
      reason: input.reason,
      donor: input.donor ?? null,
      note: input.note ?? null,
      createdBy: staff.userId,
    });
  });
  return { book: present(book), firstScan, stock: await stockFor(book.isbn) };
}

const transferInput = z.object({
  isbn: z.string(),
  fromLocationId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  condition: conditionField,
  quantity: z.number().int().min(1).max(5000),
  note: z.string().trim().max(1000).optional().nullable(),
});

export async function transfer(body: unknown, staff: Staff) {
  const input = parse(transferInput, body);
  if (input.fromLocationId === input.toLocationId) throw new HttpError(400, "Pick two different locations");
  const isbn = requireIsbn(input.isbn);
  await db.transaction(async (tx) => {
    await requireLocation(tx, input.fromLocationId);
    await requireLocation(tx, input.toLocationId);
    const onHand = await lockStock(tx, isbn, input.fromLocationId, input.condition);
    if (onHand < input.quantity) {
      throw new HttpError(409, `Only ${onHand} ${input.condition} copies on hand at that location`, { onHand });
    }
    const common = { isbn, condition: input.condition, note: input.note ?? null, createdBy: staff.userId };
    await tx.insert(stockMovements).values([
      { ...common, locationId: input.fromLocationId, quantity: -input.quantity, reason: "transfer_out" },
      { ...common, locationId: input.toLocationId, quantity: input.quantity, reason: "transfer_in" },
    ]);
  });
  return { isbn, stock: await stockFor(isbn) };
}

const adjustInput = z.object({
  isbn: z.string(),
  locationId: z.number().int().positive(),
  condition: conditionField,
  // Negative to remove copies. "damaged" must remove; "adjustment" (a recount) may go either way.
  delta: z.number().int().min(-5000).max(5000).refine((n) => n !== 0, "can't be 0"),
  reason: z.enum(["damaged", "adjustment"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

export async function adjust(body: unknown, staff: Staff) {
  const input = parse(adjustInput, body);
  if (input.reason === "damaged" && input.delta > 0) throw new HttpError(400, "Damaged books can only be removed (use a negative number)");
  const isbn = requireIsbn(input.isbn);
  await db.transaction(async (tx) => {
    await requireLocation(tx, input.locationId);
    const onHand = await lockStock(tx, isbn, input.locationId, input.condition);
    if (onHand + input.delta < 0) throw new HttpError(409, `Only ${onHand} ${input.condition} copies on hand`, { onHand });
    await tx.insert(stockMovements).values({
      isbn,
      locationId: input.locationId,
      condition: input.condition,
      quantity: input.delta,
      reason: input.reason,
      note: input.note ?? null,
      createdBy: staff.userId,
    });
  });
  return { isbn, stock: await stockFor(isbn) };
}

/** Copies on hand, optionally for one location. */
export async function inventory(locationId?: number) {
  const { rows } = await pool.query(
    `select s.isbn, b.title, b.authors, b.category, l.id as "locationId", l.code as location, s.condition, s.on_hand as "onHand"
     from stock_on_hand s
     join books b on b.isbn = s.isbn
     join locations l on l.id = s.location_id
     where s.on_hand > 0 and ($1::int is null or s.location_id = $1)
     order by b.title, l.code, s.condition`,
    [locationId ?? null],
  );
  return rows;
}
