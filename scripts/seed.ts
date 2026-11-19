// Reference data: languages and the standard surveys. Safe to re-run; existing rows are updated.
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { languages, surveyQuestions, surveys, type LocalizedText, type QuestionChoice } from "../src/db/schema.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
const db = drizzle(pool);

const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Spanish"],
  ["zh", "Chinese"],
  ["vi", "Vietnamese"],
  ["ar", "Arabic"],
  ["fr", "French"],
  ["ht", "Haitian Creole"],
  ["pt", "Portuguese"],
  ["ko", "Korean"],
  ["ru", "Russian"],
  ["tl", "Tagalog"],
  ["so", "Somali"],
  ["am", "Amharic"],
  ["sw", "Swahili"],
  ["ps", "Pashto"],
  ["fa", "Persian (Dari/Farsi)"],
  ["uk", "Ukrainian"],
  ["my", "Burmese"],
  ["ne", "Nepali"],
  ["asl", "American Sign Language"],
];

type Q = {
  key: string;
  type: "number" | "boolean" | "single_choice" | "multi_choice" | "scale" | "text";
  prompt: LocalizedText;
  choices?: QuestionChoice[];
  min?: number;
  max?: number;
  required?: boolean;
};

const BOOKS_IN_HOME: Q = {
  key: "books_in_home",
  type: "single_choice",
  prompt: { en: "About how many books are in your home?", es: "¿Aproximadamente cuántos libros hay en su casa?" },
  choices: [
    { value: "0", label: { en: "None", es: "Ninguno" } },
    { value: "1-10", label: { en: "1–10", es: "1–10" } },
    { value: "11-25", label: { en: "11–25", es: "11–25" } },
    { value: "26-50", label: { en: "26–50", es: "26–50" } },
    { value: "51-100", label: { en: "51–100", es: "51–100" } },
    { value: "100+", label: { en: "More than 100", es: "Más de 100" } },
  ],
  required: true,
};
const EVERYONE_READS: Q = {
  key: "everyone_reads",
  type: "boolean",
  prompt: { en: "Can everyone in your home read?", es: "¿Todos en su casa saben leer?" },
  required: true,
};
const READ_DAYS: Q = {
  key: "read_days_per_week",
  type: "number",
  prompt: {
    en: "How many days a week do you read with your child?",
    es: "¿Cuántos días a la semana lee con su hijo o hija?",
  },
  min: 0,
  max: 7,
  required: true,
};

const SURVEYS: { key: string; name: string; description: string; questions: Q[] }[] = [
  {
    key: "intake",
    name: "Intake",
    description: "Asked when a family signs up.",
    questions: [BOOKS_IN_HOME, EVERYONE_READS, READ_DAYS],
  },
  {
    key: "followup_6mo",
    name: "6-month follow-up",
    description: "Same core questions as intake, so reports can show change over time.",
    questions: [
      BOOKS_IN_HOME,
      READ_DAYS,
      {
        key: "child_enjoys_reading",
        type: "scale",
        prompt: {
          en: "How much does your child enjoy reading? (1 = not at all, 5 = a lot)",
          es: "¿Cuánto disfruta su hijo o hija de la lectura? (1 = nada, 5 = mucho)",
        },
        min: 1,
        max: 5,
      },
      {
        key: "comments",
        type: "text",
        prompt: { en: "Anything else you'd like to tell us?", es: "¿Algo más que quiera contarnos?" },
      },
    ],
  },
];

await db
  .insert(languages)
  .values(LANGUAGES.map(([code, name]) => ({ code, name })))
  .onConflictDoUpdate({ target: languages.code, set: { name: sql`excluded.name` } });

for (const s of SURVEYS) {
  const [survey] = await db
    .insert(surveys)
    .values({ key: s.key, name: s.name, description: s.description })
    .onConflictDoUpdate({ target: surveys.key, set: { name: s.name, description: s.description } })
    .returning();
  for (const [i, q] of s.questions.entries()) {
    const values = {
      surveyId: survey.id,
      key: q.key,
      position: i + 1,
      type: q.type,
      prompt: q.prompt,
      choices: q.choices ?? null,
      minValue: q.min ?? null,
      maxValue: q.max ?? null,
      required: q.required ?? false,
    };
    await db
      .insert(surveyQuestions)
      .values(values)
      .onConflictDoUpdate({ target: [surveyQuestions.surveyId, surveyQuestions.key], set: values });
  }
}

console.log(`seeded ${LANGUAGES.length} languages and ${SURVEYS.length} surveys`);
await pool.end();
