import { timingSafeEqual } from "node:crypto";
import { attachDatabasePool } from "@neon/functions";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { CATEGORIES, LANGUAGES, READING_LEVELS } from "./categories.ts";
import { classify, hasAiProvider, type Classification } from "./categorize.ts";
import { books, type BookRow } from "./db/schema.ts";
import { normalizeIsbn } from "./isbn.ts";
import { lookupBook } from "./lookup.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
const db = drizzle(pool);

const app = new Hono();
app.use("*", cors({ origin: "*", allowHeaders: ["authorization", "x-api-key", "content-type"] }));

app.get("/", (c) => c.json({ ok: true, routes: ["GET /books/:isbn", "GET /categories"] }));

// The function URL is public, so every other route needs the API key.
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const expected = process.env.BOOKS_API_KEY;
  if (!expected) return c.json({ error: "BOOKS_API_KEY is not configured" }, 500);
  const header = c.req.header("x-api-key") ?? c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/categories", (c) =>
  c.json({
    categories: CATEGORIES,
    readingLevels: READING_LEVELS.map((o) => o.value),
    languages: LANGUAGES.map((o) => o.value),
  }),
);

app.get("/books/:isbn", async (c) => {
  const isbn = normalizeIsbn(c.req.param("isbn"));
  if (!isbn) return c.json({ error: "invalid ISBN" }, 400);
  const refresh = ["1", "true"].includes(c.req.query("refresh") ?? "");

  const [cached] = await db.select().from(books).where(eq(books.isbn, isbn));
  if (cached && !refresh) {
    if (!needsClassifying(cached)) return c.json(present(cached, true));
    const [row] = await db
      .update(books)
      .set({ ...classificationColumns(await classify(toInfo(cached))), updatedAt: sql`now()` })
      .where(eq(books.isbn, isbn))
      .returning();
    return c.json(present(row, true));
  }

  const info = await lookupBook(isbn, process.env.GOOGLE_BOOKS_API_KEY);
  if (!info) return c.json({ error: "book not found", isbn }, 404);

  const values = { ...info, ...classificationColumns(await classify(info)), updatedAt: sql`now()` };
  const [row] = await db
    .insert(books)
    .values(values)
    .onConflictDoUpdate({ target: books.isbn, set: values })
    .returning();
  return c.json(present(row, false));
});

/**
 * A cached row is classified again when it predates the reading-level column, or when an AI
 * provider is configured and some answer came from rules or is missing.
 */
function needsClassifying(row: BookRow): boolean {
  if (row.readingLevel === null) return true;
  if (!hasAiProvider()) return false;
  return row.categoryModel === "rules" || row.readingLevelSource === "rules" || row.language === null;
}

function classificationColumns(c: Classification) {
  return {
    category: c.category.value,
    categoryModel: c.category.source,
    categoryConfidence: c.category.confidence,
    readingLevel: c.readingLevel.value,
    readingLevelSource: c.readingLevel.source,
    readingLevelConfidence: c.readingLevel.confidence,
    language: c.language?.value ?? null,
    languageSource: c.language?.source ?? null,
    languageConfidence: c.language?.confidence ?? null,
  };
}

app.onError((err, c) => {
  console.error("[books]", err);
  return c.json({ error: "internal error" }, 500);
});

function present(row: BookRow, cached: boolean) {
  const { raw: _raw, createdAt: _c, updatedAt: _u, ...book } = row;
  return { ...book, cached };
}

function toInfo(row: BookRow) {
  return { ...row, source: row.source as "google", raw: {} };
}

export default app;
