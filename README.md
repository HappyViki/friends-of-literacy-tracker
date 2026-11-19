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

## Staff UI

`web/` is the staff app (Vite + React, no UI framework). `npm run dev` serves it on
http://localhost:5173 against the API deployed to the linked branch (the API allows that origin).

- **Sign-in**: Neon Auth email and password, email verification by code, a "not on the staff list"
  screen, then a location picker (remembered per browser; change it from the header).
- **Front desk**: one search box for a scanned or typed card, email, phone or name (typos are fine).
  Lost cards still find the family, with a warning.
- **New family**: guardians, children (birth year/month or just an age), ZIP and home languages;
  shows the card number and a printable Code 128 card.
- **Family page**: children with ages, books received, survey answers, add a child, replace a card.
- **Give books**: scan ISBNs into a basket, pick new/used and the child; shortages are shown per line.
- **Surveys**: English/Spanish toggle, starting in the family's preferred language.
- **Books**: scan a book (reading level, language and genre with their source, stock by location,
  giveaway history), add copies (donation or purchase; unknown ISBNs are added by hand), and the
  inventory list with transfer, damaged and recount.
- **Reports**: KPIs and charts filtered by date range and location, each with a table view,
  including books by reading level, by book language, and reading level by child's age.
- **Admin**: locations, staff and surveys.

It is laid out for phones and tablets as well as desktops.

## Demo data

`npm run seed:demo` fills the **dev** branch with a realistic program year (it refuses to run when
`NEON_BRANCH` is `production`): 4 locations (a library branch, an elementary school, a community
center and a monthly farmers-market tent), 150 families signed up over the last 12 months with
summer and back-to-school bumps, English-, Spanish- and other-language homes, 71 real children's
and family books (including Spanish and bilingual titles), donations and purchases, about 400
visits giving about 1,200 books, and intake and 6-month follow-up surveys. Contact details are
fake (`example.com`/`example.org`, phones in 555-01xx). The data is repeatable and relative to today.

Every demo row is marked (`created_by`/`issued_by` = `demo-seed`, books with `source` and
`category_model` = `demo`, locations `MAPL`, `CVES`, `EBCC`, `FMKT`).
`npm run seed:demo -- --reset` deletes the demo rows and seeds again (`--reset --only` just deletes).
If staff have since used demo families or locations, the reset stops and lists what it found; add
`--with-staff-activity` to delete those rows too. Run `npm run db:seed` first on a new branch.

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
| `scripts/` | Seed, demo data, staff, end-to-end test |

## Commands

| Command | What it does |
| --- | --- |
| `neon checkout dev` | Work on the `dev` Neon branch (pulls its env into `.env.local`) |
| `npm run db:migrate` | Apply migrations to the linked branch |
| `npm run db:seed` | Languages and the standard surveys (safe to re-run) |
| `npm run seed:demo [-- --reset]` | Demo data on dev (see [Demo data](#demo-data)) |
| `npm run staff:add -- email [--admin]` | Allow someone to use the app |
| `npm run deploy` | Deploy the API to the linked branch |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end test against the deployed API (refuses to run on production) |
| `npm run test:smoke` | Production-safe smoke test (needs `neon env pull --branch production --file .env.neon-production`) |
| `npm run dev` | Staff UI on http://localhost:5173 against the deployed API |
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
