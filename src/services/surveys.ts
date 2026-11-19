// Surveys: any number of them, each a list of typed questions. Reports group answers by question key.
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { guardians, households, locations, questionType, surveyAnswers, surveyQuestions, surveyResponses, surveys } from "../db/schema.ts";
import { db } from "../api/db.ts";
import { HttpError, parse, pgCode } from "../api/errors.ts";
import type { Staff } from "../api/auth.ts";

type Question = typeof surveyQuestions.$inferSelect;

export async function list(includeInactive = false) {
  const all = await db.select().from(surveys).orderBy(asc(surveys.id));
  const qs = await db.select().from(surveyQuestions).where(isNull(surveyQuestions.retiredAt)).orderBy(asc(surveyQuestions.position));
  return all
    .filter((s) => includeInactive || s.active)
    .map((s) => ({
      ...s,
      questions: qs
        .filter((q) => q.surveyId === s.id)
        .map(({ id, key, type, prompt, choices, minValue, maxValue, required }) => ({ id, key, type, prompt, choices, minValue, maxValue, required })),
    }));
}

const localized = z.record(z.string().min(2).max(8), z.string().trim().min(1).max(500)).refine((p) => "en" in p, "needs an English (en) version");

const questionInput = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, digits and _ only"),
    type: z.enum(questionType.enumValues),
    prompt: localized,
    choices: z.array(z.object({ value: z.string().trim().min(1).max(100), label: localized })).max(50).optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    required: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    const isChoice = q.type === "single_choice" || q.type === "multi_choice";
    if (isChoice && !q.choices?.length) ctx.addIssue({ code: "custom", path: ["choices"], message: "choice questions need choices" });
    if (!isChoice && q.choices) ctx.addIssue({ code: "custom", path: ["choices"], message: "only choice questions have choices" });
    if (q.type === "scale" && (q.minValue == null || q.maxValue == null)) {
      ctx.addIssue({ code: "custom", path: ["minValue"], message: "scale questions need minValue and maxValue" });
    }
  });

const surveyInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  questions: z.array(questionInput).min(1).max(100),
});

export async function create(body: unknown) {
  const input = parse(surveyInput, body);
  if (new Set(input.questions.map((q) => q.key)).size !== input.questions.length) throw new HttpError(400, "Question keys must be unique");
  try {
    await db.transaction(async (tx) => {
      const [s] = await tx.insert(surveys).values({ key: input.key, name: input.name, description: input.description ?? null }).returning();
      await tx.insert(surveyQuestions).values(
        input.questions.map((q, i) => ({
          surveyId: s.id,
          key: q.key,
          position: i + 1,
          type: q.type,
          prompt: q.prompt,
          choices: q.choices ?? null,
          minValue: q.minValue ?? null,
          maxValue: q.maxValue ?? null,
          required: q.required,
        })),
      );
    });
  } catch (err) {
    if (pgCode(err) === "23505") throw new HttpError(409, `A survey with key "${input.key}" already exists`);
    throw err;
  }
  return (await list(true)).find((s) => s.key === input.key);
}

type Stored = { valueNumber?: number; valueBool?: boolean; valueText?: string; valueChoices?: string[] };

/** Check one answer against its question and return the column it's stored in. */
export function toStored(q: Pick<Question, "key" | "type" | "choices" | "minValue" | "maxValue">, value: unknown): Stored {
  const fail = (msg: string): never => {
    throw new HttpError(400, `${q.key}: ${msg}`);
  };
  const inRange = (n: number) => {
    if (q.minValue != null && n < q.minValue) fail(`must be at least ${q.minValue}`);
    if (q.maxValue != null && n > q.maxValue) fail(`must be at most ${q.maxValue}`);
  };
  const allowed = new Set((q.choices ?? []).map((c) => c.value));
  switch (q.type) {
    case "number":
    case "scale": {
      if (typeof value !== "number" || !Number.isFinite(value)) return fail("must be a number");
      if (q.type === "scale" && !Number.isInteger(value)) fail("must be a whole number");
      inRange(value);
      return { valueNumber: value };
    }
    case "boolean":
      if (typeof value !== "boolean") return fail("must be yes or no (true/false)");
      return { valueBool: value };
    case "single_choice":
      if (typeof value !== "string" || !allowed.has(value)) return fail(`must be one of: ${[...allowed].join(", ")}`);
      return { valueText: value };
    case "multi_choice": {
      if (!Array.isArray(value) || value.length === 0) return fail("pick at least one choice");
      const picked = [...new Set(value)];
      if (!picked.every((v) => typeof v === "string" && allowed.has(v))) fail(`choices must be from: ${[...allowed].join(", ")}`);
      return { valueChoices: picked as string[] };
    }
    case "text":
      if (typeof value !== "string" || !value.trim()) return fail("must be text");
      if (value.length > 4000) fail("is too long");
      return { valueText: value.trim() };
  }
}

const responseInput = z.object({
  householdId: z.uuid(),
  guardianId: z.uuid().optional().nullable(),
  locationId: z.number().int().positive(),
  // { question_key: answer }. Leave a question out (or null) to skip it.
  answers: z.record(z.string(), z.unknown()),
});

export async function respond(surveyKey: string, body: unknown, staff: Staff) {
  const input = parse(responseInput, body);
  const [survey] = await db.select().from(surveys).where(eq(surveys.key, surveyKey));
  if (!survey) throw new HttpError(404, `No survey "${surveyKey}"`);
  if (!survey.active) throw new HttpError(409, "This survey is closed");
  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(and(eq(surveyQuestions.surveyId, survey.id), isNull(surveyQuestions.retiredAt)));
  const byKey = new Map(questions.map((q) => [q.key, q]));

  const unknown = Object.keys(input.answers).filter((k) => !byKey.has(k));
  if (unknown.length) throw new HttpError(400, `Unknown question(s): ${unknown.join(", ")}`);
  const rows: (Stored & { questionId: number })[] = [];
  for (const q of questions) {
    const value = input.answers[q.key];
    if (value === undefined || value === null || value === "") {
      if (q.required) throw new HttpError(400, `${q.key}: an answer is required`);
      continue;
    }
    rows.push({ questionId: q.id, ...toStored(q, value) });
  }

  const [household] = await db.select({ id: households.id }).from(households).where(eq(households.id, input.householdId));
  if (!household) throw new HttpError(404, "Family not found");
  if (input.guardianId) {
    const [g] = await db.select({ householdId: guardians.householdId }).from(guardians).where(eq(guardians.id, input.guardianId));
    if (g?.householdId !== input.householdId) throw new HttpError(400, "That adult isn't part of this family");
  }
  const [loc] = await db.select().from(locations).where(eq(locations.id, input.locationId));
  if (!loc?.active) throw new HttpError(400, `Unknown or inactive location ${input.locationId}`);

  const responseId = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(surveyResponses)
      .values({ surveyId: survey.id, householdId: input.householdId, guardianId: input.guardianId ?? null, locationId: loc.id, createdBy: staff.userId })
      .returning();
    if (rows.length) await tx.insert(surveyAnswers).values(rows.map((a) => ({ responseId: r.id, ...a })));
    return r.id;
  });
  return { responseId, survey: survey.key, answered: rows.length };
}
