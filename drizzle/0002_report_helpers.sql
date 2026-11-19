-- Child age bracket on a given date. Same rules as src/domain/age.ts: without a birth month,
-- the birthday is assumed to be in July.
CREATE OR REPLACE FUNCTION child_age_bracket(birth_year integer, birth_month integer, at timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN birth_year IS NULL THEN 'unknown'
    ELSE (
      SELECT CASE
        WHEN age <= 2 THEN '0-2' WHEN age <= 5 THEN '3-5' WHEN age <= 8 THEN '6-8'
        WHEN age <= 12 THEN '9-12' WHEN age <= 17 THEN '13-17' ELSE '18+' END
      FROM (SELECT greatest(0, extract(year FROM at AT TIME ZONE 'UTC')::int - birth_year
        - CASE WHEN extract(month FROM at AT TIME ZONE 'UTC')::int < coalesce(birth_month, 7) THEN 1 ELSE 0 END) AS age) a
    )
  END
$$;
--> statement-breakpoint
-- Copies on hand per book, location and condition.
CREATE OR REPLACE VIEW stock_on_hand AS
  SELECT isbn, location_id, condition, sum(quantity)::int AS on_hand
  FROM stock_movements
  GROUP BY isbn, location_id, condition;
