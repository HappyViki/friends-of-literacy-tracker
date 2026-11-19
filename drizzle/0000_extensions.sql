-- Typo-tolerant name search (guardian and child names) for finding returning families.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Remove the starter app's demo table.
DROP TABLE IF EXISTS notes;
