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
const choice = (name: string, value: string, confidence: number) => ({ type: "choice", name, choice: value, confidence });

test("one Decisions request answers all three questions", async () => {
  let body: any;
  let calls = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/decisions");
    body = JSON.parse(init.body as string);
    return json({ answers: [
      choice("category", "Science Fiction", 0.9),
      choice("readingLevel", "Adult", 0.8),
      choice("language", "English", 0.99),
    ] });
  }) as typeof fetch;
  const c = await classify(book, { OPENAI_API_KEY: "sk" });
  assert.equal(calls, 1);
  assert.deepEqual(body.questions.map((q: any) => q.name), ["category", "readingLevel", "language"]);
  assert.ok(body.questions[1].choices.find((x: any) => x.value === "Board Book").description);
  assert.equal(body.input[0].content[1].data.title, "Dune");
  assert.deepEqual(c, {
    category: { value: "Science Fiction", source: "openai-decisions:gpt-6-luna", confidence: 0.9 },
    readingLevel: { value: "Adult", source: "openai-decisions:gpt-6-luna", confidence: 0.8 },
    language: { value: "English", source: "openai-decisions:gpt-6-luna", confidence: 0.99 },
  });
});

test("two metadata languages mean Bilingual, and the AI is not asked about language", async () => {
  let asked: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    asked = JSON.parse(init.body as string).questions.map((q: any) => q.name);
    return json({ answers: [choice("category", "Children's", 0.9), choice("readingLevel", "Picture Book", 0.9)] });
  }) as typeof fetch;
  const c = await classify({ ...book, languageCode: "eng,spa" }, { OPENAI_API_KEY: "sk" });
  assert.deepEqual(asked, ["category", "readingLevel"]);
  assert.deepEqual(c.language, { value: "Bilingual", source: "metadata", confidence: null });
});

test("a single metadata language still lets the AI say Bilingual", async () => {
  let body: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return json({ answers: [
      choice("category", "Children's", 0.9), choice("readingLevel", "Board Book", 0.9), choice("language", "Bilingual", 0.97),
    ] });
  }) as typeof fetch;
  const c = await classify({ ...book, title: "Colors / Colores", languageCode: "en" }, { OPENAI_API_KEY: "sk" });
  assert.equal(body.input[0].content[1].data.languageCode, "en");
  assert.deepEqual(c.language, { value: "Bilingual", source: "openai-decisions:gpt-6-luna", confidence: 0.97 });
});

test("without AI, a single metadata language decides, then the bilingual keyword rule", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const spanish = await classify({ ...book, languageCode: "spa" }, { OPENAI_API_KEY: "sk" });
  assert.deepEqual(spanish.language, { value: "Spanish", source: "metadata", confidence: null });
  const bilingual = await classify({ ...book, sourceCategories: ["Spanish language materials -- Bilingual"] }, {});
  assert.deepEqual(bilingual.language, { value: "Bilingual", source: "rules", confidence: null });
});

test("a refused question falls through to the next provider; answered ones are kept", async () => {
  const chatAsked: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (url.includes("/decisions")) {
      return json({ answers: [
        choice("category", "Science Fiction", 0.9),
        { type: "refusal", name: "readingLevel" },
        choice("language", "English", 0.95),
      ] });
    }
    const prompt: string = JSON.parse(init.body as string).messages[0].content;
    chatAsked.push(prompt.split("\n")[0]);
    return chat("YA");
  }) as typeof fetch;
  const c = await classify(book, { OPENAI_API_KEY: "sk", NEON_AI_GATEWAY_TOKEN: "t", NEON_AI_GATEWAY_BASE_URL: "https://gw", GATEWAY_MODELS: "g" });
  assert.equal(chatAsked.length, 1);
  assert.match(chatAsked[0], /reading level/);
  assert.equal(c.category.source, "openai-decisions:gpt-6-luna");
  assert.deepEqual(c.readingLevel, { value: "YA", source: "neon-gateway:g", confidence: null });
});

test("failing chat models fall through in order", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const model = JSON.parse(init.body as string).model;
    calls.push(model);
    if (model === "a") return new Response("rate limited", { status: 429 });
    return chat(calls.length === 2 ? "Science Fiction" : calls.length === 3 ? "Adult" : "English");
  }) as typeof fetch;
  const c = await classify(book, { OPENCODE_API_KEY: "k", OPENCODE_MODELS: "a,b" });
  assert.deepEqual(calls, ["a", "b", "b", "b"]);
  assert.equal(c.category.value, "Science Fiction");
  assert.equal(c.readingLevel.value, "Adult");
  assert.equal(c.language?.value, "English");
});

test("with no AI, rules answer category and reading level; language stays null", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 500 })) as unknown as typeof fetch;
  const kids = { ...book, title: "Goodnight Moon", sourceCategories: ["Juvenile fiction", "Bedtime"], pageCount: 32, description: null };
  const c = await classify(kids, { OPENAI_API_KEY: "sk" });
  assert.deepEqual(c.readingLevel, { value: "Picture Book", source: "rules", confidence: null });
  assert.equal(c.category.source, "rules");
  assert.equal(c.language, null);
});
