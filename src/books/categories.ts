// The three ways a book is classified. Edit the option lists here; the AI only ever picks one
// of the values listed. Descriptions are shown to the model and help it choose.

export interface Option<V extends string = string> {
  value: V;
  description?: string;
}

// Genre. Keep "Other" last: it is the fallback.
export const CATEGORIES = [
  "Literary Fiction",
  "Mystery & Thriller",
  "Science Fiction",
  "Fantasy",
  "Romance",
  "Horror",
  "Historical Fiction",
  "Graphic Novels & Comics",
  "Poetry & Drama",
  "Children's",
  "Young Adult",
  "Biography & Memoir",
  "History",
  "Science & Nature",
  "Technology & Programming",
  "Business & Economics",
  "Self-Help & Personal Development",
  "Health & Fitness",
  "Cooking & Food",
  "Religion & Spirituality",
  "Philosophy",
  "Politics & Social Sciences",
  "Arts & Photography",
  "Travel",
  "Education & Reference",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const READING_LEVELS = [
  { value: "Board Book", description: "Thick cardboard pages for babies and toddlers (ages 0–3), very few words." },
  { value: "Picture Book", description: "Illustrated book read aloud to young children (ages 3–8), usually about 32 pages." },
  {
    value: "Early Reader",
    description: "Leveled or beginning-reader book for children learning to read on their own (ages 5–8).",
  },
  {
    value: "Chapter Book",
    description: "Mostly text, divided into chapters, for independent readers ages 7–12, including middle grade.",
  },
  { value: "YA", description: "Young adult: written for teenagers, ages 12–18." },
  { value: "Adult", description: "Written for adult readers." },
] as const satisfies readonly Option[];
export type ReadingLevel = (typeof READING_LEVELS)[number]["value"];

export const LANGUAGES = [
  { value: "English", description: "The text is in English." },
  { value: "Spanish", description: "The text is in Spanish." },
  {
    value: "Bilingual",
    description: "The full text appears in two languages, such as English and Spanish side by side.",
  },
  { value: "Other", description: "The text is in another language." },
] as const satisfies readonly Option[];
export type Language = (typeof LANGUAGES)[number]["value"];

export interface Question {
  name: "category" | "readingLevel" | "language";
  instructions: string;
  options: readonly Option[];
}

export const QUESTIONS: readonly Question[] = [
  {
    name: "category",
    instructions:
      "Which category best fits this book? Judge by its genre and subject, not its format or edition. " +
      "Pick Other only when none of the categories fit.",
    options: CATEGORIES.map((value) => ({ value })),
  },
  {
    name: "readingLevel",
    instructions: "Which reading level or type of book is this? Judge by its intended reader's age and its format.",
    options: READING_LEVELS,
  },
  {
    name: "language",
    instructions:
      "What language is the book's text written in? Choose Bilingual when the full text is printed in two " +
      "languages, even if the metadata lists only one. A title in two languages, such as \"Colors / Colores\", " +
      "usually means a bilingual book.",
    options: LANGUAGES,
  },
];

/** Map a model reply to one of the options, or null when it names none. */
export function matchOption(reply: string | null | undefined, options: readonly Option[]): string | null {
  if (!reply) return null;
  const text = reply.trim().replace(/^["'*\s]+|["'*.\s]+$/g, "").toLowerCase();
  const values = options.map((o) => o.value);
  const exact = values.find((v) => v.toLowerCase() === text);
  if (exact) return exact;
  // Reasoning models sometimes wrap the answer in a sentence; take the longest value mentioned.
  const mentioned = values.filter((v) => new RegExp(`\\b${escape(v.toLowerCase())}\\b`).test(text));
  if (mentioned.length === 0) return null;
  return mentioned.sort((a, b) => b.length - a.length)[0];
}

/** Genre-only shorthand, kept for callers and tests. */
export function matchCategory(reply: string | null | undefined): Category | null {
  return matchOption(reply, QUESTIONS[0].options) as Category | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Map language codes ("en", "eng", "spa"; comma-separated when a source lists several) to a
 * Language. Exactly two languages mean Bilingual; three or more are left to the AI (null).
 */
export function languageFromCode(codes: string | null | undefined): Language | null {
  if (!codes) return null;
  const known = new Set<Language>();
  for (const raw of codes.split(",")) {
    const c = raw.trim().toLowerCase().replace(/^\/languages\//, "").split(/[-_]/)[0];
    if (!c || c === "und" || c === "zxx") continue; // undetermined, no linguistic content
    if (c === "mul") return null; // "multiple languages": not specific enough
    known.add(c === "en" || c === "eng" ? "English" : c === "es" || c === "spa" ? "Spanish" : "Other");
  }
  if (codes.split(",").filter((c) => !/^\s*(und|zxx)\s*$/i.test(c)).length > 2) return null; // multilingual: let the AI decide
  if (known.size === 2) return "Bilingual";
  return known.size === 1 ? [...known][0] : null;
}
