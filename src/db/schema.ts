// Friends of Literacy: families, book inventory, giveaways and surveys.
// Staff are Neon Auth users; `*_by` columns hold their user id (the JWT `sub`).
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- locations

export const locationType = pgEnum("location_type", ["branch", "school", "event", "other"]);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    // Short code printed at the start of library card numbers, e.g. "MID".
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: locationType("type").notNull().default("branch"),
    address: text("address"),
    zipCode: text("zip_code"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("locations_code_format", sql`${t.code} ~ '^[A-Z]{2,5}$'`)],
);

export const languages = pgTable("languages", {
  // ISO 639-1 where one exists ("en", "es"), otherwise ISO 639-3.
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

// ---------------------------------------------------------------- families

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  zipCode: text("zip_code").notNull(),
  // Where the family first signed up.
  homeLocationId: integer("home_location_id").notNull().references(() => locations.id),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

// Languages spoken at home.
export const householdLanguages = pgTable(
  "household_languages",
  {
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    languageCode: text("language_code").notNull().references(() => languages.code),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.languageCode] })],
);

export const cardStatus = pgEnum("card_status", ["active", "lost", "replaced", "inactive"]);

// Library card numbers look like MID-004217-3: issuing location, sequence, check digit.
export const libraryCardSeq = pgSequence("library_card_seq", { startWith: 1 });

export const libraryCards = pgTable(
  "library_cards",
  {
    id: serial("id").primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    number: text("number").notNull().unique(),
    status: cardStatus("status").notNull().default("active"),
    issuedLocationId: integer("issued_location_id").notNull().references(() => locations.id),
    issuedBy: text("issued_by").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one active card per family; old numbers stay so a lost card still finds them.
    uniqueIndex("library_cards_one_active").on(t.householdId).where(sql`${t.status} = 'active'`),
  ],
);

export const ageRange = pgEnum("age_range", [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
  "prefer_not_to_say",
]);

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    // Stored normalized (lowercase email, E.164 phone) so lookups match exactly.
    email: text("email"),
    phone: text("phone"),
    ageRange: ageRange("age_range"),
    preferredLanguageCode: text("preferred_language_code").references(() => languages.code),
    contactConsent: boolean("contact_consent").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check("guardians_email_or_phone", sql`${t.email} is not null or ${t.phone} is not null`),
    uniqueIndex("guardians_email_unique").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("guardians_phone_unique").on(t.phone).where(sql`${t.phone} is not null`),
    index("guardians_household_idx").on(t.householdId),
    index("guardians_first_name_trgm").using("gin", sql`${t.firstName} gin_trgm_ops`),
    index("guardians_last_name_trgm").using("gin", sql`${t.lastName} gin_trgm_ops`),
  ],
);

export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    birthYear: smallint("birth_year"),
    birthMonth: smallint("birth_month"),
    // True when staff entered an age and the birth year was worked out from it.
    birthYearEstimated: boolean("birth_year_estimated").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check("children_birth_month", sql`${t.birthMonth} between 1 and 12`),
    check("children_birth_year", sql`${t.birthYear} between 1990 and 2100`),
    index("children_household_idx").on(t.householdId),
    index("children_first_name_trgm").using("gin", sql`${t.firstName} gin_trgm_ops`),
  ],
);

// ---------------------------------------------------------------- books

// One row per ISBN-13, filled by the ISBN lookup + categorizer (src/books).
export const books = pgTable("books", {
  isbn: text("isbn").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  authors: text("authors").array().notNull().default([]),
  publisher: text("publisher"),
  publishedDate: text("published_date"),
  pageCount: integer("page_count"),
  description: text("description"),
  coverUrl: text("cover_url"),
  sourceCategories: text("source_categories").array().notNull().default([]),
  // "google", "openlibrary" or "google+openlibrary".
  source: text("source").notNull(),
  category: text("category").notNull(),
  // Each classification has a value, a source and a 0–1 confidence (OpenAI Decisions API only).
  // Source is the model that answered, "metadata" (language only), "rules" when no model answered
  // (retried on the next scan), "manual" or "demo".
  categoryModel: text("category_model").notNull(),
  categoryConfidence: real("category_confidence"),
  // Board Book | Picture Book | Early Reader | Chapter Book | YA | Adult (src/books/categories.ts).
  readingLevel: text("reading_level"),
  readingLevelSource: text("reading_level_source"),
  readingLevelConfidence: real("reading_level_confidence"),
  // English | Spanish | Bilingual | Other. Null when neither the metadata nor a model says.
  language: text("language"),
  languageSource: text("language_source"),
  languageConfidence: real("language_confidence"),
  // Raw code from the source, e.g. "en" or "spa".
  languageCode: text("language_code"),
  raw: jsonb("raw"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookCondition = pgEnum("book_condition", ["new", "used"]);

export const stockReason = pgEnum("stock_reason", [
  "donation", // +
  "purchase", // +
  "transfer_in", // +
  "giveaway", // -
  "transfer_out", // -
  "damaged", // -
  "adjustment", // either sign: a recount
]);

// Every change to the number of copies on hand. Stock = sum(quantity) per book, location, condition.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    isbn: text("isbn").notNull().references(() => books.isbn),
    locationId: integer("location_id").notNull().references(() => locations.id),
    condition: bookCondition("condition").notNull(),
    quantity: integer("quantity").notNull(),
    reason: stockReason("reason").notNull(),
    // Set for giveaway rows: the line it came from.
    distributionItemId: bigint("distribution_item_id", { mode: "number" }).references(() => distributionItems.id, {
      onDelete: "cascade",
    }),
    donor: text("donor"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "stock_movements_sign",
      sql`(${t.reason} in ('donation','purchase','transfer_in') and ${t.quantity} > 0)
        or (${t.reason} in ('giveaway','transfer_out','damaged') and ${t.quantity} < 0)
        or (${t.reason} = 'adjustment' and ${t.quantity} <> 0)`,
    ),
    check("stock_movements_giveaway_item", sql`(${t.reason} = 'giveaway') = (${t.distributionItemId} is not null)`),
    index("stock_movements_stock_idx").on(t.isbn, t.locationId, t.condition),
  ],
);

// ---------------------------------------------------------------- giveaways

// One visit where a family left with books.
export const distributions = pgTable(
  "distributions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id),
    locationId: integer("location_id").notNull().references(() => locations.id),
    // The card that was scanned, if any.
    cardId: integer("card_id").references(() => libraryCards.id),
    distributedAt: timestamp("distributed_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("distributions_household_idx").on(t.householdId, t.distributedAt),
    index("distributions_location_idx").on(t.locationId, t.distributedAt),
  ],
);

export const distributionItems = pgTable(
  "distribution_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    distributionId: bigint("distribution_id", { mode: "number" })
      .notNull()
      .references(() => distributions.id, { onDelete: "cascade" }),
    isbn: text("isbn").notNull().references(() => books.isbn),
    condition: bookCondition("condition").notNull(),
    quantity: integer("quantity").notNull().default(1),
    // Which child the book is for, when staff know.
    childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
  },
  (t) => [
    check("distribution_items_quantity", sql`${t.quantity} > 0`),
    index("distribution_items_isbn_idx").on(t.isbn),
    index("distribution_items_distribution_idx").on(t.distributionId),
  ],
);

// ---------------------------------------------------------------- surveys

export const questionType = pgEnum("question_type", [
  "number",
  "boolean",
  "single_choice",
  "multi_choice",
  "scale",
  "text",
]);

export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export type LocalizedText = Record<string, string>; // { en: "...", es: "..." }
export type QuestionChoice = { value: string; label: LocalizedText };

export const surveyQuestions = pgTable(
  "survey_questions",
  {
    id: serial("id").primaryKey(),
    surveyId: integer("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
    // Stable across surveys: reports group answers by key (e.g. "read_days_per_week").
    key: text("key").notNull(),
    position: integer("position").notNull(),
    type: questionType("type").notNull(),
    prompt: jsonb("prompt").$type<LocalizedText>().notNull(),
    choices: jsonb("choices").$type<QuestionChoice[]>(),
    minValue: numeric("min_value", { mode: "number" }),
    maxValue: numeric("max_value", { mode: "number" }),
    required: boolean("required").notNull().default(false),
    // Retired questions keep their answers but are no longer asked.
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("survey_questions_key").on(t.surveyId, t.key),
    check("survey_questions_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]*$'`),
  ],
);

export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    surveyId: integer("survey_id").notNull().references(() => surveys.id),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").references(() => guardians.id, { onDelete: "set null" }),
    locationId: integer("location_id").notNull().references(() => locations.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("survey_responses_household_idx").on(t.householdId, t.submittedAt)],
);

export const surveyAnswers = pgTable(
  "survey_answers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    responseId: bigint("response_id", { mode: "number" })
      .notNull()
      .references(() => surveyResponses.id, { onDelete: "cascade" }),
    questionId: integer("question_id").notNull().references(() => surveyQuestions.id),
    // Exactly one of these is set, matching the question's type.
    valueNumber: numeric("value_number", { mode: "number" }),
    valueBool: boolean("value_bool"),
    valueText: text("value_text"),
    valueChoices: text("value_choices").array(),
  },
  (t) => [
    uniqueIndex("survey_answers_once").on(t.responseId, t.questionId),
    check(
      "survey_answers_one_value",
      sql`num_nonnulls(${t.valueNumber}, ${t.valueBool}, ${t.valueText}, ${t.valueChoices}) = 1`,
    ),
  ],
);

// ---------------------------------------------------------------- staff

export const staffRole = pgEnum("staff_role", ["admin", "staff"]);

// Who may use the staff API. Anyone can create a Neon Auth account, so the API also requires the
// account's email to be verified and listed here. Add the first admin with `npm run staff:add`.
export const staffMembers = pgTable(
  "staff_members",
  {
    email: text("email").primaryKey(),
    role: staffRole("role").notNull().default("staff"),
    active: boolean("active").notNull().default(true),
    addedBy: text("added_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("staff_members_email_lower", sql`${t.email} = lower(${t.email})`)],
);
