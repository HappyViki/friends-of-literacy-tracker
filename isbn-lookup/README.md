# ISBN lookup function

A Neon Function that takes an ISBN, finds the book, and puts it in one of the categories in
[`src/categories.ts`](src/categories.ts). Results are cached in Postgres, so each ISBN is
looked up and categorized once.

```bash
curl -H "x-api-key: $BOOKS_API_KEY" https://<branch-id>-books.compute.<cell>.us-east-2.aws.neon.tech/books/978-0-441-17271-9
```

```json
{ "isbn": "9780441172719", "title": "Dune", "authors": ["Frank Herbert"], "category": "Science Fiction",
  "categoryModel": "neon-gateway:claude-haiku-5-5", "source": "openlibrary", "coverUrl": "https://…", "cached": false }
```

## How it works

1. **Validate** the ISBN-10 or ISBN-13 checksum and convert it to ISBN-13, the cache key.
2. **Cache**: return the `books` row if there is one. Add `?refresh=1` to look the book up again.
3. **Look up** the book in Google Books. Open Library fills in missing fields, or answers on its
   own when Google has nothing or is rate-limited.
4. **Categorize** with the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions):
   one `choice` question whose options are the categories, so the answer is always on the list
   and comes with a `categoryConfidence` from 0 to 1. Next come the Neon AI Gateway
   (`claude-haiku-5-5`, then `gpt-5-nano`) and OpenCode, if configured. If no model answers,
   keyword rules match the book's subjects and set `categoryModel: "rules"`. Those rows are
   re-categorized on their next lookup once a model works.

## Routes

| Route | Auth | |
| --- | --- | --- |
| `GET /` | none | Health check |
| `GET /books/:isbn` | API key | Lookup and category. 400 for an invalid ISBN, 404 when neither API has the book |
| `GET /categories` | API key | The category list |

Send the key as `x-api-key: …` or `Authorization: Bearer …`. Don't put it in browser code:
call the function from your server.

## Environment

| Variable | | |
| --- | --- | --- |
| `BOOKS_API_KEY` | required | Shared secret callers must send |
| `OPENAI_API_KEY` | optional, recommended | Decisions API, tried first. Its project must allow `gpt-6-luna` (Settings → Project → Limits). About $0.00005 per book; output is free |
| `DECISIONS_MODEL` | optional | Default `gpt-6-luna`, currently the only Decisions model |
| `GATEWAY_MODELS` | optional | AI Gateway model IDs in order. Default `claude-haiku-5-5,gpt-5-nano` |
| `GOOGLE_BOOKS_API_KEY` | optional, recommended | Keyless Google Books calls are often rate-limited (429) |
| `OPENCODE_API_KEY`, `OPENCODE_BASE_URL`, `OPENCODE_MODELS` | optional | Tried before the gateway. OpenCode Zen's `-free` models reject backend calls (`FreeUsageLimitError`), so this is for paid Zen models or OpenCode Go (`https://opencode.ai/inference/go/v1`) |

Neon injects `DATABASE_URL` and `NEON_AI_GATEWAY_*`. The AI Gateway needs prepaid credits
(Neon Console → Billing). Until then, every gateway call returns 403 and the keyword rules apply.

## Develop and deploy

```bash
cd isbn-lookup
npm install
neon link                                  # once; writes .neon and pulls env into .env.local
echo "BOOKS_API_KEY=$(openssl rand -hex 24)" >> .env.local
npm run db:migrate                         # create the books table
npm run dev                                # neon dev on http://localhost:8787
npm test
npm run deploy                             # neon deploy --env .env.local
```

To change the schema, edit `src/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`.
