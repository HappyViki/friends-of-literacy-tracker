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

// Story Garden surveys. "Benchmark" questions are required and tracked over time; the others are optional.
// Questions shared by both surveys use the same key, so reports compare first and later visits.
const choices = (items: [string, string, string?][]): QuestionChoice[] =>
  items.map(([value, en, es]) => ({ value, label: { en, es: es ?? en } }));

const booksInHome = (en: string, es: string): Q => ({
  key: "books_in_home",
  type: "single_choice",
  prompt: { en, es },
  choices: choices([["0", "0"], ["1-10", "1–10"], ["11-25", "11–25"], ["26+", "26+"]]),
  required: true,
});
const READ_DAYS: Q = {
  key: "read_days_per_week",
  type: "single_choice",
  prompt: { en: "How many days a week do you read to your child?", es: "¿Cuántos días a la semana le lee a su hijo o hija?" },
  // Reports read "3+" as 3 when averaging.
  choices: choices([["0", "0"], ["1+", "1+"], ["2+", "2+"], ["3+", "3+"], ["4+", "4+"], ["5+", "5+"]]),
  required: true,
};
const ENJOYS_READING: Q = {
  key: "child_enjoys_reading",
  type: "scale",
  prompt: {
    en: "Does your child enjoy reading? (1 = Not at all, 10 = Enjoys reading)",
    es: "¿A su hijo o hija le gusta leer? (1 = Nada, 10 = Le encanta leer)",
  },
  min: 1,
  max: 10,
  required: true,
};

const SURVEYS: { key: string; name: string; description: string; active?: boolean; questions: Q[] }[] = [
  {
    // Kept as "intake" so "Missing surveys" and the family page reminder keep working.
    key: "intake",
    name: "Story Garden: first visit",
    description: "Asked at a family's first visit.",
    questions: [
      booksInHome("Approximately how many books do you have in the home?", "¿Aproximadamente cuántos libros tiene en casa?"),
      READ_DAYS,
      ENJOYS_READING,
      {
        key: "heard_about",
        type: "multi_choice",
        prompt: {
          en: "How did you hear about Story Garden? (check all that apply)",
          es: "¿Cómo se enteró de Story Garden? (marque todas las que correspondan)",
        },
        choices: choices([
          ["school", "School", "Escuela"],
          ["social_media", "Social Media", "Redes sociales"],
          ["word_of_mouth", "Word of Mouth", "De boca en boca"],
          ["pediatrician", "Pediatrician", "Pediatra"],
          ["email", "Email", "Correo electrónico"],
          ["other", "Other", "Otro"],
        ]),
      },
      {
        key: "heard_about_other",
        type: "text",
        prompt: { en: "If other, how did you hear about us?", es: "Si eligió «Otro», ¿cómo se enteró?" },
      },
      { key: "why_visit", type: "text", prompt: { en: "Why did you decide to visit?", es: "¿Por qué decidió visitarnos?" } },
      {
        key: "other_resources",
        type: "text",
        prompt: {
          en: "How else can we help connect you to other resources in the community?",
          es: "¿De qué otra manera podemos ayudarle a conectarse con otros recursos de la comunidad?",
        },
      },
    ],
  },
  {
    key: "returning",
    name: "Story Garden: returning visitors",
    description: "For families who have visited before.",
    questions: [
      {
        key: "visit_rating",
        type: "scale",
        prompt: {
          en: "Over the last few months, rate your visits between 1–5 (1 = Not enjoyable, 5 = Enjoyable)",
          es: "En los últimos meses, califique sus visitas del 1 al 5 (1 = No fueron agradables, 5 = Fueron agradables)",
        },
        min: 1,
        max: 5,
        required: true,
      },
      booksInHome("Currently, how many books do you have in the home?", "Actualmente, ¿cuántos libros tiene en casa?"),
      READ_DAYS,
      ENJOYS_READING,
      {
        key: "ideas",
        type: "text",
        prompt: {
          en: "What else would you like to see at the Story Garden? It's okay to dream big, we want to hear all of your ideas!",
          es: "¿Qué más le gustaría ver en Story Garden? ¡Puede soñar en grande, queremos escuchar todas sus ideas!",
        },
      },
    ],
  },
  {
    // Replaced by "returning". Kept (closed) so its past answers stay in reports.
    key: "followup_6mo",
    name: "6-month follow-up (old)",
    description: "Replaced by Story Garden: returning visitors.",
    active: false,
    questions: [],
  },
];

await db
  .insert(languages)
  .values(LANGUAGES.map(([code, name]) => ({ code, name })))
  .onConflictDoUpdate({ target: languages.code, set: { name: sql`excluded.name` } });

// The old follow-up asked "child enjoys reading" on a 1–5 scale; the new surveys use 1–10 with the same
// key. Rename the old question so averages never mix the two scales.
await db.execute(sql`
  update survey_questions set key = 'child_enjoys_reading_1to5'
  where key = 'child_enjoys_reading' and max_value = 5
    and survey_id = (select id from surveys where key = 'followup_6mo')`);

for (const s of SURVEYS) {
  const active = s.active ?? true;
  const [survey] = await db
    .insert(surveys)
    .values({ key: s.key, name: s.name, description: s.description, active })
    .onConflictDoUpdate({ target: surveys.key, set: { name: s.name, description: s.description, active } })
    .returning();
  if (s.questions.length === 0) continue; // closed survey: leave its questions as they were
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
      retiredAt: null,
    };
    await db
      .insert(surveyQuestions)
      .values(values)
      .onConflictDoUpdate({ target: [surveyQuestions.surveyId, surveyQuestions.key], set: values });
  }
  // Questions no longer on the survey are retired: no longer asked, past answers kept.
  await db.execute(sql`
    update survey_questions set retired_at = now(), position = position + 1000
    where survey_id = ${survey.id} and retired_at is null
      and key <> all(${sql.raw(`array[${s.questions.map((q) => `'${q.key}'`).join(",")}]::text[]`)})`);
}

console.log(`seeded ${LANGUAGES.length} languages and ${SURVEYS.length} surveys`);
await pool.end();
