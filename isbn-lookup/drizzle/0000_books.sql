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
	"category_model" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
