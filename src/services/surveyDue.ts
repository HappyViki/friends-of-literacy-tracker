// Which survey a family should be asked next, so staff don't over- or under-survey:
//   - "intake" (Story Garden: first visit) until they've answered it;
//   - then "returning" (returning visitors) once their latest survey is older than
//     RETURNING_SURVEY_EVERY_DAYS (default 90: the question asks about "the last few months").
import { pool } from "../api/db.ts";

export const RETURNING_EVERY_DAYS = Math.max(1, Number(process.env.RETURNING_SURVEY_EVERY_DAYS) || 90);

export type SurveyDue = {
  survey: "intake" | "returning";
  name: string;
  reason: string;
  lastSurveyAt: string | null;
} | null;

type Row = { id: string; intake_at: Date | null; last_at: Date | null; intake_name: string | null; returning_name: string | null; returning_active: boolean | null };

export async function surveyDueFor(householdIds: string[]): Promise<Map<string, SurveyDue>> {
  const out = new Map<string, SurveyDue>();
  if (householdIds.length === 0) return out;
  const { rows } = await pool.query<Row>(
    `select h.id,
            max(r.submitted_at) filter (where s.key = 'intake') as intake_at,
            max(r.submitted_at) filter (where s.key in ('intake', 'returning')) as last_at,
            (select name from surveys where key = 'intake' and active) as intake_name,
            (select name from surveys where key = 'returning') as returning_name,
            (select active from surveys where key = 'returning') as returning_active
     from households h
     left join survey_responses r on r.household_id = h.id
     left join surveys s on s.id = r.survey_id
     where h.id = any($1::uuid[])
     group by h.id`,
    [householdIds],
  );
  const cutoff = Date.now() - RETURNING_EVERY_DAYS * 86_400_000;
  for (const r of rows) {
    if (!r.intake_at) {
      out.set(r.id, r.intake_name ? { survey: "intake", name: r.intake_name, reason: "No first-visit survey yet", lastSurveyAt: null } : null);
    } else if (r.returning_active && r.last_at && r.last_at.getTime() < cutoff) {
      const months = Math.max(1, Math.round((Date.now() - r.last_at.getTime()) / (30 * 86_400_000)));
      out.set(r.id, {
        survey: "returning",
        name: r.returning_name ?? "Returning visitors",
        reason: `Last survey was about ${months} month${months === 1 ? "" : "s"} ago`,
        lastSurveyAt: r.last_at.toISOString(),
      });
    } else {
      out.set(r.id, null);
    }
  }
  return out;
}
