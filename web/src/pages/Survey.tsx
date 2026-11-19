// Take any survey with a family, rendered from its typed questions, in English or Spanish.
import { useState, type FormEvent } from "react";
import { api } from "../auth";
import { useApp } from "../context";
import type { Family, Question, Survey } from "../types";
import { ErrorBox, Loading, Notice, familyName, fullName, go, toApiError, useAsync } from "../ui";

type Lang = "en" | "es";
const UI = {
  en: { yes: "Yes", no: "No", required: "required", submit: "Save answers", who: "Who is answering?", skip: "Leave blank to skip" },
  es: { yes: "Sí", no: "No", required: "obligatoria", submit: "Guardar respuestas", who: "¿Quién responde?", skip: "Déjelo en blanco para omitir" },
};
const t = (text: Record<string, string>, lang: Lang) => text[lang] ?? text.en;

export function TakeSurvey({ householdId, surveyKey }: { householdId: string; surveyKey?: string }) {
  const fam = useAsync(() => api<Family>(`/api/households/${householdId}`), [householdId]);
  const surveys = useAsync(() => api<Survey[]>("/api/surveys"), []);

  if ((fam.loading && !fam.data) || (surveys.loading && !surveys.data)) return <Loading />;
  if (fam.error) return <ErrorBox error={fam.error} onRetry={fam.reload} />;
  if (surveys.error) return <ErrorBox error={surveys.error} onRetry={surveys.reload} />;
  const survey = surveys.data!.find((s) => s.key === surveyKey);
  if (!survey) {
    return (
      <section className="card">
        <h1>Choose a survey</h1>
        <div className="actions">
          {surveys.data!.map((s) => (
            <a key={s.key} className="button secondary" href={`#/family/${householdId}/survey/${s.key}`}>
              {s.name}
            </a>
          ))}
        </div>
      </section>
    );
  }
  return <SurveyForm family={fam.data!} survey={survey} />;
}

function SurveyForm({ family, survey }: { family: Family; survey: Survey }) {
  const { location } = useApp();
  const prefersSpanish = family.guardians[0]?.preferredLanguage === "es" || (family.languages.includes("es") && !family.languages.includes("en"));
  const [lang, setLang] = useState<Lang>(prefersSpanish ? "es" : "en");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [guardianId, setGuardianId] = useState(family.guardians[0]?.id ?? "");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  // A "<key>_other" text question follows a choice question <key> and only matters when "other" is picked.
  const visible = survey.questions.filter((q) => {
    const parent = q.key.endsWith("_other") ? survey.questions.find((p) => p.key === q.key.slice(0, -"_other".length)) : undefined;
    if (!parent) return true;
    const v = answers[parent.key];
    return Array.isArray(v) ? v.includes("other") : v === "other";
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Drop answers to follow-ups that are hidden again (e.g. "other" was unticked).
      const shown = new Set(visible.map((q) => q.key));
      const sent = Object.fromEntries(Object.entries(answers).filter(([k]) => shown.has(k)));
      const r = await api<{ answered: number }>(`/api/surveys/${survey.key}/responses`, {
        json: { householdId: family.householdId, guardianId: guardianId || null, locationId: location.id, answers: sent },
      });
      setSaved(r.answered);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (saved != null) {
    return (
      <section className="card success-card">
        <Notice kind="ok">
          <b>Thank you!</b> {saved} answers saved for the {familyName(family)} family.
        </Notice>
        <div className="actions">
          <a className="button primary" href={`#/family/${family.householdId}/give`}>
            🎁 Give books
          </a>
          <button className="secondary" onClick={() => go(`/family/${family.householdId}`)}>
            Back to family
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <header className="page-head row spread wrap">
        <div>
          <p className="eyebrow">
            <a href={`#/family/${family.householdId}`}>← {familyName(family)} family</a>
          </p>
          <h1>📝 {survey.name}</h1>
          {survey.description && <p className="muted">{survey.description}</p>}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Survey language">
          <button type="button" role="radio" aria-checked={lang === "en"} className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
            English
          </button>
          <button type="button" role="radio" aria-checked={lang === "es"} className={lang === "es" ? "on" : ""} onClick={() => setLang("es")}>
            Español
          </button>
        </div>
      </header>
      <section className="card" lang={lang}>
        {family.guardians.length > 1 && (
          <>
            <label htmlFor="who">{UI[lang].who}</label>
            <select id="who" value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
              {family.guardians.map((g) => (
                <option key={g.id} value={g.id}>
                  {fullName(g)}
                </option>
              ))}
            </select>
          </>
        )}
        {visible.map((q, i) => (
          <QuestionField key={q.key} n={i + 1} q={q} lang={lang} value={answers[q.key]} onChange={(v) => set(q.key, v)} />
        ))}
        <ErrorBox error={error} />
        <button className="submit" disabled={busy}>
          {busy ? "…" : UI[lang].submit}
        </button>
      </section>
    </form>
  );
}

function QuestionField({ n, q, lang, value, onChange }: { n: number; q: Question; lang: Lang; value: unknown; onChange: (v: unknown) => void }) {
  const id = `q-${q.key}`;
  const label = (
    <span>
      {n}. {t(q.prompt, lang)} {q.required && <span className="req">({UI[lang].required})</span>}
    </span>
  );
  switch (q.type) {
    case "number":
      return (
        <div className="question">
          <label htmlFor={id}>{label}</label>
          {q.minValue != null && q.maxValue != null && q.maxValue - q.minValue <= 10 ? (
            <div className="pills" role="radiogroup" aria-labelledby={id}>
              <span id={id} hidden>
                {t(q.prompt, lang)}
              </span>
              {range(q.minValue, q.maxValue).map((v) => (
                <button type="button" key={v} role="radio" aria-checked={value === v} className={`pill ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              className="short"
              min={q.minValue ?? undefined}
              max={q.maxValue ?? undefined}
              value={value == null ? "" : String(value)}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              required={q.required}
            />
          )}
        </div>
      );
    case "scale":
      return (
        <fieldset className="question">
          <legend>{label}</legend>
          <div className="pills" role="radiogroup">
            {range(q.minValue ?? 1, q.maxValue ?? 5).map((v) => (
              <button type="button" key={v} role="radio" aria-checked={value === v} className={`pill ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
                {v}
              </button>
            ))}
          </div>
        </fieldset>
      );
    case "boolean":
      return (
        <fieldset className="question">
          <legend>{label}</legend>
          <div className="pills" role="radiogroup">
            {[true, false].map((v) => (
              <button type="button" key={String(v)} role="radio" aria-checked={value === v} className={`pill wide ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
                {v ? UI[lang].yes : UI[lang].no}
              </button>
            ))}
          </div>
        </fieldset>
      );
    case "single_choice":
      return (
        <fieldset className="question">
          <legend>{label}</legend>
          <div className="pills" role="radiogroup">
            {(q.choices ?? []).map((c) => (
              <button type="button" key={c.value} role="radio" aria-checked={value === c.value} className={`pill wide ${value === c.value ? "on" : ""}`} onClick={() => onChange(c.value)}>
                {t(c.label, lang)}
              </button>
            ))}
          </div>
        </fieldset>
      );
    case "multi_choice": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="question">
          <legend>{label}</legend>
          <div className="pills">
            {(q.choices ?? []).map((c) => {
              const on = picked.includes(c.value);
              return (
                <button
                  type="button"
                  key={c.value}
                  aria-pressed={on}
                  className={`pill wide ${on ? "on" : ""}`}
                  onClick={() => {
                    const next = on ? picked.filter((x) => x !== c.value) : [...picked, c.value];
                    onChange(next.length ? next : null);
                  }}
                >
                  {t(c.label, lang)}
                </button>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case "text":
      return (
        <div className="question">
          <label htmlFor={id}>{label}</label>
          <textarea id={id} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder={UI[lang].skip} />
        </div>
      );
  }
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
