import { integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const books = pgTable("books", {
  // Always ISBN-13, so the ISBN-10 and ISBN-13 of one edition share a row.
  isbn: text("isbn").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  authors: text("authors").array().notNull().default([]),
  publisher: text("publisher"),
  publishedDate: text("published_date"),
  pageCount: integer("page_count"),
  description: text("description"),
  coverUrl: text("cover_url"),
  // Subjects/categories reported by Google Books or Open Library.
  sourceCategories: text("source_categories").array().notNull().default([]),
  // Which API the metadata came from: "google", "openlibrary", or "google+openlibrary".
  source: text("source").notNull(),
  category: text("category").notNull(),
  // Model that picked the category, or "rules" when no model answered (retried on the next lookup).
  categoryModel: text("category_model").notNull(),
  // 0–1 confidence from the OpenAI Decisions API; null for chat models and rules.
  categoryConfidence: real("category_confidence"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookRow = typeof books.$inferSelect;
