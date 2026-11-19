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
  // Each classification has a value, a source and a confidence. The source is the model that
  // answered (e.g. "openai-decisions:gpt-6-luna"), "metadata" (language only), or "rules" when no
  // model answered; "rules" answers are retried on the next lookup. Confidence is 0–1 from the
  // OpenAI Decisions API and null otherwise.
  category: text("category").notNull(),
  categoryModel: text("category_model").notNull(),
  categoryConfidence: real("category_confidence"),
  // Board Book | Picture Book | Early Reader | Chapter Book | YA | Adult. Null only on rows saved
  // before this column existed; those are classified on their next lookup.
  readingLevel: text("reading_level"),
  readingLevelSource: text("reading_level_source"),
  readingLevelConfidence: real("reading_level_confidence"),
  // English | Spanish | Other. Null when neither the metadata nor a model says.
  language: text("language"),
  languageSource: text("language_source"),
  languageConfidence: real("language_confidence"),
  // Raw code from the source, e.g. "en" or "spa".
  languageCode: text("language_code"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookRow = typeof books.$inferSelect;
