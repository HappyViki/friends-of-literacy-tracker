// Classify a book three ways: genre category, reading level and language.
//
// Language: when the metadata lists two languages the book is Bilingual. Otherwise the AI
// decides (it sees the language codes, and can spot bilingual titles that metadata misses);
// without AI, a single metadata code decides, then a keyword rule for "bilingual".
// AI answers come from the Neon AI Gateway (NEON_AI_GATEWAY_* is injected by Neon; calls need
// AI Gateway credits). Its models are tried in order (GATEWAY_MODELS), and each question goes
// to the next model only if the previous one gave no valid answer. Anything still open is
// answered by keyword rules on the book's subjects and page count.
import { languageFromCode, matchOption, QUESTIONS, type Category, type Language, type Question, type ReadingLevel } from "./categories.ts";
import type { BookInfo } from "./lookup.ts";
import { categorizeByRules, languageByRules, readingLevelByRules } from "./rules.ts";

// Neon AI Gateway catalog IDs, tried in order (see GET $NEON_AI_GATEWAY_BASE_URL/v1/models).
const DEFAULT_GATEWAY_MODELS = ["gpt-6-luna", "claude-haiku-5-5", "gpt-5-nano"];
const TIMEOUT_MS = 20_000;

export interface Answer<V extends string = string> {
  value: V;
  /** "neon-gateway:<model>", "metadata" or "rules". */
  source: string;
  /** Kept for stored books classified earlier by the OpenAI Decisions API; null now. */
  confidence: number | null;
}

export interface Classification {
  category: Answer<Category>;
  readingLevel: Answer<ReadingLevel>;
  language: Answer<Language> | null; // null when metadata, AI and rules all have nothing
}

type Name = Question["name"];
type Partial = { [K in Name]?: { value: string; confidence: number | null } };

interface Provider {
  label: string;
  /** Answer the given questions. Missing keys mean "no valid answer". */
  run(book: BookInfo, questions: readonly Question[]): Promise<Partial>;
}

/** The book fields the models see. HTML is stripped and the description is capped to keep input small. */
export function bookEvidence(book: BookInfo) {
  return {
    title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
    authors: book.authors,
    subjects: book.sourceCategories,
    pageCount: book.pageCount,
    languageCode: book.languageCode,
    description: book.description?.replace(/<[^>]+>/g, "").slice(0, 1200) ?? null,
  };
}

export function buildPrompt(book: BookInfo, q: Question): string {
  const e = bookEvidence(book);
  const lines = [
    q.instructions,
    `Choose exactly one of:`,
    q.options.map((o) => `- ${o.value}${o.description ? `: ${o.description}` : ""}`).join("\n"),
    ``,
    `Title: ${e.title}`,
    `Authors: ${e.authors.join(", ") || "unknown"}`,
    e.subjects.length ? `Publisher/library subjects: ${e.subjects.join("; ")}` : null,
    e.pageCount ? `Pages: ${e.pageCount}` : null,
    e.description ? `Description: ${e.description}` : null,
    ``,
    `Reply with only the option, copied exactly from the list.`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

async function post(url: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function chatProvider(label: string, url: string, token: string, model: string): Provider {
  return {
    label,
    async run(book, questions) {
      const out: Partial = {};
      for (const q of questions) {
        const data = await post(url, token, {
          model,
          // Room for reasoning models to think before answering; the answer itself is a few tokens.
          max_tokens: 1024,
          messages: [{ role: "user", content: buildPrompt(book, q) }],
        });
        const value = matchOption(data.choices?.[0]?.message?.content, q.options);
        if (value) out[q.name] = { value, confidence: null };
      }
      return out;
    },
  };
}

const list = (value: string | undefined, fallback: string[]) =>
  value?.split(",").map((m) => m.trim()).filter(Boolean) ?? fallback;

function providers(env: NodeJS.ProcessEnv): Provider[] {
  const out: Provider[] = [];
  if (env.NEON_AI_GATEWAY_TOKEN && env.NEON_AI_GATEWAY_BASE_URL) {
    const url = `${env.NEON_AI_GATEWAY_BASE_URL}/v1/chat/completions`;
    for (const model of list(env.GATEWAY_MODELS, DEFAULT_GATEWAY_MODELS)) {
      out.push(chatProvider(`neon-gateway:${model}`, url, env.NEON_AI_GATEWAY_TOKEN, model));
    }
  }
  return out;
}

export async function classify(book: BookInfo, env: NodeJS.ProcessEnv = process.env): Promise<Classification> {
  const answers: { [K in Name]?: Answer } = {};

  const fromMetadata = languageFromCode(book.languageCode);
  if (fromMetadata === "Bilingual") answers.language = { value: fromMetadata, source: "metadata", confidence: null };

  for (const p of providers(env)) {
    const open = QUESTIONS.filter((q) => !answers[q.name]);
    if (open.length === 0) break;
    try {
      const got = await p.run(book, open);
      for (const q of open) {
        const a = got[q.name];
        if (a) answers[q.name] = { ...a, source: p.label };
      }
      const missed = open.filter((q) => !got[q.name]).map((q) => q.name);
      if (missed.length) console.warn(`[classify] ${p.label} gave no valid answer for: ${missed.join(", ")}`);
    } catch (err) {
      console.warn(`[classify] ${p.label} failed:`, (err as Error).message);
    }
  }

  return {
    category: (answers.category as Answer<Category>) ?? {
      value: categorizeByRules(book) ?? "Other",
      source: "rules",
      confidence: null,
    },
    readingLevel: (answers.readingLevel as Answer<ReadingLevel>) ?? {
      value: readingLevelByRules(book),
      source: "rules",
      confidence: null,
    },
    language: (answers.language as Answer<Language>) ?? languageFallback(book, fromMetadata),
  };
}

function languageFallback(book: BookInfo, fromMetadata: Language | null): Answer<Language> | null {
  if (fromMetadata) return { value: fromMetadata, source: "metadata", confidence: null };
  const byRules = languageByRules(book);
  return byRules ? { value: byRules, source: "rules", confidence: null } : null;
}

export function hasAiProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  return providers(env).length > 0;
}
