import { timingSafeEqual } from "node:crypto";
import { attachDatabasePool } from "@neon/functions";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { CATEGORIES } from "./categories.ts";
import { categorize, hasAiProvider } from "./categorize.ts";
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

app.get("/categories", (c) => c.json({ categories: CATEGORIES }));

app.get("/books/:isbn", async (c) => {
  const isbn = normalizeIsbn(c.req.param("isbn"));
  if (!isbn) return c.json({ error: "invalid ISBN" }, 400);
  const refresh = ["1", "true"].includes(c.req.query("refresh") ?? "");

  const [cached] = await db.select().from(books).where(eq(books.isbn, isbn));
  if (cached && !refresh) {
    // A book the keyword rules categorized gets another try once an AI model is configured.
    if (cached.categoryModel === "rules" && hasAiProvider()) {
      const result = await categorize(toInfo(cached));
      if (result.model !== "rules") {
        const [row] = await db
          .update(books)
          .set({
            category: result.category,
            categoryModel: result.model,
            categoryConfidence: result.confidence,
            updatedAt: sql`now()`,
          })
          .where(eq(books.isbn, isbn))
          .returning();
        return c.json(present(row, false));
      }
    }
    return c.json(present(cached, true));
  }

  const info = await lookupBook(isbn, process.env.GOOGLE_BOOKS_API_KEY);
  if (!info) return c.json({ error: "book not found", isbn }, 404);

  const { category, model, confidence } = await categorize(info);
  const values = { ...info, category, categoryModel: model, categoryConfidence: confidence, updatedAt: sql`now()` };
  const [row] = await db
    .insert(books)
    .values(values)
    .onConflictDoUpdate({ target: books.isbn, set: values })
    .returning();
  return c.json(present(row, false));
});

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
