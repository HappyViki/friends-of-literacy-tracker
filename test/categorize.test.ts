import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { categorize } from "../src/books/categorize.ts";
import type { BookInfo } from "../src/books/lookup.ts";

const book: BookInfo = {
  isbn: "9780441172719", title: "Dune", subtitle: null, authors: ["Frank Herbert"], publisher: null,
  publishedDate: null, pageCount: null, description: "Desert planet.", coverUrl: null,
  sourceCategories: ["Fiction"], source: "google", raw: {},
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function reply(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

test("falls through failing models to the gateway", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const model = JSON.parse(init.body as string).model;
    calls.push(model);
    if (model === "a") return new Response("rate limited", { status: 429 });
    if (model === "b") return reply("Space opera");
    return reply("Science Fiction");
  }) as typeof fetch;
  const result = await categorize(book, {
    OPENCODE_API_KEY: "k", OPENCODE_MODELS: "a,b",
    NEON_AI_GATEWAY_TOKEN: "t", NEON_AI_GATEWAY_BASE_URL: "https://gw", GATEWAY_MODELS: "g",
  });
  assert.deepEqual(calls, ["a", "b", "g"]);
  assert.deepEqual(result, { category: "Science Fiction", model: "neon-gateway:g", confidence: null });
});

test("returns Other with no model when nothing answers", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const bare = { ...book, sourceCategories: [], description: null };
  assert.deepEqual(await categorize(bare, { OPENCODE_API_KEY: "k", OPENCODE_MODELS: "a" }), {
    category: "Other", model: "rules", confidence: null,
  });
});

test("keyword rules categorize when no model answers", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const scifi = { ...book, sourceCategories: ["Fiction / Science Fiction / Space Opera"] };
  assert.deepEqual(await categorize(scifi, {}), { category: "Science Fiction", model: "rules", confidence: null });
});

test("Decisions API answers first, with confidence", async () => {
  let body: any;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/decisions");
    body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ answers: [{ type: "choice", name: "category", choice: "Science Fiction", confidence: 0.91 }] }));
  }) as typeof fetch;
  const result = await categorize(book, { OPENAI_API_KEY: "sk", NEON_AI_GATEWAY_TOKEN: "t", NEON_AI_GATEWAY_BASE_URL: "https://gw" });
  assert.deepEqual(result, { category: "Science Fiction", model: "openai-decisions:gpt-6-luna", confidence: 0.91 });
  assert.equal(body.model, "gpt-6-luna");
  assert.equal(body.questions[0].type, "choice");
  assert.ok(body.questions[0].choices.some((c: { value: string }) => c.value === "Other"));
  assert.equal(body.input[0].content[1].data.title, "Dune");
});

test("a Decisions refusal falls through to the next provider", async () => {
  globalThis.fetch = (async (url: string) =>
    url.includes("/decisions")
      ? new Response(JSON.stringify({ answers: [{ type: "refusal", name: "category" }] }))
      : reply("Fantasy")) as typeof fetch;
  const result = await categorize(book, { OPENAI_API_KEY: "sk", NEON_AI_GATEWAY_TOKEN: "t", NEON_AI_GATEWAY_BASE_URL: "https://gw", GATEWAY_MODELS: "g" });
  assert.deepEqual(result, { category: "Fantasy", model: "neon-gateway:g", confidence: null });
});
