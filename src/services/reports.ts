// Program reports. All filters are optional: from/to (dates, inclusive) and a location.
import { z } from "zod";
import { pool } from "../api/db.ts";
import { parse } from "../api/errors.ts";

const filterInput = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  locationId: z.coerce.number().int().positive().optional(),
});

type Filters = { from: string | null; to: string | null; loc: number | null; survey?: string | null };

/** Run SQL written with :from, :to, :loc and :survey placeholders, passing only the ones it uses. */
async function q<T extends Record<string, unknown>>(text: string, f: Filters) {
  const names: (keyof Filters)[] = [];
  const sql = text.replace(/:(from|to|loc|survey)\b/g, (_, name: keyof Filters) => {
    if (!names.includes(name)) names.push(name);
    return "$" + (names.indexOf(name) + 1);
  });
  return (await pool.query<T>(sql, names.map((n) => f[n]))).rows;
}

export async function summary(query: Record<string, string | undefined>) {
  const f = parse(filterInput, query);
  const p: Filters = { from: f.from ?? null, to: f.to ?? null, loc: f.locationId ?? null };
  const inRange = (col: string) =>
    `(:from::date is null or ${col} >= :from::date) and (:to::date is null or ${col} < :to::date + 1)`;
  const dist = `${inRange("d.distributed_at")} and (:loc::int is null or d.location_id = :loc)`;

  const [
    families,
    totals,
    byCondition,
    byCategory,
    byLocation,
    byMonth,
    byAgeBracket,
    byAgeAndCategory,
    stock,
    readDays,
    readDaysChange,
    booksInHome,
    everyoneReads,
    byLanguage,
  ] = await Promise.all([
    q(
      // "Returning": served in the range and has at least two visits overall (up to the range's end),
      // so a family that came back within the range counts as well as one first seen before it.
      `with served as (select distinct d.household_id from distributions d where ${dist}),
            visits as (select household_id, count(*) as n from distributions d
                       where :to::date is null or d.distributed_at < :to::date + 1 group by household_id)
       select (select count(*) from served)::int as served,
              (select count(*) from served s join visits v using (household_id) where v.n >= 2)::int as returning,
              (select count(*) from households h
                 where ${inRange("h.created_at")} and (:loc::int is null or h.home_location_id = :loc))::int as signed_up`,
      p,
    ),
    q(
      `select coalesce(sum(i.quantity), 0)::int as books, count(distinct d.id)::int as visits
       from distributions d join distribution_items i on i.distribution_id = d.id where ${dist}`,
      p,
    ),
    q(
      `select i.condition, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id where ${dist}
       group by 1 order by 2 desc`,
      p,
    ),
    q(
      `select b.category, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id join books b on b.isbn = i.isbn
       where ${dist} group by 1 order by 2 desc`,
      p,
    ),
    q(
      `select l.code as location, l.name, sum(i.quantity)::int as books, count(distinct d.household_id)::int as families
       from distributions d join distribution_items i on i.distribution_id = d.id join locations l on l.id = d.location_id
       where ${dist} group by 1, 2 order by 3 desc`,
      p,
    ),
    q(
      `select to_char(date_trunc('month', d.distributed_at), 'YYYY-MM') as month, sum(i.quantity)::int as books,
              count(distinct d.household_id)::int as families
       from distributions d join distribution_items i on i.distribution_id = d.id
       where ${dist} group by 1 order by 1`,
      p,
    ),
    // Age at the time the book was given, for books given to a specific child.
    q(
      `select child_age_bracket(c.birth_year, c.birth_month, d.distributed_at) as age_bracket, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id join children c on c.id = i.child_id
       where ${dist} group by 1 order by 1`,
      p,
    ),
    q(
      `select child_age_bracket(c.birth_year, c.birth_month, d.distributed_at) as age_bracket, b.category,
              sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id
       join children c on c.id = i.child_id join books b on b.isbn = i.isbn
       where ${dist} group by 1, 2 order by 1, 3 desc`,
      p,
    ),
    q(
      `select l.code as location, s.condition, sum(s.on_hand)::int as on_hand, count(*) filter (where s.on_hand > 0)::int as titles
       from stock_on_hand s join locations l on l.id = s.location_id
       where (:loc::int is null or s.location_id = :loc) group by 1, 2 order by 1, 2`,
      p,
    ),
    // Survey answers, grouped by question key so every survey that asks it counts.
    q(
      `select round(avg(a.value_number), 2)::float as average, count(*)::int as responses
       from survey_answers a join survey_questions sq on sq.id = a.question_id join survey_responses r on r.id = a.response_id
       where sq.key = 'read_days_per_week' and ${inRange("r.submitted_at")} and (:loc::int is null or r.location_id = :loc)`,
      p,
    ),
    // Families with at least two answers: their first answer vs. their latest.
    q(
      `with answers as (
         select r.household_id, r.submitted_at, a.value_number,
                row_number() over (partition by r.household_id order by r.submitted_at) as first_rank,
                row_number() over (partition by r.household_id order by r.submitted_at desc) as last_rank,
                count(*) over (partition by r.household_id) as n
         from survey_answers a join survey_questions sq on sq.id = a.question_id join survey_responses r on r.id = a.response_id
         where sq.key = 'read_days_per_week' and (:loc::int is null or r.location_id = :loc)
           and (:to::date is null or r.submitted_at < :to::date + 1))
       select count(distinct household_id)::int as families,
              round(avg(value_number) filter (where first_rank = 1), 2)::float as first_average,
              round(avg(value_number) filter (where last_rank = 1), 2)::float as latest_average
       from answers where n >= 2`,
      p,
    ),
    // Latest answer per family.
    q(
      `select answer, count(*)::int as families from (
         select distinct on (r.household_id) r.household_id, a.value_text as answer
         from survey_answers a join survey_questions sq on sq.id = a.question_id join survey_responses r on r.id = a.response_id
         where sq.key = 'books_in_home' and (:loc::int is null or r.location_id = :loc) and (:to::date is null or r.submitted_at < :to::date + 1)
         order by r.household_id, r.submitted_at desc) latest
       group by 1 order by 1`,
      p,
    ),
    q(
      `select count(*) filter (where answer)::int as yes, count(*) filter (where not answer)::int as no,
              round(100.0 * count(*) filter (where answer) / nullif(count(*), 0), 1)::float as percent_yes
       from (
         select distinct on (r.household_id) r.household_id, a.value_bool as answer
         from survey_answers a join survey_questions sq on sq.id = a.question_id join survey_responses r on r.id = a.response_id
         where sq.key = 'everyone_reads' and (:loc::int is null or r.location_id = :loc) and (:to::date is null or r.submitted_at < :to::date + 1)
         order by r.household_id, r.submitted_at desc) latest`,
      p,
    ),
    q(
      `select coalesce(lang.name, hl.language_code) as language, count(distinct d.household_id)::int as families,
              sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id
       join household_languages hl on hl.household_id = d.household_id left join languages lang on lang.code = hl.language_code
       where ${dist} group by 1 order by 3 desc`,
      p,
    ),
  ]);

  const [byReadingLevel, byBookLanguage, byAgeAndReadingLevel] = await Promise.all([
    q(
      `select coalesce(b.reading_level, 'Unknown') as reading_level, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id join books b on b.isbn = i.isbn
       where ${dist} group by 1 order by 2 desc`,
      p,
    ),
    q(
      `select coalesce(b.language, 'Unknown') as language, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id join books b on b.isbn = i.isbn
       where ${dist} group by 1 order by 2 desc`,
      p,
    ),
    q(
      `select child_age_bracket(c.birth_year, c.birth_month, d.distributed_at) as age_bracket,
              coalesce(b.reading_level, 'Unknown') as reading_level, sum(i.quantity)::int as books
       from distributions d join distribution_items i on i.distribution_id = d.id
       join children c on c.id = i.child_id join books b on b.isbn = i.isbn
       where ${dist} group by 1, 2 order by 1, 3 desc`,
      p,
    ),
  ]);

  return {
    filters: f,
    families: families[0],
    booksGivenAway: {
      ...totals[0],
      byCondition,
      byCategory,
      byReadingLevel,
      byBookLanguage,
      byLocation,
      byMonth,
      byChildAgeBracket: byAgeBracket,
      byChildAgeBracketAndCategory: byAgeAndCategory,
      byChildAgeBracketAndReadingLevel: byAgeAndReadingLevel,
      byHomeLanguage: byLanguage,
    },
    stockOnHand: stock,
    surveys: {
      readDaysPerWeek: { ...readDays[0], changeForReturningFamilies: readDaysChange[0] },
      booksInHome: booksInHome,
      everyoneReads: everyoneReads[0],
    },
  };
}

const coverageInput = filterInput.extend({
  survey: z.string().regex(/^[a-z][a-z0-9_]*$/).default("intake"),
});

/**
 * Survey coverage: of the families with a visit (giveaway) in the range, which have never answered
 * the given survey. Counts families, not visits, since one family can visit many times.
 */
export async function surveyCoverage(query: Record<string, string | undefined>) {
  const f = parse(coverageInput, query);
  const p: Filters = { from: f.from ?? null, to: f.to ?? null, loc: f.locationId ?? null, survey: f.survey };
  const inRange = (col: string) =>
    `(:from::date is null or ${col} >= :from::date) and (:to::date is null or ${col} < :to::date + 1)`;
  const visited = `
    visited as (
      select d.household_id, count(*)::int as visits, max(d.distributed_at) as last_visit_at,
             (array_agg(l.code order by d.distributed_at desc))[1] as last_location
      from distributions d join locations l on l.id = d.location_id
      where ${inRange("d.distributed_at")} and (:loc::int is null or d.location_id = :loc)
      group by d.household_id),
    surveyed as (
      select distinct r.household_id from survey_responses r join surveys sv on sv.id = r.survey_id
      where sv.key = :survey)`;

  const [[totals], [responses], missing] = await Promise.all([
    q<{ visits: number; families_visited: number; families_surveyed: number }>(
      `with ${visited}
       select coalesce(sum(v.visits), 0)::int as visits, count(*)::int as families_visited,
              count(s.household_id)::int as families_surveyed
       from visited v left join surveyed s using (household_id)`,
      p,
    ),
    q<{ responses: number }>(
      `select count(*)::int as responses from survey_responses r join surveys sv on sv.id = r.survey_id
       where sv.key = :survey and ${inRange("r.submitted_at")} and (:loc::int is null or r.location_id = :loc)`,
      p,
    ),
    q(
      `with ${visited}
       select h.id as "householdId", c.number as "cardNumber", g.first_name as "firstName", g.last_name as "lastName",
              g.email, g.phone, h.zip_code as "zipCode", v.visits, v.last_visit_at as "lastVisitAt",
              v.last_location as "lastLocation"
       from visited v
       join households h on h.id = v.household_id
       left join surveyed s on s.household_id = v.household_id
       left join library_cards c on c.household_id = h.id and c.status = 'active'
       left join lateral (select first_name, last_name, email, phone from guardians
                          where household_id = h.id order by created_at limit 1) g on true
       where s.household_id is null
       order by v.visits desc, v.last_visit_at desc
       limit 1000`,
      p,
    ),
  ]);

  const missingCount = totals.families_visited - totals.families_surveyed;
  return {
    filters: f,
    visits: totals.visits,
    surveyResponses: responses.responses,
    familiesVisited: totals.families_visited,
    familiesSurveyed: totals.families_surveyed,
    familiesMissing: missingCount,
    coveragePercent: totals.families_visited ? Math.round((1000 * totals.families_surveyed) / totals.families_visited) / 10 : null,
    missing,
  };
}
