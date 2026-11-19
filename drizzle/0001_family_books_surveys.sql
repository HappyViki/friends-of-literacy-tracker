CREATE TYPE "public"."age_range" AS ENUM('18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."book_condition" AS ENUM('new', 'used');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'lost', 'replaced', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('branch', 'school', 'event', 'other');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('number', 'boolean', 'single_choice', 'multi_choice', 'scale', 'text');--> statement-breakpoint
CREATE TYPE "public"."stock_reason" AS ENUM('donation', 'purchase', 'transfer_in', 'giveaway', 'transfer_out', 'damaged', 'adjustment');--> statement-breakpoint
CREATE SEQUENCE "public"."library_card_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "books" (
	"isbn" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"publisher" text,
	"published_date" text,
	"page_count" integer,
	"description" text,
	"cover_url" text,
	"source_categories" text[] DEFAULT '{}' NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"category_model" text NOT NULL,
	"category_confidence" real,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"birth_year" smallint,
	"birth_month" smallint,
	"birth_year_estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "children_birth_month" CHECK ("children"."birth_month" between 1 and 12),
	CONSTRAINT "children_birth_year" CHECK ("children"."birth_year" between 1990 and 2100)
);
--> statement-breakpoint
CREATE TABLE "distribution_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"distribution_id" bigint NOT NULL,
	"isbn" text NOT NULL,
	"condition" "book_condition" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"child_id" uuid,
	CONSTRAINT "distribution_items_quantity" CHECK ("distribution_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "distributions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"location_id" integer NOT NULL,
	"card_id" integer,
	"distributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"age_range" "age_range",
	"preferred_language_code" text,
	"contact_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_email_or_phone" CHECK ("guardians"."email" is not null or "guardians"."phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "household_languages" (
	"household_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	CONSTRAINT "household_languages_household_id_language_code_pk" PRIMARY KEY("household_id","language_code")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zip_code" text NOT NULL,
	"home_location_id" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"issued_location_id" integer NOT NULL,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_cards_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "location_type" DEFAULT 'branch' NOT NULL,
	"address" text,
	"zip_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code"),
	CONSTRAINT "locations_code_format" CHECK ("locations"."code" ~ '^[A-Z]{2,5}$')
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"isbn" text NOT NULL,
	"location_id" integer NOT NULL,
	"condition" "book_condition" NOT NULL,
	"quantity" integer NOT NULL,
	"reason" "stock_reason" NOT NULL,
	"distribution_item_id" bigint,
	"donor" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_sign" CHECK (("stock_movements"."reason" in ('donation','purchase','transfer_in') and "stock_movements"."quantity" > 0)
        or ("stock_movements"."reason" in ('giveaway','transfer_out','damaged') and "stock_movements"."quantity" < 0)
        or ("stock_movements"."reason" = 'adjustment' and "stock_movements"."quantity" <> 0)),
	CONSTRAINT "stock_movements_giveaway_item" CHECK (("stock_movements"."reason" = 'giveaway') = ("stock_movements"."distribution_item_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "survey_answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"response_id" bigint NOT NULL,
	"question_id" integer NOT NULL,
	"value_number" numeric,
	"value_bool" boolean,
	"value_text" text,
	"value_choices" text[],
	CONSTRAINT "survey_answers_one_value" CHECK (num_nonnulls("survey_answers"."value_number", "survey_answers"."value_bool", "survey_answers"."value_text", "survey_answers"."value_choices") = 1)
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"key" text NOT NULL,
	"position" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" jsonb NOT NULL,
	"choices" jsonb,
	"min_value" numeric,
	"max_value" numeric,
	"required" boolean DEFAULT false NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "survey_questions_key_format" CHECK ("survey_questions"."key" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"household_id" uuid NOT NULL,
	"guardian_id" uuid,
	"location_id" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_distribution_id_distributions_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "public"."distributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_isbn_books_isbn_fk" FOREIGN KEY ("isbn") REFERENCES "public"."books"("isbn") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_items" ADD CONSTRAINT "distribution_items_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_card_id_library_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."library_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_preferred_language_code_languages_code_fk" FOREIGN KEY ("preferred_language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_languages" ADD CONSTRAINT "household_languages_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_languages" ADD CONSTRAINT "household_languages_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_home_location_id_locations_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_cards" ADD CONSTRAINT "library_cards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_cards" ADD CONSTRAINT "library_cards_issued_location_id_locations_id_fk" FOREIGN KEY ("issued_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_isbn_books_isbn_fk" FOREIGN KEY ("isbn") REFERENCES "public"."books"("isbn") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_distribution_item_id_distribution_items_id_fk" FOREIGN KEY ("distribution_item_id") REFERENCES "public"."distribution_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_survey_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "children_household_idx" ON "children" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "children_first_name_trgm" ON "children" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "distribution_items_isbn_idx" ON "distribution_items" USING btree ("isbn");--> statement-breakpoint
CREATE INDEX "distribution_items_distribution_idx" ON "distribution_items" USING btree ("distribution_id");--> statement-breakpoint
CREATE INDEX "distributions_household_idx" ON "distributions" USING btree ("household_id","distributed_at");--> statement-breakpoint
CREATE INDEX "distributions_location_idx" ON "distributions" USING btree ("location_id","distributed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_email_unique" ON "guardians" USING btree ("email") WHERE "guardians"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_phone_unique" ON "guardians" USING btree ("phone") WHERE "guardians"."phone" is not null;--> statement-breakpoint
CREATE INDEX "guardians_household_idx" ON "guardians" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "guardians_first_name_trgm" ON "guardians" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "guardians_last_name_trgm" ON "guardians" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "library_cards_one_active" ON "library_cards" USING btree ("household_id") WHERE "library_cards"."status" = 'active';--> statement-breakpoint
CREATE INDEX "stock_movements_stock_idx" ON "stock_movements" USING btree ("isbn","location_id","condition");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_answers_once" ON "survey_answers" USING btree ("response_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_questions_key" ON "survey_questions" USING btree ("survey_id","key");--> statement-breakpoint
CREATE INDEX "survey_responses_household_idx" ON "survey_responses" USING btree ("household_id","submitted_at");