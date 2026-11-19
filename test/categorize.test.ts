import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { classify } from "../src/books/categorize.ts";
import type { BookInfo } from "../src/books/lookup.ts";

const book: BookInfo = {
  isbn: "9780441172719", title: "Dune", subtitle: null, authors: ["Frank Herbert"], publisher: null,
  publishedDate: null, pageCount: 600, description: "Desert planet.", coverUrl: null,
  sourceCategories: ["Fiction"], languageCode: null, source: "google", raw: {},
};
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const chat = (content: string) => json({ choices: [{ message: { content } }] });

const GW = { NEON_AI_GATEWAY_TOKEN: "t", NEON_AI_GATEWAY_BASE_URL: "https://gw" };
/** Answers each prompt by its first line ("...genre...", "...reading level...", "...language..."). */
const answerBy = (answers: Record<string, string>, seen: { url: string; body: any }[] = []) =>
  (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    seen.push({ url, body });
    const first: string = body.messages[0].content.split("\n")[0];
    const key = Object.keys(answers).find((k) => new RegExp(k, "i").test(first));
    return key ? chat(answers[key]) : chat("no idea");
  }) as unknown as typeof fetch;

test("the gateway answers all three questions with gpt-6-luna first", async () => {
  const seen: { url: string; body: any }[] = [];
  globalThis.fetch = answerBy({ genre: "Science Fiction", "reading level": "Adult", language: "English" }, seen);
  const c = await classify(book, GW);
  assert.deepEqual([...new Set(seen.map((x) => x.url))], ["https://gw/v1/chat/completions"]);
  assert.deepEqual([...new Set(seen.map((x) => x.body.model))], ["gpt-6-luna"]);
  assert.match(seen[0].body.messages[0].content, /Title: Dune/);
  assert.deepEqual(c, {
    category: { value: "Science Fiction", source: "neon-gateway:gpt-6-luna", confidence: null },
    readingLevel: { value: "Adult", source: "neon-gateway:gpt-6-luna", confidence: null },
    language: { value: "English", source: "neon-gateway:gpt-6-luna", confidence: null },
  });
});

test("an OpenAI key alone is ignored: no gateway means rules", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return chat("x"); }) as unknown as typeof fetch;
  const c = await classify(book, { OPENAI_API_KEY: "sk" });
  assert.equal(calls, 0);
  assert.equal(c.category.source, "rules");
});

test("two metadata languages mean Bilingual, and the AI is not asked about language", async () => {
  const seen: { url: string; body: any }[] = [];
  globalThis.fetch = answerBy({ genre: "Children's", "reading level": "Picture Book" }, seen);
  const c = await classify({ ...book, languageCode: "eng,spa" }, GW);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((x) => !/language/i.test(x.body.messages[0].content.split("\n")[0])));
  assert.deepEqual(c.language, { value: "Bilingual", source: "metadata", confidence: null });
});

test("a single metadata language still lets the AI say Bilingual", async () => {
  globalThis.fetch = answerBy({ genre: "Children's", "reading level": "Board Book", language: "Bilingual" });
  const c = await classify({ ...book, title: "Colors / Colores", languageCode: "en" }, GW);
  assert.deepEqual(c.language, { value: "Bilingual", source: "neon-gateway:gpt-6-luna", confidence: null });
});

test("without AI, a single metadata language decides, then the bilingual keyword rule", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const spanish = await classify({ ...book, languageCode: "spa" }, GW);
  assert.deepEqual(spanish.language, { value: "Spanish", source: "metadata", confidence: null });
  const bilingual = await classify({ ...book, sourceCategories: ["Spanish language materials -- Bilingual"] }, {});
  assert.deepEqual(bilingual.language, { value: "Bilingual", source: "rules", confidence: null });
});

test("failing or unsure models fall through in order; answered questions are kept", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const { model, messages } = JSON.parse(init.body as string);
    calls.push(model);
    if (model === "a") return new Response("rate limited", { status: 429 });
    const first: string = messages[0].content.split("\n")[0];
    if (model === "b") return chat(/genre/i.test(first) ? "Science Fiction" : /language/i.test(first) ? "English" : "maybe");
    return chat("YA");
  }) as typeof fetch;
  const c = await classify(book, { ...GW, GATEWAY_MODELS: "a,b,c" });
  assert.deepEqual(calls, ["a", "b", "b", "b", "c"]);
  assert.equal(c.category.source, "neon-gateway:b");
  assert.deepEqual(c.readingLevel, { value: "YA", source: "neon-gateway:c", confidence: null });
});

test("with no AI, rules answer category and reading level; language stays null", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const kids = { ...book, title: "Goodnight Moon", sourceCategories: ["Juvenile fiction", "Bedtime"], pageCount: 32, description: null };
  const c = await classify(kids, GW);
  assert.deepEqual(c.readingLevel, { value: "Picture Book", source: "rules", confidence: null });
  assert.equal(c.category.source, "rules");
  assert.equal(c.language, null);
});
