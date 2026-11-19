// End-to-end check of the deployed staff API on the linked Neon branch (never run it against production:
// it creates test staff, families, locations and stock).
// Usage: npm run test:e2e
import pg from "pg";
import { functionBaseUrl } from "@neon/env";

if (process.env.NEON_BRANCH === "production") {
  console.error("Refusing to run against production. `neon checkout dev` first.");
  process.exit(1);
}
const API = process.env.API_URL ?? functionBaseUrl("api");
const AUTH = process.env.NEON_AUTH_BASE_URL!;
const ORIGIN = "http://localhost:4173";
const run = Date.now().toString(36);
const sqlc = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await sqlc.connect();

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  if (!ok) failures++;
  const d = detail === "" ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d}`);
}

// ---- staff accounts (Neon Auth) -----------------------------------------------------------
async function account(label: string, opts: { verified: boolean; role?: "admin" | "staff" }) {
  const email = `e2e-${label}-${run}@example.com`;
  const res = await fetch(`${AUTH}/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "correct-horse-battery", name: label }),
  });
  if (!res.ok) throw new Error(`sign-up ${label}: ${res.status} ${await res.text()}`);
  // Test-only shortcut on a dev branch: real staff verify with the emailed code.
  if (opts.verified) await sqlc.query(`update neon_auth."user" set "emailVerified" = true where email = $1`, [email]);
  if (opts.role) await sqlc.query(`insert into staff_members (email, role, added_by) values ($1, $2, 'e2e')`, [email, opts.role]);
  const signIn = await fetch(`${AUTH}/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "correct-horse-battery" }),
  });
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const tok = await fetch(`${AUTH}/token`, { headers: { Cookie: cookie, Origin: ORIGIN } });
  const { token } = (await tok.json()) as { token: string };
  return { email, token };
}

type Res = { status: number; body: any };
async function call(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const admin = await account("admin", { verified: true, role: "admin" });
const staff = await account("staff", { verified: true, role: "staff" });
const unverified = await account("unverified", { verified: false, role: "staff" });
const outsider = await account("outsider", { verified: true });
const A = (m: string, p: string, b?: unknown) => call(admin.token, m, p, b);
const S = (m: string, p: string, b?: unknown) => call(staff.token, m, p, b);

// ---- access control ------------------------------------------------------------------------
check("health is public", (await call(null, "GET", "/health")).status === 200);
check("no token -> 401", (await call(null, "GET", "/api/locations")).status === 401);
const unv = await call(unverified.token, "GET", "/api/locations");
check("staff-listed but unverified email -> 403", unv.status === 403 && unv.body?.code === "email_not_verified", unv.body);
const out = await call(outsider.token, "GET", "/api/locations");
check("verified but not on staff list -> 403", out.status === 403 && out.body?.code === "not_staff", out.body);
check("staff can't create locations", (await S("POST", "/api/locations", { code: "ZZZ", name: "x" })).status === 403);
check("staff can't add staff", (await S("POST", "/api/staff", { email: "x@example.com" })).status === 403);

// ---- locations -----------------------------------------------------------------------------
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const locA = await A("POST", "/api/locations", { code: letters(4), name: `E2E Midtown ${run}`, type: "branch", zipCode: "78701" });
const locB = await A("POST", "/api/locations", { code: letters(4), name: `E2E School ${run}`, type: "school" });
check("admin creates two locations", locA.status === 201 && locB.status === 201, [locA.body?.code, locB.body?.code]);
const L1 = locA.body.id as number;
const L2 = locB.body.id as number;
check("bad location code rejected", (await A("POST", "/api/locations", { code: "M1", name: "x" })).status === 400);

// ---- intake + library card -----------------------------------------------------------------
const phoneDigits = `512${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const email = `maria.${run}@Example.com`;
const intake = await S("POST", "/api/households", {
  locationId: L1,
  zipCode: "78702",
  languages: ["es"],
  guardians: [{ firstName: "Mariana", lastName: `Lopez${run}`, email, phone: phoneDigits, ageRange: "25-34", preferredLanguage: "es", contactConsent: true }],
  children: [
    { firstName: "Sofia", age: 4 },
    { firstName: "Mateo", birthYear: 2016, birthMonth: 3 },
  ],
});
const fam = intake.body;
const card: string = fam?.cardNumber;
check("intake creates a family with a card", intake.status === 201 && /^[A-Z]{4}-\d{6}-\d$/.test(card) && card.startsWith(locA.body.code), card);
check("intake stores languages, children and ages", !!fam?.languages?.includes("es") && fam?.children?.length === 2 && fam.children[0].birthYearEstimated === true && fam.children[1].ageBracket === "9-12", fam?.children);
check("email stored lowercase, phone as E.164", fam?.guardians?.[0]?.email === email.toLowerCase() && fam?.guardians?.[0]?.phone === `+1${phoneDigits}`);

const dupe = await S("POST", "/api/households", {
  locationId: L1, zipCode: "78702",
  guardians: [{ firstName: "M", phone: `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}` }],
});
check("same phone, different formatting -> 409 with the existing card", dupe.status === 409 && dupe.body?.details?.households?.[0]?.cardNumber === card, dupe.body?.error);
const noContact = await S("POST", "/api/households", { locationId: L1, zipCode: "78702", guardians: [{ firstName: "X" }] });
check("adult with no email or phone -> 400", noContact.status === 400, noContact.body?.error);
check("bad ZIP -> 400", (await S("POST", "/api/households", { locationId: L1, zipCode: "787", guardians: [{ firstName: "X", phone: "5125550100" }] })).status === 400);

// ---- finding the family again ---------------------------------------------------------------
const find = async (q: string) => (await S("GET", `/api/households/search?q=${encodeURIComponent(q)}`));
const byCard = await find(card);
check("search: card number", byCard.body?.matchedBy === "card" && byCard.body.results[0]?.householdId === fam.householdId);
check("search: card scanned without dashes", (await find(card.replaceAll("-", "").toLowerCase())).body?.results?.[0]?.householdId === fam.householdId);
const typo = card.slice(0, -1) + String((Number(card.at(-1)) + 1) % 10);
check("search: mistyped card -> 400 check-digit message", (await find(typo)).status === 400);
check("search: email in capitals", (await find(email.toUpperCase())).body?.results?.[0]?.householdId === fam.householdId);
check("search: phone with dashes", (await find(`${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`)).body?.results?.[0]?.householdId === fam.householdId);
const fuzzy = await find(`Mariana Lopes${run}`);
check("search: misspelled name finds the family", fuzzy.body?.matchedBy === "name" && fuzzy.body.results.some((r: any) => r.householdId === fam.householdId), fuzzy.body?.results?.[0]);

// ---- books: scan, catalog, receive -----------------------------------------------------------
const CATERPILLAR = "9780399226908"; // The Very Hungry Caterpillar
const DUNE_10 = "0441172717"; // Dune, ISBN-10 form
const scan1 = await S("GET", `/api/books/${CATERPILLAR}`);
check("scan ISBN: looked up and categorized", scan1.status === 200 && !!scan1.body?.book?.title && !!scan1.body.book.category, [scan1.body?.book?.title, scan1.body?.book?.category, scan1.body?.book?.categoryModel]);
check("scan: reading level and language", ["Board Book", "Picture Book", "Early Reader"].includes(scan1.body?.book?.readingLevel) && scan1.body?.book?.language === "English", [scan1.body?.book?.readingLevel, scan1.body?.book?.readingLevelSource, scan1.body?.book?.language, scan1.body?.book?.languageSource]);
const options = (await S("GET", "/api/categories")).body;
check("classification options", options?.readingLevels?.includes("Board Book") && options?.languages?.includes("Bilingual") && options?.categories?.includes("Other"));
// A made-up but checksum-valid ISBN that the lookup services won't know.
const isbn12 = `979${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const madeUp = isbn12 + ((10 - ([...isbn12].reduce((a, ch, i) => a + Number(ch) * (i % 2 ? 3 : 1), 0) % 10)) % 10);
const manual = await S("POST", "/api/books", { isbn: madeUp, title: "Colors / Colores", authors: ["Local Author"], category: "Children's", readingLevel: "Board Book", language: "Bilingual" });
check("add a book by hand with reading level and language", manual.status === 201 && manual.body?.readingLevel === "Board Book" && manual.body?.language === "Bilingual", manual.body?.error);
check("hand-entered book scans without a lookup", (await S("GET", `/api/books/${madeUp}`)).body?.book?.categoryModel === "manual");
check("bad reading level -> 400", (await S("POST", "/api/books", { isbn: madeUp, title: "x", category: "Children's", readingLevel: "Novel" })).status === 400);
check("scan says whether the book was new to the catalog", typeof scan1.body?.firstScan === "boolean", scan1.body?.firstScan);
check("scan again: already in catalog", (await S("GET", `/api/books/${CATERPILLAR}`)).body?.firstScan === false);
check("bad ISBN -> 400", (await S("GET", "/api/books/9780399226909")).status === 400);

const before = (await S("GET", `/api/books/${CATERPILLAR}`)).body;
const onHandAt = (b: any, loc: number, cond: string) => b.stock.find((s: any) => s.locationId === loc && s.condition === cond)?.onHand ?? 0;
const rNew = await S("POST", "/api/inventory/receive", { isbn: CATERPILLAR, locationId: L1, condition: "new", quantity: 3, reason: "purchase" });
const rUsed = await S("POST", "/api/inventory/receive", { isbn: CATERPILLAR, locationId: L1, condition: "used", quantity: 2, donor: "Book drive" });
check("receive new and used copies", rNew.status === 201 && rUsed.status === 201 && onHandAt(rUsed.body, L1, "new") === 3 && onHandAt(rUsed.body, L1, "used") === 2, rUsed.body?.stock);
const rDune = await S("POST", "/api/inventory/receive", { isbn: DUNE_10, locationId: L1, condition: "used", quantity: 1 });
check("receive by ISBN-10 stores ISBN-13", rDune.status === 201 && rDune.body?.book?.isbn === "9780441172719", rDune.body?.book?.isbn);
check("receive 0 copies -> 400", (await S("POST", "/api/inventory/receive", { isbn: CATERPILLAR, locationId: L1, condition: "new", quantity: 0 })).status === 400);
check("unknown condition -> 400", (await S("POST", "/api/inventory/receive", { isbn: CATERPILLAR, locationId: L1, condition: "mint" })).status === 400);

// ---- giveaways -------------------------------------------------------------------------------
const sofia = fam.children.find((c: any) => c.firstName === "Sofia").id;
const give = await S("POST", "/api/giveaways", {
  cardNumber: card, locationId: L1,
  items: [{ isbn: CATERPILLAR, condition: "new", quantity: 1, childId: sofia }, { isbn: "9780441172719", condition: "used" }],
});
check("give away by scanning the card", give.status === 201 && give.body?.household?.booksReceived === 2, give.body?.error ?? give.body?.household?.giveaways?.[0]);
const tooMany = await S("POST", "/api/giveaways", { householdId: fam.householdId, locationId: L1, items: [{ isbn: CATERPILLAR, condition: "new", quantity: 5 }] });
check("more copies than on hand -> 409 with shortages", tooMany.status === 409 && tooMany.body?.details?.shortages?.[0]?.onHand === 2, tooMany.body?.details);
const elsewhere = await S("POST", "/api/giveaways", { householdId: fam.householdId, locationId: L2, items: [{ isbn: CATERPILLAR, condition: "used" }] });
check("no stock at the other location -> 409", elsewhere.status === 409);
const otherFam = await S("POST", "/api/households", { locationId: L2, zipCode: "78703", guardians: [{ firstName: "Ana", email: `ana.${run}@example.com` }], children: [{ firstName: "Leo", age: 7 }] });
const wrongChild = await S("POST", "/api/giveaways", { householdId: fam.householdId, locationId: L1, items: [{ isbn: CATERPILLAR, condition: "used", childId: otherFam.body.children[0].id }] });
check("child from another family -> 400", wrongChild.status === 400, wrongChild.body?.error);

// Two staff give away the last copy at the same moment: exactly one succeeds.
const thirdFam = await S("POST", "/api/households", { locationId: L2, zipCode: "78704", guardians: [{ firstName: "Kim", phone: `737${phoneDigits.slice(3)}` }] });
await S("POST", "/api/inventory/receive", { isbn: CATERPILLAR, locationId: L2, condition: "new", quantity: 1 });
const race = await Promise.all([
  S("POST", "/api/giveaways", { householdId: otherFam.body.householdId, locationId: L2, items: [{ isbn: CATERPILLAR, condition: "new" }] }),
  S("POST", "/api/giveaways", { householdId: thirdFam.body.householdId, locationId: L2, items: [{ isbn: CATERPILLAR, condition: "new" }] }),
]);
check("last copy given twice at once: one 201, one 409", race.map((r) => r.status).sort().join(",") === "201,409", race.map((r) => r.status));

const tr = await S("POST", "/api/inventory/transfer", { isbn: CATERPILLAR, fromLocationId: L1, toLocationId: L2, condition: "used", quantity: 1 });
check("transfer between locations", tr.status === 201 && onHandAt(tr.body, L1, "used") === 1 && onHandAt(tr.body, L2, "used") === 1, tr.body?.stock);
check("transfer more than on hand -> 409", (await S("POST", "/api/inventory/transfer", { isbn: CATERPILLAR, fromLocationId: L1, toLocationId: L2, condition: "used", quantity: 9 })).status === 409);
check("damaged can't add copies -> 400", (await S("POST", "/api/inventory/adjust", { isbn: CATERPILLAR, locationId: L1, condition: "used", delta: 1, reason: "damaged" })).status === 400);
check("adjust below zero -> 409", (await S("POST", "/api/inventory/adjust", { isbn: CATERPILLAR, locationId: L1, condition: "used", delta: -5, reason: "adjustment" })).status === 409);

// Scan the book: when and where it was given away.
const after = (await S("GET", `/api/books/${CATERPILLAR}`)).body;
const mine = after.giveaways.find((g: any) => g.cardNumber === card && g.location === locA.body.code);
check("scan shows when the book was given, where, to which card, for which child", !!mine && !!mine.distributedAt && mine.forChild === "Sofia" && mine.condition === "new", mine);
check("scan totals: given away count went up by the copies given", after.givenAway.total - before.givenAway.total === 2, [before.givenAway.total, after.givenAway.total]);

// ---- lost card --------------------------------------------------------------------------------
const replaced = await S("POST", `/api/households/${fam.householdId}/cards`, { locationId: L2, reason: "lost" });
const newCard: string = replaced.body?.cardNumber;
check("replace a lost card", replaced.status === 201 && !!newCard && newCard !== card && newCard.startsWith(locB.body.code), newCard);
const oldSearch = await find(card);
check("old card still finds the family, marked lost", oldSearch.body?.cardStatus === "lost" && oldSearch.body.results[0]?.cardNumber === newCard);
check("giving away on the lost card -> 409", (await S("POST", "/api/giveaways", { cardNumber: card, locationId: L1, items: [{ isbn: CATERPILLAR, condition: "used" }] })).status === 409);
check("card lookup endpoint", (await S("GET", `/api/cards/${newCard}`)).body?.household?.householdId === fam.householdId);

// ---- surveys ----------------------------------------------------------------------------------
const surveys = (await S("GET", "/api/surveys")).body;
check("intake and follow-up surveys exist", surveys.some((s: any) => s.key === "intake") && surveys.some((s: any) => s.key === "followup_6mo"));
const guardianId = fam.guardians[0].id;
const intakeAns = await S("POST", "/api/surveys/intake/responses", {
  householdId: fam.householdId, guardianId, locationId: L1,
  answers: { books_in_home: "1-10", everyone_reads: false, read_days_per_week: 2 },
});
check("submit intake survey", intakeAns.status === 201 && intakeAns.body?.answered === 3, intakeAns.body);
check("read days out of range -> 400", (await S("POST", "/api/surveys/intake/responses", { householdId: fam.householdId, locationId: L1, answers: { books_in_home: "0", everyone_reads: true, read_days_per_week: 9 } })).status === 400);
check("missing required answer -> 400", (await S("POST", "/api/surveys/intake/responses", { householdId: fam.householdId, locationId: L1, answers: { books_in_home: "0" } })).status === 400);
check("choice not on the list -> 400", (await S("POST", "/api/surveys/intake/responses", { householdId: fam.householdId, locationId: L1, answers: { books_in_home: "lots", everyone_reads: true, read_days_per_week: 1 } })).status === 400);
check("guardian from another family -> 400", (await S("POST", "/api/surveys/intake/responses", { householdId: otherFam.body.householdId, guardianId, locationId: L1, answers: { books_in_home: "0", everyone_reads: true, read_days_per_week: 1 } })).status === 400);
const follow = await S("POST", "/api/surveys/followup_6mo/responses", {
  householdId: fam.householdId, guardianId, locationId: L1,
  answers: { books_in_home: "11-25", read_days_per_week: 5, child_enjoys_reading: 4, comments: "Sofia loves the caterpillar book" },
});
check("submit a different survey (follow-up)", follow.status === 201 && follow.body?.answered === 4, follow.body);
const newSurvey = await A("POST", "/api/surveys", {
  key: `spring_event_${run}`, name: "Spring event",
  questions: [{ key: "favorite_genre", type: "multi_choice", prompt: { en: "Favorite kinds of books?" }, choices: [{ value: "animals", label: { en: "Animals" } }, { value: "science", label: { en: "Science" } }] }],
});
check("admin creates a new survey", newSurvey.status === 201 && newSurvey.body?.questions?.length === 1, newSurvey.body?.error);
const multi = await S("POST", `/api/surveys/spring_event_${run}/responses`, { householdId: fam.householdId, locationId: L2, answers: { favorite_genre: ["animals", "science"] } });
check("answer a multi-choice question", multi.status === 201, multi.body);

// ---- family detail + reports ----------------------------------------------------------------------
const detail = (await S("GET", `/api/households/${fam.householdId}`)).body;
check("family detail: books received, giveaways, surveys", detail.giveaways[0]?.books?.every((b: any) => "readingLevel" in b && "language" in b) && detail.booksReceived === 2 && detail.giveaways.length === 1 && detail.surveyResponses.length === 3 && detail.cards.length === 2, { books: detail.booksReceived, visits: detail.giveaways.length, surveys: detail.surveyResponses.length });
const rep = (await S("GET", `/api/reports/summary?locationId=${L1}`)).body;
check("report: books given at location", rep.booksGivenAway?.books === 2 && rep.families?.served === 1, rep.booksGivenAway && { books: rep.booksGivenAway.books, families: rep.families });
check("report: by condition and category", rep.booksGivenAway.byCondition.length === 2 && rep.booksGivenAway.byCategory.length >= 1, rep.booksGivenAway.byCategory);
check("report: by reading level and book language", rep.booksGivenAway.byReadingLevel.length >= 1 && rep.booksGivenAway.byBookLanguage.some((r: any) => r.language === "English"), [rep.booksGivenAway.byReadingLevel, rep.booksGivenAway.byBookLanguage]);
check("report: by child age bracket", rep.booksGivenAway.byChildAgeBracket.some((r: any) => r.age_bracket === "3-5" && r.books === 1), rep.booksGivenAway.byChildAgeBracket);
check("report: by home language", rep.booksGivenAway.byHomeLanguage.some((r: any) => r.language === "Spanish"), rep.booksGivenAway.byHomeLanguage);
check("report: reading days change (2 -> 5)", rep.surveys.readDaysPerWeek.changeForReturningFamilies.first_average === 2 && rep.surveys.readDaysPerWeek.changeForReturningFamilies.latest_average === 5, rep.surveys.readDaysPerWeek);
check("report: books in home, latest answer", rep.surveys.booksInHome.some((r: any) => r.answer === "11-25"), rep.surveys.booksInHome);
check("report: everyone reads", rep.surveys.everyoneReads.no === 1, rep.surveys.everyoneReads);
const inv = (await S("GET", `/api/inventory?locationId=${L1}`)).body;
check("inventory list includes reading level and language", inv.some((r: any) => r.isbn === CATERPILLAR && r.readingLevel && r.language), inv[0]);
const all = (await S("GET", "/api/reports/summary")).body;
check("report: returning counts families with 2+ visits", typeof all.families.returning === "number" && all.families.returning <= all.families.served, all.families);
check("report: stock on hand", rep.stockOnHand.length >= 1, rep.stockOnHand);
const cov1 = (await S("GET", `/api/reports/survey-coverage?locationId=${L1}`)).body;
check("survey coverage: family with intake isn't flagged", cov1.familiesVisited === 1 && cov1.familiesSurveyed === 1 && cov1.familiesMissing === 0 && cov1.missing.length === 0, { ...cov1, missing: cov1.missing?.length });
const cov2 = (await S("GET", `/api/reports/survey-coverage?locationId=${L2}`)).body;
const raceWinner = race.find((r) => r.status === 201)?.body?.household?.householdId;
check("survey coverage: visited family without intake is flagged", cov2.missing.some((m: any) => m.householdId === raceWinner && m.cardNumber && m.visits === 1), { missing: cov2.familiesMissing, visited: cov2.familiesVisited });
const covFollow = (await S("GET", `/api/reports/survey-coverage?locationId=${L1}&survey=followup_6mo`)).body;
check("survey coverage: per survey", covFollow.familiesSurveyed === 1 && covFollow.familiesMissing === 0, covFollow.familiesSurveyed);
check("survey coverage: bad survey key -> 400", (await S("GET", "/api/reports/survey-coverage?survey=Bad Key")).status === 400);
check("report: bad date -> 400", (await S("GET", "/api/reports/summary?from=last-week")).status === 400);

const pre = await fetch(`${API}/api/giveaways`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
check("CORS preflight for the app origin", pre.headers.get("access-control-allow-origin") === ORIGIN);
const evil = await fetch(`${API}/api/giveaways`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
check("CORS refuses other origins", evil.headers.get("access-control-allow-origin") !== "https://evil.example");

// Keep test locations and surveys out of staff menus.
await sqlc.query("update locations set active = false where id = any($1)", [[L1, L2]]);
await sqlc.query("update surveys set active = false where key = $1", [`spring_event_${run}`]);
await sqlc.end();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
