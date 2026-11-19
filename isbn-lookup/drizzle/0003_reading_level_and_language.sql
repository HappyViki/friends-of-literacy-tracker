ALTER TABLE "books" ADD COLUMN "reading_level" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "reading_level_source" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "reading_level_confidence" real;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "language_source" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "language_confidence" real;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "language_code" text;