# friends-of-literacy-tracker

Staff app for Friends of Literacy: family sign-up with library cards, book inventory across
locations, giveaways, surveys and reports. Runs on one Neon project (**FoL**, `lucky-surf-44422100`):
Lakebase Postgres, Neon Auth for staff sign-in, and the staff API as a Neon Function.

The original intake prototype (`index.html`, `app.js`, `styles.css`, `schema.json`) is kept at the
repo root for reference. The app lives in `src/` (API) and `web/` (staff UI).

## What it does

- **Family intake**: adults (first name, optional last name, email and/or phone, age range, language),
  children (first name, birth year/month or age), ZIP and home languages. Each family gets a
  **library card** like `MID-004217-3`: issuing location, sequence, check digit. Lost cards are
  replaced; the old number still finds the family.
- **Finding families**: card number (typed or scanned), email, phone in any format, or a
  typo-tolerant name search (guardian or child name).
- **Books**: scan an ISBN; the book is looked up (Google Books, Open Library) and classified once per
  ISBN three ways: genre, **reading level** (Board Book, Picture Book, Early Reader, Chapter Book,
  YA, Adult) and **language** (English, Spanish, Bilingual, Other). Each answer keeps its source and
  confidence (OpenAI Decisions API, then Neon AI Gateway, then keyword rules; language also from
  the book's metadata). Books the services don't know can be added by hand.
  Stock is tracked per **location** and **condition (new/used)**.
- **Giveaways**: scan the card, scan the books. Stock can't go below zero, even with two staff
  at once. Scanning a book shows when, where and to which card each copy was given.
- **Surveys**: any number of surveys with typed questions (number, yes/no, choice, scale, text),
  in English and Spanish. Questions share stable keys (`books_in_home`, `everyone_reads`,
  `read_days_per_week`) so reports compare answers across surveys and over time.
- **Reports**: families served (new/returning), books by category, condition, location, month,
  reading level, book language, child age bracket and home language; reading days per week (first vs. latest); books at home;
  share of homes where everyone reads; stock on hand.

## Access

Only staff can use the API. Anyone can create a Neon Auth account, so the API also requires the
account's **email to be verified** and listed in `staff_members`. Add the first admin with
`npm run staff:add -- someone@example.org --admin`; admins add other staff through `POST /api/staff`.

## Layout

| Path | What |
| --- | --- |
| `neon.ts` | Neon services and the `api` Function |
| `src/db/schema.ts` | Database schema (Drizzle); migrations in `drizzle/` |
| `src/api/` | Hono app, staff auth, errors |
| `src/services/` | Families, books and inventory, giveaways, surveys, reports, admin |
| `src/books/` | ISBN lookup and categorizer |
| `src/domain/` | Card numbers, contact normalization, ages |
| `web/` | Staff UI (Vite + React) |
| `scripts/` | Seed, staff, end-to-end test |

## Commands

| Command | What it does |
| --- | --- |
| `neon checkout dev` | Work on the `dev` Neon branch (pulls its env into `.env.local`) |
| `npm run db:migrate` | Apply migrations to the linked branch |
| `npm run db:seed` | Languages and the standard surveys (safe to re-run) |
| `npm run staff:add -- email [--admin]` | Allow someone to use the app |
| `npm run deploy` | Deploy the API to the linked branch |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end test against the deployed API (refuses to run on production) |
| `npm run test:smoke` | Production-safe smoke test (needs `neon env pull --branch production --file .env.production`) |
| `npm run build` / `npm start` | Build / serve the staff UI |

## API

All routes except `/health` need `Authorization: Bearer <Neon Auth JWT>` from a verified staff account.

| Route | |
| --- | --- |
| `POST /api/households` | Intake a family; returns it with its card. `409` if an email/phone is already registered |
| `GET /api/households/search?q=` | Card, email, phone or name |
| `GET /api/households/:id` | Family, cards, children with ages, giveaways, survey answers |
| `POST /api/households/:id/children` | Add a child |
| `POST /api/households/:id/cards` | Replace a lost card |
| `GET /api/cards/:number` | Family by scanned card |
| `GET /api/books/:isbn` | Scan: catalog details, stock, giveaway history |
| `POST /api/books` | Add a book by hand when the ISBN isn't found |
| `GET /api/inventory?locationId=` | Copies on hand |
| `POST /api/inventory/receive` / `transfer` / `adjust` | Change stock |
| `POST /api/giveaways` | Give books to a family (by `cardNumber` or `householdId`) |
| `GET /api/surveys`, `POST /api/surveys/:key/responses` | Surveys; admins create them with `POST /api/surveys` |
| `GET /api/reports/summary?from=&to=&locationId=` | Program report |
| `GET/POST /api/locations`, `GET /api/languages`, `GET/POST /api/staff` | Reference data and admin |

The Neon AI Gateway fallback needs credits on the Neon org; the OpenAI key (`OPENAI_API_KEY`
in `.env.local`) is the main categorizer.
