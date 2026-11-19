// "Build your own reports": one Excel workbook (opens in Excel and Google Sheets) with tidy, flat
// tabs made for pivot tables and filters. Activity tabs follow the date/location filters; the
// people tabs (families, adults, children) always include everyone.
import ExcelJS from "exceljs";
import { z } from "zod";
import { pool } from "../api/db.ts";
import { parse } from "../api/errors.ts";
import { ANSWER_NUMBER } from "./reports.ts";

const exportInput = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  locationId: z.coerce.number().int().positive().optional(),
});

// Dates are reported in the organization's time zone, so an evening visit isn't filed under the next day.
const TZ = process.env.ORG_TIMEZONE || "America/Los_Angeles";

type Params = { from: string | null; to: string | null; loc: number | null; tz: string };

/** Run SQL written with :from, :to, :loc and :tz placeholders, passing only the ones it uses. */
async function q<T extends Record<string, unknown>>(text: string, p: Params): Promise<T[]> {
  const names: (keyof Params)[] = [];
  const sql = text.replace(/:(from|to|loc|tz)\b/g, (_, name: keyof Params) => {
    if (!names.includes(name)) names.push(name);
    return "$" + (names.indexOf(name) + 1);
  });
  return (await pool.query<T>(sql, names.map((n) => p[n]))).rows;
}

// Local calendar day of a timestamptz, as text.
const day = (col: string) => `to_char((${col} at time zone :tz)::date, 'YYYY-MM-DD')`;
const inRange = (col: string) =>
  `(:from::date is null or (${col} at time zone :tz)::date >= :from::date) and (:to::date is null or (${col} at time zone :tz)::date <= :to::date)`;
const ageAt = (at: string) =>
  `case when c.birth_year is null then null else greatest(0, extract(year from (${at} at time zone :tz))::int - c.birth_year
     - case when extract(month from (${at} at time zone :tz))::int < coalesce(c.birth_month, 7) then 1 else 0 end) end`;

// Per-family attributes shared by several tabs.
const FAMILY = `
  family as (
    select h.id, h.zip_code, h.created_at, hl.code as home_location, hl.name as home_location_name,
           (select number from library_cards lc where lc.household_id = h.id and lc.status = 'active' limit 1) as card,
           (select string_agg(coalesce(l.name, x.language_code), ', ' order by coalesce(l.name, x.language_code))
              from household_languages x left join languages l on l.code = x.language_code where x.household_id = h.id) as languages
    from households h join locations hl on hl.id = h.home_location_id)`;

type ColType = "text" | "number" | "date" | "yesno";
type Col = { header: string; key: string; type?: ColType; width?: number; note: string };
type Sheet = { name: string; about: string; columns: Col[]; rows: Record<string, unknown>[] };

const C = (header: string, key: string, note: string, type: ColType = "text", width?: number): Col => ({ header, key, type, width, note });

export async function workbook(query: Record<string, string | undefined>) {
  const f = parse(exportInput, query);
  const p: Params = { from: f.from ?? null, to: f.to ?? null, loc: f.locationId ?? null, tz: TZ };
  const locFilter = (col: string) => `(:loc::int is null or ${col} = :loc)`;

  const [booksGiven, visits, families, adults, kids, answers, received, stock, [locationRow]] = await Promise.all([
    q(
      `with ${FAMILY}
       select ${day("d.distributed_at")} as date, to_char(d.distributed_at at time zone :tz, 'YYYY-MM') as month,
              extract(year from d.distributed_at at time zone :tz)::int as year,
              l.code as location, l.name as location_name, l.type as location_type,
              f.card, f.zip_code, f.languages as home_languages,
              c.first_name as child, ${ageAt("d.distributed_at")} as child_age,
              case when c.id is null then null else child_age_bracket(c.birth_year, c.birth_month, d.distributed_at) end as child_age_bracket,
              b.isbn, b.title, array_to_string(b.authors, ', ') as authors, b.category as genre, b.reading_level, b.language as book_language,
              i.condition, i.quantity, d.id as visit_id
       from distributions d
       join distribution_items i on i.distribution_id = d.id
       join books b on b.isbn = i.isbn
       join locations l on l.id = d.location_id
       join family f on f.id = d.household_id
       left join children c on c.id = i.child_id
       where ${inRange("d.distributed_at")} and ${locFilter("d.location_id")}
       order by d.distributed_at, i.id`,
      p,
    ),
    q(
      `with ${FAMILY},
       numbered as (select d.*, row_number() over (partition by d.household_id order by d.distributed_at) as n from distributions d)
       select d.id as visit_id, ${day("d.distributed_at")} as date, to_char(d.distributed_at at time zone :tz, 'YYYY-MM') as month,
              l.code as location, l.name as location_name, f.card, f.zip_code, f.languages as home_languages,
              (d.n = 1) as first_visit, d.n as visit_number,
              (select coalesce(sum(quantity), 0)::int from distribution_items i where i.distribution_id = d.id) as books,
              (select count(distinct child_id)::int from distribution_items i where i.distribution_id = d.id) as children_served
       from numbered d join locations l on l.id = d.location_id join family f on f.id = d.household_id
       where ${inRange("d.distributed_at")} and ${locFilter("d.location_id")}
       order by d.distributed_at`,
      p,
    ),
    q(
      `with ${FAMILY},
       latest as (
         select distinct on (r.household_id, sq.key) r.household_id, sq.key, ${ANSWER_NUMBER()} as value_number, a.value_bool, a.value_text
         from survey_answers a join survey_questions sq on sq.id = a.question_id join survey_responses r on r.id = a.response_id
         where sq.key in ('books_in_home', 'everyone_reads', 'read_days_per_week', 'child_enjoys_reading', 'visit_rating')
         order by r.household_id, sq.key, r.submitted_at desc)
       select f.card, ${day("f.created_at")} as signed_up, f.home_location, f.home_location_name, f.zip_code, f.languages as home_languages,
              (select count(*)::int from guardians g where g.household_id = f.id) as adults,
              (select count(*)::int from children c where c.household_id = f.id) as children,
              (select count(*)::int from distributions d where d.household_id = f.id) as visits,
              (select coalesce(sum(i.quantity), 0)::int from distributions d join distribution_items i on i.distribution_id = d.id where d.household_id = f.id) as books_received,
              (select ${day("min(d.distributed_at)")} from distributions d where d.household_id = f.id) as first_visit,
              (select ${day("max(d.distributed_at)")} from distributions d where d.household_id = f.id) as last_visit,
              exists (select 1 from survey_responses r join surveys s on s.id = r.survey_id where r.household_id = f.id and s.key = 'intake') as has_intake,
              (select count(*)::int from survey_responses r where r.household_id = f.id) as surveys_taken,
              (select value_text from latest where household_id = f.id and key = 'books_in_home') as books_in_home,
              (select value_bool from latest where household_id = f.id and key = 'everyone_reads') as everyone_reads,
              (select value_number from latest where household_id = f.id and key = 'read_days_per_week') as read_days_per_week,
              (select value_number from latest where household_id = f.id and key = 'child_enjoys_reading') as child_enjoys_reading,
              (select value_number from latest where household_id = f.id and key = 'visit_rating') as visit_rating
       from family f order by f.created_at`,
      p,
    ),
    q(
      `with ${FAMILY}
       select f.card, g.first_name, g.last_name, g.email, g.phone, g.age_range, l.name as preferred_language, g.contact_consent,
              f.home_location, f.zip_code
       from guardians g join family f on f.id = g.household_id left join languages l on l.code = g.preferred_language_code
       order by f.created_at, g.created_at`,
      p,
    ),
    q(
      `with ${FAMILY}
       select f.card, c.first_name, c.birth_year, c.birth_month, c.birth_year_estimated,
              ${ageAt("now()")} as age_today, child_age_bracket(c.birth_year, c.birth_month, now()) as age_bracket_today,
              (select coalesce(sum(i.quantity), 0)::int from distribution_items i where i.child_id = c.id) as books_received,
              f.home_location, f.zip_code
       from children c join family f on f.id = c.household_id
       order by f.created_at, c.created_at`,
      p,
    ),
    q(
      `with ${FAMILY}
       select ${day("r.submitted_at")} as date, s.name as survey, sq.key as question_key, sq.prompt->>'en' as question,
              coalesce(
                case when a.value_bool is not null then case when a.value_bool then 'Yes' else 'No' end end,
                (select ch->'label'->>'en' from jsonb_array_elements(sq.choices) ch where ch->>'value' = a.value_text),
                a.value_text, a.value_number::text,
                (select string_agg(coalesce((select ch->'label'->>'en' from jsonb_array_elements(sq.choices) ch where ch->>'value' = v), v), ', ')
                   from unnest(a.value_choices) v)) as answer,
              ${ANSWER_NUMBER()} as answer_number, l.code as location, f.card, f.zip_code, f.languages as home_languages, r.id as response_id
       from survey_answers a
       join survey_questions sq on sq.id = a.question_id
       join survey_responses r on r.id = a.response_id
       join surveys s on s.id = r.survey_id
       join locations l on l.id = r.location_id
       join family f on f.id = r.household_id
       where ${inRange("r.submitted_at")} and ${locFilter("r.location_id")}
       order by r.submitted_at, sq.position`,
      p,
    ),
    q(
      `select ${day("m.created_at")} as date, to_char(m.created_at at time zone :tz, 'YYYY-MM') as month, l.code as location,
              m.reason, m.condition, m.quantity, m.donor, b.isbn, b.title, b.category as genre, b.reading_level, b.language as book_language
       from stock_movements m join locations l on l.id = m.location_id join books b on b.isbn = m.isbn
       where m.reason in ('donation', 'purchase') and ${inRange("m.created_at")} and ${locFilter("m.location_id")}
       order by m.created_at`,
      p,
    ),
    q(
      `select l.code as location, l.name as location_name, b.isbn, b.title, array_to_string(b.authors, ', ') as authors,
              b.category as genre, b.reading_level, b.language as book_language, s.condition, s.on_hand
       from stock_on_hand s join locations l on l.id = s.location_id join books b on b.isbn = s.isbn
       where s.on_hand > 0 and ${locFilter("s.location_id")}
       order by l.code, b.title, s.condition`,
      p,
    ),
    q<{ name: string | null }>(`select (select name from locations where id = :loc::int) as name`, p),
  ]);

  const loc = C("Location", "location", "Location code where it happened.", "text", 10);
  const card = C("Library card", "card", "Family's current library card number. Use it to join tabs (VLOOKUP/XLOOKUP).", "text", 16);
  const zip = C("ZIP", "zip_code", "Family's ZIP code.", "text", 8);
  const langs = C("Home languages", "home_languages", "Languages spoken at home.", "text", 18);
  const bookCols = [
    C("ISBN", "isbn", "ISBN-13.", "text", 15),
    C("Title", "title", "Book title.", "text", 34),
    C("Genre", "genre", "Genre from the categorizer.", "text", 18),
    C("Reading level", "reading_level", "Board Book, Picture Book, Early Reader, Chapter Book, YA or Adult.", "text", 14),
    C("Book language", "book_language", "English, Spanish, Bilingual or Other.", "text", 12),
  ];

  const sheets: Sheet[] = [
    {
      name: "Books given",
      about: "One row per book handed out (filtered). The main tab for pivot tables: count or sum Quantity by any column.",
      rows: booksGiven,
      columns: [
        C("Date", "date", "Day of the visit.", "date", 11), C("Month", "month", "YYYY-MM, for grouping by month.", "text", 9),
        C("Year", "year", "Calendar year.", "number", 6), loc, C("Location name", "location_name", "Location name.", "text", 22),
        C("Location type", "location_type", "branch, school, event or other.", "text", 11), card, zip, langs,
        C("Child", "child", "First name of the child the book was for (blank if not recorded).", "text", 12),
        C("Child age", "child_age", "Child's age on the day of the visit.", "number", 9),
        C("Child age group", "child_age_bracket", "0-2, 3-5, 6-8, 9-12, 13-17, 18+ or unknown.", "text", 12),
        ...bookCols.slice(0, 2), C("Authors", "authors", "Authors.", "text", 20), ...bookCols.slice(2),
        C("Condition", "condition", "new or used.", "text", 9), C("Quantity", "quantity", "Number of copies.", "number", 9),
        C("Visit ID", "visit_id", "Same number for books given in the same visit (links to the Visits tab).", "number", 8),
      ],
    },
    {
      name: "Visits",
      about: "One row per visit (filtered). Count rows for visits; use First visit to split new vs returning.",
      rows: visits,
      columns: [
        C("Visit ID", "visit_id", "Visit number (matches Books given).", "number", 8), C("Date", "date", "Day of the visit.", "date", 11),
        C("Month", "month", "YYYY-MM.", "text", 9), loc, C("Location name", "location_name", "Location name.", "text", 22), card, zip, langs,
        C("First visit", "first_visit", "Yes if this was the family's first visit ever.", "yesno", 9),
        C("Visit number", "visit_number", "1 for the family's first visit, 2 for the second, and so on.", "number", 9),
        C("Books", "books", "Books given in this visit.", "number", 7),
        C("Children served", "children_served", "Children the books were for, when recorded.", "number", 9),
      ],
    },
    {
      name: "Families",
      about: "One row per family (all families), with totals and their latest survey answers.",
      rows: families,
      columns: [
        card, C("Signed up", "signed_up", "Date the family signed up.", "date", 11),
        C("Home location", "home_location", "Where they signed up (code).", "text", 10),
        C("Home location name", "home_location_name", "Where they signed up.", "text", 22), zip, langs,
        C("Adults", "adults", "Number of adults.", "number", 7), C("Children", "children", "Number of children.", "number", 8),
        C("Visits", "visits", "Visits, all time.", "number", 7), C("Books received", "books_received", "Books received, all time.", "number", 9),
        C("First visit", "first_visit", "Date of first visit.", "date", 11), C("Last visit", "last_visit", "Date of last visit.", "date", 11),
        C("Intake survey done", "has_intake", "Yes if they've answered the intake survey.", "yesno", 9),
        C("Surveys taken", "surveys_taken", "Survey responses, all surveys.", "number", 8),
        C("Books at home (latest)", "books_in_home", "Latest answer to 'About how many books are in your home?'.", "text", 12),
        C("Everyone reads (latest)", "everyone_reads", "Latest answer to 'Can everyone in your home read?' (no longer asked; older surveys).", "yesno", 10),
        C("Reading days/week (latest)", "read_days_per_week", "Latest answer to 'How many days a week do you read to your child?' (\"3+\" counts as 3).", "number", 10),
        C("Child enjoys reading (latest)", "child_enjoys_reading", "Latest answer, 1 (not at all) to 10 (enjoys reading).", "number", 10),
        C("Visit rating (latest)", "visit_rating", "Latest returning-visitor rating, 1 (not enjoyable) to 5 (enjoyable).", "number", 9),
      ],
    },
    {
      name: "Adults",
      about: "One row per adult (all families). Contains contact details: keep private.",
      rows: adults,
      columns: [
        card, C("First name", "first_name", "First name.", "text", 12), C("Last name", "last_name", "Last name.", "text", 14),
        C("Email", "email", "Email.", "text", 26), C("Phone", "phone", "Phone (+1…).", "text", 14),
        C("Age range", "age_range", "Age range they gave.", "text", 10), C("Preferred language", "preferred_language", "Preferred language.", "text", 12),
        C("OK to contact", "contact_consent", "Yes if they agreed to be contacted.", "yesno", 9),
        C("Home location", "home_location", "Family's home location.", "text", 10), zip,
      ],
    },
    {
      name: "Children",
      about: "One row per child (all families).",
      rows: kids,
      columns: [
        card, C("First name", "first_name", "First name.", "text", 12), C("Birth year", "birth_year", "Birth year.", "number", 8),
        C("Birth month", "birth_month", "Birth month (1-12), if known.", "number", 8),
        C("Birth year estimated", "birth_year_estimated", "Yes if worked out from an age staff entered.", "yesno", 10),
        C("Age today", "age_today", "Age today.", "number", 8), C("Age group today", "age_bracket_today", "Age group today.", "text", 10),
        C("Books received", "books_received", "Books given for this child, all time.", "number", 9),
        C("Home location", "home_location", "Family's home location.", "text", 10), zip,
      ],
    },
    {
      name: "Survey answers",
      about: "One row per answer (filtered). Filter by Question key; average Answer (number) for numeric questions.",
      rows: answers,
      columns: [
        C("Date", "date", "Day the survey was taken.", "date", 11), C("Survey", "survey", "Survey name.", "text", 16),
        C("Question key", "question_key", "Stable question id, the same across surveys (e.g. read_days_per_week).", "text", 18),
        C("Question", "question", "Question text (English).", "text", 40), C("Answer", "answer", "Answer as shown to staff.", "text", 16),
        C("Answer (number)", "answer_number", "Numbers and scales, plus choices like \"3+\" as 3. Use it for averages.", "number", 9), loc, card, zip, langs,
        C("Response ID", "response_id", "Same for answers from one survey sitting.", "number", 9),
      ],
    },
    {
      name: "Books received",
      about: "Donations and purchases added to inventory (filtered).",
      rows: received,
      columns: [
        C("Date", "date", "Day added.", "date", 11), C("Month", "month", "YYYY-MM.", "text", 9), loc,
        C("Source", "reason", "donation or purchase.", "text", 10), C("Condition", "condition", "new or used.", "text", 9),
        C("Quantity", "quantity", "Copies added.", "number", 8), C("Donor", "donor", "Donor, if recorded.", "text", 18), ...bookCols,
      ],
    },
    {
      name: "Stock now",
      about: "Copies on hand right now, per location and condition (location filter applies).",
      rows: stock,
      columns: [
        loc, C("Location name", "location_name", "Location name.", "text", 22), ...bookCols.slice(0, 2),
        C("Authors", "authors", "Authors.", "text", 20), ...bookCols.slice(2), C("Condition", "condition", "new or used.", "text", 9),
        C("On hand", "on_hand", "Copies on hand.", "number", 8),
      ],
    },
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Friends of Literacy staff app";
  wb.created = new Date();

  // Read me first.
  const readme = wb.addWorksheet("Read me");
  readme.columns = [{ width: 24 }, { width: 28 }, { width: 90 }];
  const filters = [
    `Dates: ${f.from ?? "the beginning"} to ${f.to ?? "today"} (${TZ})`,
    `Location: ${locationRow?.name ?? "all locations"}`,
  ];
  const lines: (string | [string, string, string])[] = [
    "Friends of Literacy: data export",
    `Created ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${filters.join(" · ")}`,
    "Date and location filters apply to Books given, Visits, Survey answers, Books received and Stock now. Families, Adults and Children always include everyone.",
    "Tips: select a tab, then Insert → PivotTable (Excel) or Insert → Pivot table (Google Sheets). Each tab has filters on its header row.",
    "This file contains personal details (Adults tab). Keep it private and delete old copies.",
    "",
  ];
  for (const s of sheets) {
    lines.push([s.name, `${s.rows.length.toLocaleString()} rows`, s.about]);
    for (const c of s.columns) lines.push(["", c.header, c.note]);
    lines.push("");
  }
  for (const l of lines) {
    const row = readme.addRow(Array.isArray(l) ? l : [l]);
    if (Array.isArray(l) && l[0]) row.font = { bold: true };
  }
  readme.getRow(1).font = { bold: true, size: 14 };
  readme.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(10, c.header.length + 2) }));
    for (const r of s.rows) {
      const out: Record<string, unknown> = {};
      for (const c of s.columns) {
        const v = r[c.key];
        out[c.key] =
          v == null ? null
          : c.type === "date" ? new Date(`${v}T00:00:00Z`)
          : c.type === "number" ? Number(v)
          : c.type === "yesno" ? (v ? "Yes" : "No")
          : String(v);
      }
      ws.addRow(out);
    }
    s.columns.forEach((c, i) => {
      if (c.type === "date") ws.getColumn(i + 1).numFmt = "yyyy-mm-dd";
    });
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF04364F" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const name = `fol-data-${f.from ?? "start"}-to-${f.to ?? new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer, name, counts: Object.fromEntries(sheets.map((s) => [s.name, s.rows.length])) };
}
