// Pick one category for a book. Providers are tried in order, and each is used only when its
// credentials are set:
//   1. OpenAI Decisions API (OPENAI_API_KEY): a typed "choice" answer with a confidence score
//   2. OpenCode chat models (OPENCODE_API_KEY)
//   3. Neon AI Gateway chat models (injected by Neon; needs AI Gateway credits)
//   4. Keyword rules on the book's subjects
import { CATEGORIES, matchCategory, type Category } from "./categories.ts";
import type { BookInfo } from "./lookup.ts";
import { categorizeByRules } from "./rules.ts";

// Decisions API: $0.10 per 1M input tokens, output is free. gpt-6-luna is its only model.
const DECISIONS_URL = "https://api.openai.com/v1/decisions";
const DEFAULT_DECISIONS_MODEL = "gpt-6-luna";
// OpenCode Zen (pay as you go). For an OpenCode Go plan use https://opencode.ai/inference/go/v1.
// Zen's "-free" models only work inside the OpenCode client; from a backend they return FreeUsageLimitError.
const DEFAULT_OPENCODE_BASE_URL = "https://opencode.ai/zen/v1";
const DEFAULT_OPENCODE_MODELS = ["deepseek-v4.1-flash-free", "mimo-v2.6-flash-free", "nemotron-3.5-lightning-free"];
// Neon AI Gateway catalog IDs, tried in order. Haiku 5.5 costs about $0.00005 per book here.
const DEFAULT_GATEWAY_MODELS = ["claude-haiku-5-5", "gpt-5-nano"];
const TIMEOUT_MS = 20_000;

export interface CategoryResult {
  category: Category;
  /** e.g. "openai-decisions:gpt-6-luna", or "rules" when no model answered. */
  model: string;
  /** 0–1, from the Decisions API only; null for chat models and rules. */
  confidence: number | null;
}

interface Answer {
  reply: string | null;
  confidence: number | null;
}

interface Provider {
  label: string;
  run(book: BookInfo): Promise<Answer>;
}

/** The book fields the models see. HTML is stripped and the description is capped to keep input small. */
export function bookEvidence(book: BookInfo) {
  return {
    title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
    authors: book.authors,
    subjects: book.sourceCategories,
    description: book.description?.replace(/<[^>]+>/g, "").slice(0, 1200) ?? null,
  };
}

export function buildPrompt(book: BookInfo): string {
  const e = bookEvidence(book);
  const lines = [
    `Classify this book into exactly one of these categories:`,
    CATEGORIES.map((c) => `- ${c}`).join("\n"),
    ``,
    `Title: ${e.title}`,
    `Authors: ${e.authors.join(", ") || "unknown"}`,
    e.subjects.length ? `Publisher/library subjects: ${e.subjects.join("; ")}` : null,
    e.description ? `Description: ${e.description}` : null,
    ``,
    `Reply with only the category name, copied exactly from the list.`,
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

function decisionsProvider(apiKey: string, model: string): Provider {
  return {
    label: `openai-decisions:${model}`,
    async run(book) {
      const data = await post(DECISIONS_URL, apiKey, {
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Book metadata from Google Books and Open Library:" },
              { type: "input_json", data: bookEvidence(book) },
            ],
          },
        ],
        questions: [
          {
            type: "choice",
            name: "category",
            instructions:
              "Which category best fits this book? Judge by its genre and subject, not its format or edition. " +
              "Pick Other only when none of the categories fit.",
            choices: CATEGORIES.map((value) => ({ value })),
          },
        ],
      });
      const answer = data.answers?.[0];
      if (answer?.type !== "choice") return { reply: null, confidence: null }; // refusal
      return { reply: String(answer.choice), confidence: answer.confidence ?? null };
    },
  };
}

function chatProvider(label: string, url: string, token: string, model: string): Provider {
  return {
    label,
    async run(book) {
      const data = await post(url, token, {
        model,
        // Room for reasoning models to think before answering; the answer itself is a few tokens.
        max_tokens: 1024,
        temperature: 0,
        messages: [{ role: "user", content: buildPrompt(book) }],
      });
      return { reply: data.choices?.[0]?.message?.content ?? null, confidence: null };
    },
  };
}

const list = (value: string | undefined, fallback: string[]) =>
  value?.split(",").map((m) => m.trim()).filter(Boolean) ?? fallback;

function providers(env: NodeJS.ProcessEnv): Provider[] {
  const out: Provider[] = [];
  if (env.OPENAI_API_KEY) {
    out.push(decisionsProvider(env.OPENAI_API_KEY, env.DECISIONS_MODEL || DEFAULT_DECISIONS_MODEL));
  }
  if (env.OPENCODE_API_KEY) {
    const base = (env.OPENCODE_BASE_URL || DEFAULT_OPENCODE_BASE_URL).replace(/\/+$/, "");
    for (const model of list(env.OPENCODE_MODELS, DEFAULT_OPENCODE_MODELS)) {
      out.push(chatProvider(`opencode:${model}`, `${base}/chat/completions`, env.OPENCODE_API_KEY, model));
    }
  }
  if (env.NEON_AI_GATEWAY_TOKEN && env.NEON_AI_GATEWAY_BASE_URL) {
    const url = `${env.NEON_AI_GATEWAY_BASE_URL}/v1/chat/completions`;
    for (const model of list(env.GATEWAY_MODELS, DEFAULT_GATEWAY_MODELS)) {
      out.push(chatProvider(`neon-gateway:${model}`, url, env.NEON_AI_GATEWAY_TOKEN, model));
    }
  }
  return out;
}

export async function categorize(book: BookInfo, env: NodeJS.ProcessEnv = process.env): Promise<CategoryResult> {
  for (const p of providers(env)) {
    try {
      const { reply, confidence } = await p.run(book);
      const category = matchCategory(reply);
      if (category) return { category, model: p.label, confidence };
      console.warn(`[categorize] ${p.label} gave no known category`);
    } catch (err) {
      console.warn(`[categorize] ${p.label} failed:`, (err as Error).message);
    }
  }
  return { category: categorizeByRules(book) ?? "Other", model: "rules", confidence: null };
}

export function hasAiProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  return providers(env).length > 0;
}
