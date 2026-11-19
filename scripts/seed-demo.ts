// Demo data for the dev branch: four locations, ~150 families over the last 12 months, a children's
// book catalog, stock received and given away, and surveys. Never run it against production.
//
//   npm run seed:demo              add the demo data (refuses if it is already there)
//   npm run seed:demo -- --reset   delete the demo data, then add it again
//   npm run seed:demo -- --reset --only        just delete it
//   add --with-staff-activity to --reset to also delete what real staff did with demo families
//   or at demo locations (giveaways, stock changes, surveys), which otherwise blocks the reset.
//
// Every row is marked: created_by / issued_by / added_by = 'demo-seed', books have source = 'demo'
// and category_model = 'demo', demo locations use the codes in LOCATIONS below. Guardians,
// children, household languages, distribution items and survey answers belong to demo rows.
// Rows are written straight to Postgres, the same way the API writes them (src/services).
// The data is random but repeatable (fixed seed), relative to today's date.
import pg from "pg";
import { randomUUID } from "node:crypto";
import { formatCardNumber } from "../src/domain/cards.ts";
import { DEMO_BOOKS, type DemoBook } from "./demo-books.ts";

if (process.env.NEON_BRANCH === "production") {
  console.error("Refusing to run against production. `neon checkout dev` first.");
  process.exit(1);
}
if (!process.env.NEON_BRANCH) {
  console.error("NEON_BRANCH is not set. Run with --env-file=.env.local on the dev branch (npm run seed:demo).");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const ONLY_RESET = args.has("--only");
const WITH_STAFF_ACTIVITY = args.has("--with-staff-activity");
const BY = "demo-seed";
const DAY = 86_400_000;
const NOW = Date.now();
const START = NOW - 365 * DAY;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
await db.connect();

// ---------------------------------------------------------------- random helpers (seeded)

let state = 0x5eed2026;
function rand() {
  // mulberry32
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p: number) => rand() < p;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) if ((r -= w) < 0) return v;
  return entries[entries.length - 1][0];
}
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
/** A time during opening hours (10:00–18:00 UTC-ish) on the given day. */
const atHour = (day: number) => {
  const d = new Date(day);
  d.setUTCHours(int(15, 23), int(0, 59), int(0, 59), 0);
  return Math.min(d.getTime(), NOW - 60_000);
};

// ---------------------------------------------------------------- reference shapes

type LocKey = "library" | "school" | "center" | "market";
const LOCATIONS: Record<LocKey, { code: string; name: string; type: "branch" | "school" | "event" | "other"; address: string; zip: string }> = {
  library: { code: "MAPL", name: "Maple Street Library", type: "branch", address: "410 Maple St", zip: "97211" },
  school: { code: "CVES", name: "Cesar Chavez Elementary", type: "school", address: "5103 N Willis Blvd", zip: "97203" },
  center: { code: "EBCC", name: "Eastbank Community Center", type: "other", address: "1200 SE Belmont St", zip: "97214" },
  market: { code: "FMKT", name: "Farmers Market Book Tent", type: "event", address: "Pioneer Square (2nd Saturday)", zip: "97204" },
};
const DEMO_CODES = Object.values(LOCATIONS).map((l) => l.code);
const ZIPS: Record<LocKey, string[]> = {
  library: ["97211", "97217", "97212", "97227"],
  school: ["97203", "97217", "97283", "97211"],
  center: ["97214", "97215", "97202", "97216"],
  market: ["97204", "97205", "97209", "97214", "97211"],
};

// Home language → name pools. Diverse, plausible, invented combinations.
type Lang = "en" | "es" | "vi" | "zh" | "ar" | "so" | "ht" | "tl" | "uk" | "ne" | "fa" | "pt";
const NAMES: Record<Lang, { adults: string[]; kids: string[]; last: string[] }> = {
  en: {
    adults: ["Jessica", "Marcus", "Ashley", "Tyrone", "Megan", "Brandon", "Keisha", "Ryan", "Danielle", "Kevin", "Amber", "Jamal", "Heather", "Derek", "Crystal", "Shawn", "Lauren", "Andre", "Brittany", "Cody", "Monique", "Travis", "Erin", "Darnell"],
    kids: ["Ava", "Jayden", "Mia", "Elijah", "Harper", "Liam", "Zoe", "Isaiah", "Lily", "Mason", "Aaliyah", "Owen", "Nora", "Caleb", "Ruby", "Josiah", "Hazel", "Wyatt", "Imani", "Levi", "Stella", "Malik", "Willow", "Theo"],
    last: ["Johnson", "Williams", "Brown", "Miller", "Davis", "Wilson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Hill", "Green", "Baker", "Carter", "Mitchell", "Turner", "Parker", "Collins", "Reed", "Brooks", "Bell"],
  },
  es: {
    adults: ["María", "José", "Guadalupe", "Juan", "Rosa", "Luis", "Verónica", "Carlos", "Alejandra", "Miguel", "Yesenia", "Jorge", "Leticia", "Francisco", "Araceli", "Ricardo", "Maribel", "Javier", "Claudia", "Eduardo", "Brenda", "Óscar", "Elena", "Raúl"],
    kids: ["Sofía", "Mateo", "Valentina", "Santiago", "Camila", "Diego", "Ximena", "Emiliano", "Isabella", "Leonardo", "Lucía", "Gael", "Renata", "Iker", "Daniela", "Adrián", "Regina", "Thiago", "Natalia", "Sebastián", "Victoria", "Ángel", "Paula", "Julián"],
    last: ["García", "Martínez", "Hernández", "López", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Gutiérrez", "Ortiz", "Mendoza", "Castillo", "Vargas", "Ramos", "Chávez", "Romero", "Herrera", "Medina", "Aguilar"],
  },
  vi: { adults: ["Linh", "Minh", "Thao", "Duc", "Huong", "Tuan", "Mai", "Quang"], kids: ["An", "Bao", "Khanh", "Vy", "Nam", "Ngoc", "Long", "Tram"], last: ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui"] },
  zh: { adults: ["Wei", "Li Na", "Jun", "Mei", "Hao", "Xiu"], kids: ["Yuchen", "Ziyi", "Haoran", "Xinyi", "Bowen", "Ruoxi"], last: ["Chen", "Wang", "Zhang", "Liu", "Huang", "Zhao"] },
  ar: { adults: ["Fatima", "Omar", "Layla", "Yousef", "Huda", "Khalid"], kids: ["Amira", "Adam", "Yasmin", "Zayd", "Noor", "Ibrahim"], last: ["Haddad", "Mansour", "Khalil", "Saleh", "Nasser", "Hamdan"] },
  so: { adults: ["Hodan", "Abdi", "Faduma", "Mohamed", "Ayan", "Hassan"], kids: ["Hamza", "Ifrah", "Yusuf", "Sagal", "Ilhan", "Bilal"], last: ["Warsame", "Abdullahi", "Farah", "Hirsi", "Omar", "Jama"] },
  ht: { adults: ["Marie", "Jean", "Nadège", "Wilson", "Fabienne", "Ricardo"], kids: ["Christelle", "Kervens", "Daphnée", "Woodley", "Naika", "Jameson"], last: ["Joseph", "Pierre", "Baptiste", "Desir", "Charles", "Louis"] },
  tl: { adults: ["Maricel", "Jomar", "Rowena", "Arnel", "Lorna", "Ramil"], kids: ["Althea", "Jericho", "Bea", "Miguel", "Kyla", "Paolo"], last: ["Santos", "Reyes", "Bautista", "Dela Cruz", "Villanueva", "Aquino"] },
  uk: { adults: ["Olena", "Andriy", "Iryna", "Taras", "Natalia"], kids: ["Sofiia", "Maksym", "Anna", "Bohdan", "Zlata"], last: ["Kovalenko", "Shevchenko", "Bondarenko", "Melnyk", "Tkachenko"] },
  ne: { adults: ["Sita", "Ram", "Gita", "Bishnu", "Kamala"], kids: ["Aarav", "Anisha", "Prakash", "Sabina", "Rohan"], last: ["Gurung", "Tamang", "Rai", "Magar", "Thapa"] },
  fa: { adults: ["Maryam", "Ahmad", "Zahra", "Farid", "Shabnam"], kids: ["Ali", "Parisa", "Omid", "Sara", "Arash"], last: ["Ahmadi", "Hosseini", "Karimi", "Rahimi", "Sultani"] },
  pt: { adults: ["Ana", "João", "Fernanda", "Paulo", "Juliana"], kids: ["Gabriel", "Beatriz", "Lucas", "Manuela", "Davi"], last: ["Silva", "Souza", "Oliveira", "Costa", "Ferreira"] },
};
const HOME_LANG: [Lang, number][] = [
  ["en", 50], ["es", 34], ["vi", 3], ["zh", 2], ["ar", 2], ["so", 2], ["ht", 1.5], ["tl", 1.5], ["uk", 1.5], ["ne", 1], ["fa", 1], ["pt", 1],
];
// Location mix differs: the school and community center serve more Spanish-speaking families.
const LANG_BY_LOC: Record<LocKey, (lang: Lang) => number> = {
  library: (l) => (l === "en" ? 1.3 : 1),
  school: (l) => (l === "es" ? 1.6 : 1),
  center: (l) => (l === "en" ? 0.7 : 1.3),
  market: () => 1,
};

// Sign-ups per month, relative: summer reading (Jun–Jul) and back to school (Aug–Sep) bumps.
const MONTH_WEIGHT = [0.7, 0.75, 0.85, 0.9, 1.0, 1.55, 1.7, 1.9, 1.75, 1.0, 0.8, 0.55];

// ---------------------------------------------------------------- reset

async function countStaffActivity() {
  const { rows } = await db.query<{ what: string; n: number }>(
    `with dl as (select id from locations where code = any($1)),
          dh as (select id from households where created_by = $2)
     select 'distributions' as what, count(*)::int as n from distributions
       where created_by <> $2 and (household_id in (select id from dh) or location_id in (select id from dl))
     union all select 'stock_movements', count(*)::int from stock_movements
       where created_by <> $2 and location_id in (select id from dl)
     union all select 'survey_responses', count(*)::int from survey_responses
       where created_by <> $2 and (household_id in (select id from dh) or location_id in (select id from dl))
     union all select 'library_cards', count(*)::int from library_cards
       where issued_by <> $2 and (household_id in (select id from dh) or issued_location_id in (select id from dl))
     union all select 'households', count(*)::int from households
       where created_by <> $2 and home_location_id in (select id from dl)`,
    [DEMO_CODES, BY],
  );
  return rows.filter((r) => r.n > 0);
}

async function reset() {
  const staff = await countStaffActivity();
  if (staff.length && !WITH_STAFF_ACTIVITY) {
    console.error(
      `Staff have used the demo data (${staff.map((r) => `${r.n} ${r.what}`).join(", ")}).\n` +
        "Re-run with --reset --with-staff-activity to delete those rows too.",
    );
    process.exit(1);
  }
  const del = async (label: string, sql: string, params: unknown[]) => {
    const r = await db.query(sql, params);
    if (r.rowCount) console.log(`  deleted ${r.rowCount} ${label}`);
  };
  const DL = `(select id from locations where code = any($1::text[]))`;
  if (WITH_STAFF_ACTIVITY) {
    // What staff did with demo families or at demo locations. Giveaway stock rows and items cascade
    // from distributions.
    const DH = `(select id from households where created_by = $2 or home_location_id in ${DL})`;
    const notDemo = (col: string) => `${col} <> $2`;
    await del("staff giveaways", `delete from distributions where ${notDemo("created_by")} and (household_id in ${DH} or location_id in ${DL})`, [DEMO_CODES, BY]);
    await del("staff stock changes", `delete from stock_movements where ${notDemo("created_by")} and location_id in ${DL}`, [DEMO_CODES, BY]);
    await del("staff survey responses", `delete from survey_responses where ${notDemo("created_by")} and (household_id in ${DH} or location_id in ${DL})`, [DEMO_CODES, BY]);
    await del("staff library cards", `delete from library_cards where ${notDemo("issued_by")} and (household_id in ${DH} or issued_location_id in ${DL})`, [DEMO_CODES, BY]);
    await del("staff households", `delete from households where ${notDemo("created_by")} and home_location_id in ${DL}`, [DEMO_CODES, BY]);
  }
  // Foreign-key order. Survey answers cascade from responses; guardians, children and household
  // languages cascade from households.
  await del("survey responses", `delete from survey_responses where created_by = $1`, [BY]);
  await del(
    "giveaway stock rows",
    `delete from stock_movements where distribution_item_id in (
       select i.id from distribution_items i join distributions d on d.id = i.distribution_id where d.created_by = $1)`,
    [BY],
  );
  await del("distribution items", `delete from distribution_items where distribution_id in (select id from distributions where created_by = $1)`, [BY]);
  await del("distributions", `delete from distributions where created_by = $1`, [BY]);
  await del("stock movements", `delete from stock_movements where created_by = $1`, [BY]);
  await del("library cards", `delete from library_cards where issued_by = $1`, [BY]);
  await del("households", `delete from households where created_by = $1`, [BY]);
  // Demo books that something else now uses (a real scan, staff stock) stay.
  await del(
    "books",
    `delete from books b where b.source = 'demo' and b.category_model = 'demo'
       and not exists (select 1 from stock_movements s where s.isbn = b.isbn)
       and not exists (select 1 from distribution_items i where i.isbn = b.isbn)`,
    [],
  );
  await del("locations", `delete from locations where code = any($1::text[])`, [DEMO_CODES]);
}

// ---------------------------------------------------------------- build

type Child = { id: string; firstName: string; birthYear: number; birthMonth: number | null; estimated: boolean };
type Family = {
  id: string;
  home: LocKey;
  lang: Lang;
  langs: string[];
  signedUp: number;
  children: Child[];
  cardIds: number[]; // [active] or [lost, active]
  engagement: number; // expected repeat visits over a year
  spanishBooks: number; // share of books in Spanish/bilingual when available
};

const usedEmails = new Set<string>();
const usedPhones = new Set<string>();
function email(first: string, last: string) {
  const base = `${first}.${last}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z.]/g, "");
  for (let n = 0; ; n++) {
    const e = `${base}${n ? n : ""}@${chance(0.6) ? "example.com" : "example.org"}`;
    if (!usedEmails.has(e)) return usedEmails.add(e), e;
  }
}
const AREA = ["503", "971", "360", "541", "458", "564"];
function phone() {
  for (;;) {
    // 555-0100 through 555-0199 are reserved for fiction.
    const p = `+1${pick(AREA)}55501${String(int(0, 99)).padStart(2, "0")}`;
    if (!usedPhones.has(p)) return usedPhones.add(p), p;
  }
}

function signupTime(): number {
  for (;;) {
    const t = START + rand() * (NOW - START - DAY);
    const w = MONTH_WEIGHT[new Date(t).getUTCMonth()];
    if (rand() < w / 1.9) return t;
  }
}

function ageAt(c: Child, t: number) {
  const d = new Date(t);
  return Math.max(0, d.getUTCFullYear() - c.birthYear - (d.getUTCMonth() + 1 < (c.birthMonth ?? 7) ? 1 : 0));
}

/** Snap a time to a day the location is open: the market only runs the 2nd Saturday; the school is closed in July. */
function openDay(loc: LocKey, t: number): number | null {
  const d = new Date(t);
  if (loc === "market") {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const sat = 1 + ((6 - first.getUTCDay() + 7) % 7) + 7;
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), sat);
    return day <= NOW - DAY / 2 ? day : null;
  }
  if (loc === "school" && d.getUTCMonth() === 6) return null;
  if (loc === "school" && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) return t + (d.getUTCDay() === 6 ? 2 : 1) * DAY;
  if (d.getUTCDay() === 0) return t + DAY; // library and center closed Sundays
  return t;
}

const LEVEL_FOR_AGE = (age: number): [DemoBook["readingLevel"], number][] =>
  age <= 2
    ? [["Board Book", 8], ["Picture Book", 2]]
    : age <= 5
      ? [["Picture Book", 8], ["Board Book", 1], ["Early Reader", 1.5]]
      : age <= 8
        ? [["Early Reader", 5], ["Picture Book", 3], ["Chapter Book", 3]]
        : age <= 12
          ? [["Chapter Book", 9], ["YA", 1], ["Early Reader", 0.5]]
          : [["YA", 6], ["Chapter Book", 4]];

async function seed() {
  const { rows: existing } = await db.query(`select code from locations where code = any($1::text[])`, [DEMO_CODES]);
  if (existing.length) {
    console.error(`Demo data is already there (locations ${existing.map((r) => r.code).join(", ")}). Use --reset to start over.`);
    process.exit(1);
  }
  const langRows = await db.query<{ code: string }>(`select code from languages`);
  const known = new Set(langRows.rows.map((r) => r.code));
  for (const l of [...Object.keys(NAMES), "asl"]) if (!known.has(l)) throw new Error(`Language ${l} missing; run npm run db:seed first`);
  const qRows = await db.query<{ survey: string; key: string; id: number }>(
    `select s.key as survey, q.key, q.id from survey_questions q join surveys s on s.id = q.survey_id where s.key in ('intake', 'returning') and q.retired_at is null`,
  );
  const qid = (survey: string, key: string) => {
    const r = qRows.rows.find((x) => x.survey === survey && x.key === key);
    if (!r) throw new Error(`Survey question ${survey}.${key} missing; run npm run db:seed first`);
    return r.id;
  };
  const surveyId = Object.fromEntries(
    (await db.query<{ key: string; id: number }>(`select key, id from surveys where key in ('intake', 'returning')`)).rows.map((r) => [r.key, r.id]),
  );

  // Locations
  const locId = {} as Record<LocKey, number>;
  for (const [k, l] of Object.entries(LOCATIONS) as [LocKey, (typeof LOCATIONS)[LocKey]][]) {
    const { rows } = await db.query<{ id: number }>(
      `insert into locations (code, name, type, address, zip_code, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
      [l.code, l.name, l.type, l.address, l.zip, new Date(START - 30 * DAY)],
    );
    locId[k] = rows[0].id;
  }

  // Books (leave any catalog row that is already there alone)
  for (const b of DEMO_BOOKS) {
    await db.query(
      `insert into books (isbn, title, authors, publisher, published_date, page_count, cover_url, source, category, category_model,
                          reading_level, reading_level_source, language, language_source, language_code, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, 'demo', $8, 'demo', $9, 'demo', $10, 'demo', $11, $12, $12)
       on conflict (isbn) do nothing`,
      [b.isbn, b.title, b.authors, b.publisher, b.publishedDate, b.pageCount, b.coverUrl, b.category, b.readingLevel, b.language,
        b.language === "Spanish" ? "spa" : b.language === "English" ? "eng" : null, new Date(START - 20 * DAY)],
    );
  }

  // Families
  const N = 150;
  const families: Family[] = [];
  const guardianRows: unknown[][] = [];
  for (let i = 0; i < N; i++) {
    const home = weighted<LocKey>([["library", 40], ["school", 26], ["center", 20], ["market", 14]]);
    const lang = weighted(HOME_LANG.map(([l, w]) => [l, w * LANG_BY_LOC[home](l)] as const));
    const pool = NAMES[lang];
    const last = pick(pool.last);
    let signedUp = signupTime();
    signedUp = atHour(openDay(home, signedUp) ?? openDay(home, signedUp - 31 * DAY) ?? signedUp);
    const langs = [lang as string];
    if (lang !== "en" && chance(lang === "es" ? 0.45 : 0.6)) langs.push("en");
    if (lang === "en" && chance(0.04)) langs.push("asl");
    const nKids = weighted([[1, 35], [2, 35], [3, 20], [4, 10]] as const);
    const kids: Child[] = [];
    const kidNames = shuffle([...pool.kids]);
    let age: number = weighted([[0, 10], [1, 10], [2, 9], [3, 10], [4, 10], [5, 10], [6, 9], [7, 8], [8, 7], [9, 6], [10, 5], [11, 4], [12, 3], [13, 2], [14, 1]] as const);
    for (let k = 0; k < nKids; k++) {
      const signupYear = new Date(signedUp).getUTCFullYear();
      const signupMonth = new Date(signedUp).getUTCMonth() + 1;
      const kind = weighted([["exact", 70], ["estimated", 20], ["year", 10]] as const);
      const birthMonth = kind === "exact" ? int(1, 12) : null;
      // No child is born after the family signs up (ages assume a July birthday when the month is unknown).
      const birthYear = signupYear - age - ((birthMonth ?? 7) > signupMonth && age === 0 ? 1 : 0);
      kids.push({
        id: randomUUID(),
        firstName: kidNames[k % kidNames.length],
        birthYear,
        birthMonth,
        estimated: kind === "estimated",
      });
      age = Math.max(0, age - int(1, 4));
      if (k > 0 && age === 0 && chance(0.5)) break;
    }
    const isSpanish = lang === "es";
    families.push({
      id: randomUUID(),
      home,
      lang,
      langs: [...new Set(langs)],
      signedUp,
      children: kids,
      cardIds: [],
      engagement: weighted([[0, 8], [1, 10], [2, 16], [4, 20], [6, 18], [8, 14], [12, 10], [16, 4]] as const),
      spanishBooks: isSpanish ? (langs.includes("en") ? 0.35 : 0.6) : lang === "en" ? 0.04 : 0.12,
    });
    const fam = families[families.length - 1];
    // Guardians: one, sometimes two. Email and/or phone.
    const nAdults = chance(0.3) ? 2 : 1;
    const adultNames = shuffle([...pool.adults]);
    for (let a = 0; a < nAdults; a++) {
      const first = adultNames[a];
      const lastName = a === 1 && chance(0.3) ? pick(pool.last) : chance(0.06) ? null : last;
      const contact = weighted([["both", 45], ["phone", 35], ["email", 20]] as const);
      const preferred = a === 0 ? lang : chance(0.7) ? lang : "en";
      guardianRows.push([
        randomUUID(), fam.id, first, lastName,
        contact !== "phone" ? email(first, lastName ?? last) : null,
        contact !== "email" ? phone() : null,
        weighted([["18-24", 8], ["25-34", 38], ["35-44", 34], ["45-54", 12], ["55-64", 5], ["65+", 3]] as const),
        preferred, chance(0.7), new Date(signedUp),
      ]);
    }
  }

  // Card numbers come from one sequence, so issue them in sign-up order.
  families.sort((a, b) => a.signedUp - b.signedUp);
  await insertMany(
    "households (id, zip_code, home_location_id, created_by, created_at)",
    families.map((f) => [f.id, pick(ZIPS[f.home]), locId[f.home], BY, new Date(f.signedUp)]),
  );
  await insertMany(
    "household_languages (household_id, language_code)",
    families.flatMap((f) => f.langs.map((l) => [f.id, l])),
  );
  await insertMany(
    "guardians (id, household_id, first_name, last_name, email, phone, age_range, preferred_language_code, contact_consent, created_at)",
    guardianRows,
  );
  await insertMany(
    "children (id, household_id, first_name, birth_year, birth_month, birth_year_estimated, created_at)",
    families.flatMap((f) => f.children.map((c) => [c.id, f.id, c.firstName, c.birthYear, c.birthMonth, c.estimated, new Date(f.signedUp)])),
  );

  // Library cards: numbers from the same sequence the API uses. ~6% of families lost a card and got a new one.
  const lost = families.filter(() => chance(0.06));
  const seqs = await allocate("library_card_seq", families.length + lost.length);
  const cardIdSeq = await allocate(await serialSeq("library_cards"), families.length + lost.length);
  const cardRows: unknown[][] = [];
  let s = 0;
  for (const f of families) {
    const replaced = lost.includes(f);
    const loc = LOCATIONS[f.home].code;
    const first = cardIdSeq[s];
    cardRows.push([first, f.id, formatCardNumber(loc, seqs[s++]), replaced ? "lost" : "active", locId[f.home], BY, new Date(f.signedUp)]);
    f.cardIds.push(first);
    if (replaced) {
      const at = f.signedUp + int(40, 200) * DAY;
      const when = Math.min(at, NOW - 3 * DAY);
      cardRows.push([cardIdSeq[s], f.id, formatCardNumber(loc, seqs[s++]), "active", locId[f.home], BY, new Date(when)]);
      f.cardIds.push(cardIdSeq[s - 1]);
      (f as Family & { replacedAt?: number }).replacedAt = when;
    }
  }
  await insertMany("library_cards (id, household_id, number, status, issued_location_id, issued_by, issued_at)", cardRows);

  // ---------------------------------------------------------------- visits, stock, giveaways
  type Visit = { t: number; family: Family; loc: LocKey };
  const visits: Visit[] = [];
  for (const f of families) {
    // Most families take books home the day they sign up.
    if (chance(0.92)) visits.push({ t: f.signedUp + int(5, 25) * 60_000, family: f, loc: f.home });
    let t = f.signedUp;
    const gap = f.engagement ? 365 / (f.engagement + 0.5) : Infinity;
    for (;;) {
      t += (gap * (0.5 + rand())) * DAY;
      if (t > NOW - DAY) break;
      const loc = chance(0.82) ? f.home : weighted<LocKey>([["library", 3], ["market", 2], ["center", 1], ["school", 1]]);
      const day = openDay(loc, t);
      if (day == null || day < f.signedUp + DAY) continue;
      visits.push({ t: atHour(day), family: f, loc });
    }
  }
  visits.sort((a, b) => a.t - b.t);

  // Stock arrives in batches: donations (mostly used) every couple of weeks, purchases (new) monthly,
  // sized to what each location gives away. Simulated in time order so stock never goes below zero.
  type Mv = [isbn: string, loc: number, cond: "new" | "used", qty: number, reason: string, itemId: number | null, donor: string | null, note: string | null, at: Date];
  const moves: Mv[] = [];
  const stock = new Map<string, number>();
  const sk = (isbn: string, loc: LocKey, c: string) => `${isbn}|${loc}|${c}`;
  const add = (isbn: string, loc: LocKey, c: "new" | "used", qty: number, reason: string, at: number, donor: string | null = null, note: string | null = null, itemId: number | null = null) => {
    const k = sk(isbn, loc, c);
    const now = (stock.get(k) ?? 0) + qty;
    if (now < 0) throw new Error(`stock would go negative: ${k}`);
    stock.set(k, now);
    moves.push([isbn, locId[loc], c, qty, reason, itemId, donor, note, new Date(at)]);
  };
  const DONORS = ["Rotary Club book drive", "Little Free Library swap", "Parent-teacher association", "Neighborhood yard sale leftovers", "Grace Lutheran Church", "Local bookstore overstock", "Anonymous", "Book Bus volunteers", null];
  const VENDORS = ["First Book Marketplace", "Scholastic book fair credit", "Lectorum order", "Grant purchase: summer reading"];
  const byLevel = (lvl: DemoBook["readingLevel"]) => DEMO_BOOKS.filter((b) => b.readingLevel === lvl);
  const volume: Record<LocKey, number> = { library: 1, school: 0.7, center: 0.55, market: 0.45 };
  const restock = (loc: LocKey, at: number, kind: "donation" | "purchase") => {
    const titles = int(kind === "donation" ? 5 : 3, kind === "donation" ? 11 : 7);
    const lvlMix = [["Board Book", 3], ["Picture Book", 5], ["Early Reader", 3], ["Chapter Book", 4], ["YA", 1], ["Adult", 0.3]] as const;
    const donor = kind === "donation" ? pick(DONORS) : pick(VENDORS);
    for (let i = 0; i < titles; i++) {
      const lvl = weighted(lvlMix);
      const pool = byLevel(lvl);
      // Spanish and bilingual titles are bought on purpose; donations are mostly English.
      const want = kind === "purchase" && chance(0.4) ? pool.filter((b) => b.language !== "English") : pool;
      const b = pick(want.length ? want : pool);
      const qty = Math.max(1, Math.round(int(kind === "donation" ? 1 : 3, kind === "donation" ? 4 : 8) * volume[loc]));
      add(b.isbn, loc, kind === "donation" ? (chance(0.85) ? "used" : "new") : "new", qty, kind, at, donor, null);
    }
  };
  // Opening stock a month before the year starts, then regular deliveries.
  for (const loc of Object.keys(LOCATIONS) as LocKey[]) {
    const t0 = START - 14 * DAY;
    for (let i = 0; i < 3; i++) restock(loc, t0 + i * DAY, i === 2 ? "purchase" : "donation");
    for (let t = START; t < NOW - 2 * DAY; t += int(12, 18) * DAY) {
      const day = loc === "market" ? (openDay(loc, t) ?? t) - DAY : t;
      if (day > NOW - DAY) continue;
      restock(loc, atHour(day) - 4 * 3_600_000, "donation");
      if (chance(0.45)) restock(loc, atHour(day) - 3 * 3_600_000, "purchase");
      // Summer reading and back-to-school pushes.
      const m = new Date(day).getUTCMonth();
      if ((m === 5 || m === 7) && chance(0.7)) restock(loc, atHour(day) - 2 * 3_600_000, "purchase");
    }
  }
  // Interleave stock arrivals and visits by time.
  const arrivals = moves.splice(0).sort((a, b) => a[8].getTime() - b[8].getTime());
  stock.clear();

  type Dist = { id: number; family: Family; loc: LocKey; t: number; cardId: number; items: { id: number; isbn: string; cond: "new" | "used"; qty: number; childId: string | null }[] };
  const dists: Dist[] = [];
  const pendingItems: Dist["items"] = [];
  let ai = 0;
  const flushArrivalsUntil = (t: number) => {
    while (ai < arrivals.length && arrivals[ai][8].getTime() <= t) {
      const [isbn, l, c, q, reason, , donor, note, at] = arrivals[ai++];
      const loc = (Object.keys(locId) as LocKey[]).find((k) => locId[k] === l)!;
      add(isbn, loc, c, q, reason, at.getTime(), donor, note);
    }
  };
  const available = (loc: LocKey, b: DemoBook) => {
    const n = stock.get(sk(b.isbn, loc, "used")) ?? 0;
    const m = stock.get(sk(b.isbn, loc, "new")) ?? 0;
    return n + m;
  };
  for (const v of visits) {
    flushArrivalsUntil(v.t);
    // Now and then a copy turns out damaged, or a recount finds one off (only from stock on hand).
    if (chance(0.025)) {
      const cond = chance(0.8) ? "used" : "new";
      const keys = [...stock].filter(([k, n]) => n > 1 && k.endsWith(`|${v.loc}|${cond}`));
      if (keys.length) {
        const [k] = pick(keys);
        const [isbn] = k.split("|");
        const at = v.t - 3_600_000;
        if (chance(0.7)) add(isbn, v.loc, cond, -1, "damaged", at, null, pick(["Water damage", "Torn cover", "Pages missing", "Crayon on every page"]));
        else add(isbn, v.loc, cond, chance(0.5) ? -1 : 1, "adjustment", at, null, "Shelf recount");
      }
    }
    const f = v.family;
    const replacedAt = (f as Family & { replacedAt?: number }).replacedAt;
    const cardId = replacedAt != null && v.t >= replacedAt ? f.cardIds[1] : f.cardIds[0];
    const items: Dist["items"] = [];
    const taken = new Map<string, number>();
    const tryGive = (pool: DemoBook[], childId: string | null) => {
      const spanishFirst = chance(f.spanishBooks);
      const ordered = shuffle(pool.filter((b) => available(v.loc, b) > (taken.get(b.isbn) ?? 0)));
      ordered.sort((a, b) => Number(spanishFirst ? a.language === "English" : 0) - Number(spanishFirst ? b.language === "English" : 0));
      const b = ordered[0];
      if (!b) return false;
      const used = stock.get(sk(b.isbn, v.loc, "used")) ?? 0;
      const usedTaken = items.filter((i) => i.isbn === b.isbn && i.cond === "used").reduce((n, i) => n + i.qty, 0);
      const cond = used - usedTaken > 0 && chance(0.7) ? "used" : (stock.get(sk(b.isbn, v.loc, "new")) ?? 0) - items.filter((i) => i.isbn === b.isbn && i.cond === "new").reduce((n, i) => n + i.qty, 0) > 0 ? "new" : "used";
      items.push({ id: 0, isbn: b.isbn, cond, qty: 1, childId });
      taken.set(b.isbn, (taken.get(b.isbn) ?? 0) + 1);
      return true;
    };
    for (const c of f.children) {
      const age = ageAt(c, v.t);
      const n = weighted([[1, 60], [2, 32], [3, 8]] as const);
      for (let i = 0; i < n; i++) {
        const lvl = weighted(LEVEL_FOR_AGE(age));
        if (!tryGive(byLevel(lvl), c.id)) tryGive(DEMO_BOOKS.filter((b) => b.readingLevel !== "Adult"), c.id);
      }
    }
    // Sometimes a book for the whole family, or for the grown-ups.
    if (chance(0.15)) tryGive(chance(0.3) ? byLevel("Adult") : byLevel("Picture Book"), null);
    if (!items.length) continue;
    // Merge identical lines (same book, condition and child).
    const merged: Dist["items"] = [];
    for (const i of items) {
      const same = merged.find((m) => m.isbn === i.isbn && m.cond === i.cond && m.childId === i.childId);
      if (same) same.qty += i.qty;
      else merged.push(i);
    }
    // Re-check stock per book/condition the way the API does, and drop anything short.
    const ok = merged.filter((i) => (stock.get(sk(i.isbn, v.loc, i.cond)) ?? 0) >= merged.filter((m) => m.isbn === i.isbn && m.cond === i.cond).reduce((n, m) => n + m.qty, 0));
    if (!ok.length) continue;
    const d: Dist = { id: 0, family: f, loc: v.loc, t: v.t, cardId, items: ok };
    for (const i of ok) {
      const k = sk(i.isbn, v.loc, i.cond);
      stock.set(k, stock.get(k)! - i.qty);
    }
    dists.push(d);
    pendingItems.push(...ok);
  }
  flushArrivalsUntil(NOW);

  // Ids for distributions and their items, so each giveaway stock row can point at its line.
  const distIds = await allocate(await serialSeq("distributions"), dists.length);
  const itemIds = await allocate(await serialSeq("distribution_items"), pendingItems.length);
  let ii = 0;
  dists.forEach((d, i) => {
    d.id = distIds[i];
    for (const it of d.items) it.id = itemIds[ii++];
  });
  await insertMany(
    "distributions (id, household_id, location_id, card_id, distributed_at, created_by)",
    dists.map((d) => [d.id, d.family.id, locId[d.loc], d.cardId, new Date(d.t), BY]),
  );
  await insertMany(
    "distribution_items (id, distribution_id, isbn, condition, quantity, child_id)",
    dists.flatMap((d) => d.items.map((i) => [i.id, d.id, i.isbn, i.cond, i.qty, i.childId])),
  );
  // One giveaway stock row per distribution item, exactly as src/services/giveaways.ts writes them.
  for (const d of dists) for (const i of d.items) moves.push([i.isbn, locId[d.loc], i.cond, -i.qty, "giveaway", i.id, null, null, new Date(d.t)]);
  await insertMany(
    "stock_movements (isbn, location_id, condition, quantity, reason, distribution_item_id, donor, note, created_by, created_at)",
    moves.map((m) => [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], BY, m[8]]),
  );

  // ---------------------------------------------------------------- surveys
  const BIH = ["0", "1-10", "11-25", "26+"];
  const responses: { id?: number; survey: string; f: Family; loc: LocKey; t: number; answers: [number, "n" | "b" | "t" | "c", unknown][] }[] = [];
  const HEARD = ["school", "social_media", "word_of_mouth", "pediatrician", "email", "other"] as const;
  const HEARD_OTHER = ["Library newsletter", "Saw the tent at the market", "Church bulletin", "Flyer at the clinic", "WIC office"];
  const WHY = [
    "My kids love books and we can't afford many.",
    "Queremos que nuestros hijos lean más en casa.",
    "A friend told me about the free books.",
    "My son is starting kindergarten and I want him ready.",
    "We just moved here and are looking for activities.",
  ];
  const RESOURCES = [
    "Information about ESL classes for parents.",
    "Ayuda con clases de inglés.",
    "Summer programs for kids.",
    "Help finding a pediatrician.",
    "Food pantry locations.",
  ];
  const IDEAS = [
    "Story time in Spanish!",
    "A reading challenge with prizes.",
    "More books for toddlers.",
    "Author visits.",
    "A quiet reading corner with bean bags.",
    "Book swaps for older kids.",
  ];
  const DAYS_CHOICE = (d: number) => (d <= 0 ? "0" : `${Math.min(5, d)}+`);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  for (const f of families) {
    if (!chance(0.84)) continue;
    const base = f.lang === "en" ? 2 : 1;
    let bih = clamp(weighted([[base - 1, 3], [base, 4], [base + 1, 2]] as const), 0, 3);
    if (f.lang !== "en" && f.lang !== "es") bih = Math.max(0, bih - 1);
    let days = clamp(weighted([[0, 2], [1, 3], [2, 4], [3, 4], [4, 2], [5, 2]] as const) - (bih < 1 ? 1 : 0), 0, 5);
    let enjoys = clamp(4 + days * 0.8 + (rand() - 0.5) * 3, 1, 10);
    const heard = HEARD.filter((h) => chance(h === "word_of_mouth" ? 0.45 : h === "school" ? 0.35 : h === "other" ? 0.08 : 0.15));
    const intake: [number, "n" | "b" | "t" | "c", unknown][] = [
      [qid("intake", "books_in_home"), "t", BIH[bih]],
      [qid("intake", "read_days_per_week"), "t", DAYS_CHOICE(days)],
      [qid("intake", "child_enjoys_reading"), "n", enjoys],
    ];
    if (heard.length) intake.push([qid("intake", "heard_about"), "c", heard]);
    if (heard.includes("other")) intake.push([qid("intake", "heard_about_other"), "t", pick(HEARD_OTHER)]);
    if (chance(0.35)) intake.push([qid("intake", "why_visit"), "t", pick(WHY)]);
    if (chance(0.15)) intake.push([qid("intake", "other_resources"), "t", pick(RESOURCES)]);
    responses.push({ survey: "intake", f, loc: f.home, t: f.signedUp + int(2, 15) * 60_000, answers: intake });
    // Returning-visitor surveys every few months for families who came back, a little better each time.
    let at = f.signedUp + int(80, 120) * DAY;
    while (at < NOW - DAY) {
      const cameBack = dists.some((d) => d.family === f && d.t > at - 60 * DAY && d.t <= at + 30 * DAY);
      if (cameBack && chance(0.7)) {
        const loc = f.home;
        const day = atHour(openDay(loc, at) ?? at);
        if (day >= NOW) break;
        bih = clamp(bih + weighted([[0, 6], [1, 3]] as const), 0, 3);
        days = clamp(days + weighted([[-1, 1], [0, 4], [1, 4]] as const), 0, 5);
        enjoys = clamp(enjoys + weighted([[-1, 1], [0, 3], [1, 3], [2, 1]] as const), 1, 10);
        const answers: [number, "n" | "b" | "t" | "c", unknown][] = [
          [qid("returning", "visit_rating"), "n", weighted([[3, 1], [4, 4], [5, 7]] as const)],
          [qid("returning", "books_in_home"), "t", BIH[bih]],
          [qid("returning", "read_days_per_week"), "t", DAYS_CHOICE(days)],
          [qid("returning", "child_enjoys_reading"), "n", enjoys],
        ];
        if (chance(0.3)) answers.push([qid("returning", "ideas"), "t", pick(IDEAS)]);
        responses.push({ survey: "returning", f, loc, t: day, answers });
      }
      at += int(90, 130) * DAY;
    }
  }
  const respIds = await allocate(await serialSeq("survey_responses"), responses.length);
  responses.forEach((r, i) => (r.id = respIds[i]));
  const firstGuardian = new Map<string, string>();
  for (const g of guardianRows) if (!firstGuardian.has(g[1] as string)) firstGuardian.set(g[1] as string, g[0] as string);
  await insertMany(
    "survey_responses (id, survey_id, household_id, guardian_id, location_id, submitted_at, created_by)",
    responses.map((r) => [r.id, surveyId[r.survey], r.f.id, firstGuardian.get(r.f.id) ?? null, locId[r.loc], new Date(r.t), BY]),
  );
  await insertMany(
    "survey_answers (response_id, question_id, value_number, value_bool, value_text, value_choices)",
    responses.flatMap((r) =>
      r.answers.map(([q, kind, v]) => [r.id, q, kind === "n" ? v : null, kind === "b" ? v : null, kind === "t" ? v : null, kind === "c" ? v : null]),
    ),
  );

  // Final check, inside the transaction: no stock below zero anywhere.
  const neg = await db.query(`select * from stock_on_hand where on_hand < 0`);
  if (neg.rowCount) throw new Error(`negative stock: ${JSON.stringify(neg.rows.slice(0, 5))}`);

  const items = dists.reduce((n, d) => n + d.items.reduce((m, i) => m + i.qty, 0), 0);
  console.log(
    `seeded ${Object.keys(LOCATIONS).length} locations, ${DEMO_BOOKS.length} books, ${families.length} families ` +
      `(${guardianRows.length} guardians, ${families.reduce((n, f) => n + f.children.length, 0)} children, ${cardRows.length} cards), ` +
      `${arrivals.filter((m) => m[4] === "donation").length} donation and ${arrivals.filter((m) => m[4] === "purchase").length} purchase stock rows, ` +
      `${dists.length} visits giving ${items} books, ${responses.filter((r) => r.survey === "intake").length} intake and ` +
      `${responses.filter((r) => r.survey !== "intake").length} returning-visitor surveys`,
  );
}

// ---------------------------------------------------------------- SQL helpers

async function insertMany(target: string, rows: unknown[][], chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const width = part[0].length;
    const values = part.map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(", ")})`).join(", ");
    await db.query(`insert into ${target} values ${values}`, part.flat());
  }
}
async function serialSeq(table: string) {
  const { rows } = await db.query<{ s: string }>(`select pg_get_serial_sequence($1, 'id') as s`, [table]);
  return rows[0].s;
}
async function allocate(seq: string, n: number): Promise<number[]> {
  if (n === 0) return [];
  const { rows } = await db.query<{ v: string }>(`select nextval($1::regclass) as v from generate_series(1, $2)`, [seq, n]);
  return rows.map((r) => Number(r.v));
}

// ---------------------------------------------------------------- main

try {
  console.log(`Neon branch: ${process.env.NEON_BRANCH}`);
  // One transaction: a failed run leaves the branch as it was.
  await db.query("begin");
  if (RESET) {
    console.log("Deleting demo data…");
    await reset();
  }
  if (!ONLY_RESET) await seed();
  await db.query("commit");
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.end();
}
