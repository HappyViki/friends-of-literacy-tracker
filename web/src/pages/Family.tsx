// One family: adults, children, cards, books received, giveaways and survey answers.
import { useState, type FormEvent } from "react";
import { api } from "../auth";
import { languageName, useApp } from "../context";
import { LibraryCard } from "../LibraryCard";
import type { Family, Survey } from "../types";
import { AGE_RANGES } from "./Intake";
import { ErrorBox, Loading, Notice, familyName, fmtDate, fmtDateTime, fmtPhone, fullName, plural, toApiError, useAsync } from "../ui";

const MAX_ADULTS = 4;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function FamilyPage({ householdId }: { householdId: string }) {
  const { languages } = useApp();
  const fam = useAsync(() => api<Family>(`/api/households/${householdId}`), [householdId]);
  const surveys = useAsync(() => api<Survey[]>("/api/surveys"), []);
  const [showCard, setShowCard] = useState(false);

  if (fam.loading && !fam.data) return <Loading label="Loading family…" />;
  if (fam.error && !fam.data) return <ErrorBox error={fam.error} onRetry={fam.reload} />;
  const f = fam.data!;
  const taken = new Set(f.surveyResponses.map((r) => r.survey));

  return (
    <div className="stack">
      <section className="card family-head">
        <div>
          <p className="eyebrow">Family</p>
          <h1>{f.guardians.map(fullName).join(" & ")}</h1>
          <p className="muted">
            Signed up {fmtDate(f.signedUpAt)} at {f.signedUpAtLocation} · ZIP {f.zipCode}
            {f.languages.length > 0 && <> · Speaks {f.languages.map((c) => languageName(languages, c)).join(", ")}</>}
          </p>
        </div>
        <div className="head-card">
          <p className="muted small">Library card</p>
          <button className="card-number big" onClick={() => setShowCard((s) => !s)} title="Show printable card">
            {f.cardNumber ?? "No active card"}
          </button>
          <p className="muted small">{plural(f.booksReceived, "book")} received</p>
        </div>
      </section>
      {showCard && f.cardNumber && (
        <section className="card">
          <LibraryCard number={f.cardNumber} name={familyName(f)} />
        </section>
      )}

      {f.surveyDue && (
        <Notice kind="warn">
          <b>{f.surveyDue.survey === "intake" ? "First-visit survey not done yet." : "Returning-visitors survey is due."}</b>{" "}
          {f.surveyDue.survey === "returning" && <>{f.surveyDue.reason}. </>}
          <a href={`#/family/${f.householdId}/survey/${f.surveyDue.survey}`}>Ask it now</a> — it only takes a minute.
        </Notice>
      )}

      <div className="actions sticky-actions">
        <a className="button primary" href={`#/family/${f.householdId}/give`}>
          🎁 Give books
        </a>
        {f.surveyDue && (
          <a className="button primary" href={`#/family/${f.householdId}/survey/${f.surveyDue.survey}`}>
            📝 {f.surveyDue.name}
          </a>
        )}
        {(surveys.data ?? [])
          .filter((s) => s.key !== f.surveyDue?.survey)
          .map((s) => (
            <a key={s.key} className="button secondary" href={`#/family/${f.householdId}/survey/${s.key}`}>
              📝 {s.name}
              {taken.has(s.key) ? " (again)" : ""}
            </a>
          ))}
      </div>

      <div className="two-col">
        <section className="card">
          <h2>💜 Adults</h2>
          <ul className="plain">
            {f.guardians.map((g) => (
              <li key={g.id} className="person">
                <b>{fullName(g)}</b>
                <span className="muted small">
                  {[g.email, fmtPhone(g.phone)].filter(Boolean).join(" · ")}
                  {g.ageRange && ` · ${g.ageRange === "prefer_not_to_say" ? "age not given" : `age ${g.ageRange}`}`}
                  {g.preferredLanguage && ` · prefers ${languageName(languages, g.preferredLanguage)}`}
                  {g.contactConsent && " · OK to contact"}
                </span>
              </li>
            ))}
          </ul>
          {f.guardians.length < MAX_ADULTS ? (
            <AddAdult householdId={f.householdId} onDone={fam.set} />
          ) : (
            <p className="muted small">This family has the most adults allowed ({MAX_ADULTS}).</p>
          )}
        </section>

        <section className="card">
          <h2>🧸 Children</h2>
          {f.children.length === 0 && <p className="muted">No children listed yet.</p>}
          <ul className="plain">
            {f.children.map((c) => {
              const n = f.giveaways.flatMap((g) => g.books).filter((b) => b.forChild === c.firstName).reduce((s, b) => s + b.quantity, 0);
              return (
                <li key={c.id} className="person">
                  <b>{c.firstName}</b>
                  <span className="muted small">
                    {c.age != null ? `${c.birthYearEstimated ? "about " : ""}${c.age} ${c.age === 1 ? "yr" : "yrs"}` : "age unknown"}
                    {c.ageBracket && ` · ages ${c.ageBracket}`}
                    {c.birthYear && ` · born ${c.birthMonth ? MONTHS[c.birthMonth - 1] + " " : ""}${c.birthYear}${c.birthYearEstimated ? " (est.)" : ""}`}
                    {` · ${plural(n, "book")}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <AddChild householdId={f.householdId} onDone={fam.set} />
        </section>
      </div>

      <section className="card">
        <h2>🎁 Books received</h2>
        {f.giveaways.length === 0 ? (
          <p className="muted">No books yet. Give the first ones!</p>
        ) : (
          <ol className="timeline">
            {f.giveaways.map((g) => (
              <li key={g.distributionId}>
                <p className="tl-head">
                  <b>{fmtDateTime(g.distributedAt)}</b> <span className="muted">at {g.location}</span>
                </p>
                <ul className="book-list">
                  {g.books.map((b, i) => (
                    <li key={i}>
                      <a href={`#/books/scan/${b.isbn}`}>{b.title}</a>
                      <span className="muted small">
                        {" "}
                        · {[b.readingLevel, b.language, b.category].filter(Boolean).join(" · ")} · {b.condition}
                        {b.quantity > 1 && ` ×${b.quantity}`}
                        {b.forChild && ` · for ${b.forChild}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>📝 Surveys</h2>
        {f.surveyResponses.length === 0 ? (
          <p className="muted">No surveys yet.</p>
        ) : (
          <div className="survey-answers">
            {f.surveyResponses.map((r) => {
              const s = surveys.data?.find((x) => x.key === r.survey);
              return (
                <div key={r.responseId} className="sub">
                  <p className="tl-head">
                    <b>{r.surveyName}</b> <span className="muted">· {fmtDate(r.submittedAt)}</span>
                  </p>
                  <dl>
                    {Object.entries(r.answers).map(([k, v]) => {
                      const q = s?.questions.find((x) => x.key === k);
                      return (
                        <div key={k}>
                          <dt>{q?.prompt.en ?? k.replaceAll("_", " ")}</dt>
                          <dd>{formatAnswer(v, q?.choices ?? null)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>🪪 Library cards</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Status</th>
              <th>Issued</th>
            </tr>
          </thead>
          <tbody>
            {f.cards.map((c) => (
              <tr key={c.number}>
                <td className="mono">{c.number}</td>
                <td>
                  <span className={`status ${c.status}`}>{c.status}</span>
                </td>
                <td>
                  {fmtDate(c.issuedAt)} at {c.issuedAtLocation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ReplaceCard householdId={f.householdId} onDone={fam.set} />
      </section>
    </div>
  );
}

function formatAnswer(v: unknown, choices: { value: string; label: Record<string, string> }[] | null) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const label = (x: unknown) => choices?.find((c) => c.value === x)?.label.en ?? String(x);
  if (Array.isArray(v)) return v.map(label).join(", ");
  return label(v);
}

function AddChild({ householdId, onDone }: { householdId: string; onDone: (f: Family) => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [age, setAge] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        birthYear !== ""
          ? { firstName, birthYear: Number(birthYear), birthMonth: birthMonth ? Number(birthMonth) : null }
          : { firstName, age: age === "" ? null : Number(age) };
      onDone(await api<Family>(`/api/households/${householdId}/children`, { json: body }));
      setOpen(false);
      setFirstName("");
      setBirthYear("");
      setBirthMonth("");
      setAge("");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button className="add" onClick={() => setOpen(true)}>
        + Add a child
      </button>
    );
  return (
    <form className="child" onSubmit={submit}>
      <label htmlFor="nc-first">First name</label>
      <input id="nc-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
      <div className="grid3">
        <div>
          <label htmlFor="nc-year">Birth year</label>
          <input id="nc-year" type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nc-month">Month</label>
          <select id="nc-month" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)}>
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nc-age">…or age</label>
          <input id="nc-age" type="number" inputMode="numeric" min={0} max={25} value={age} onChange={(e) => setAge(e.target.value)} disabled={birthYear !== ""} />
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Adding…" : "Add child"}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReplaceCard({ householdId, onDone }: { householdId: string; onDone: (f: Family) => void }) {
  const { location } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"lost" | "replaced">("lost");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const f = await api<Family>(`/api/households/${householdId}/cards`, { json: { locationId: location.id, reason } });
      onDone(f);
      setDone(f.cardNumber);
      setOpen(false);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="replace">
      {done && <Notice kind="ok">New card issued: <b className="mono">{done}</b>. The old number still finds this family, with a warning.</Notice>}
      {!open ? (
        <button className="secondary" onClick={() => setOpen(true)}>
          Replace a lost card
        </button>
      ) : (
        <div className="sub">
          <p>The current card stops working for giveaways and a new number is issued at {location.name}.</p>
          <div className="segmented" role="radiogroup" aria-label="Why">
            <button type="button" role="radio" aria-checked={reason === "lost"} className={reason === "lost" ? "on" : ""} onClick={() => setReason("lost")}>
              Lost
            </button>
            <button type="button" role="radio" aria-checked={reason === "replaced"} className={reason === "replaced" ? "on" : ""} onClick={() => setReason("replaced")}>
              Damaged / replaced
            </button>
          </div>
          <ErrorBox error={error} />
          <div className="actions">
            <button className="primary" onClick={submit} disabled={busy}>
              {busy ? "Issuing…" : "Issue new card"}
            </button>
            <button className="ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddAdult({ householdId, onDone }: { householdId: string; onDone: (f: Family) => void }) {
  const { languages } = useApp();
  const blank = { firstName: "", lastName: "", email: "", phone: "", ageRange: "", preferredLanguage: "", contactConsent: false };
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(blank);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof blank>) => setA((x) => ({ ...x, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!a.email.trim() && !a.phone.trim()) return setError(new Error("Add an email or a phone number (either is fine)."));
    setBusy(true);
    setError(null);
    try {
      const fam = await api<Family>(`/api/households/${householdId}/guardians`, {
        json: {
          firstName: a.firstName,
          lastName: a.lastName || null,
          email: a.email || null,
          phone: a.phone || null,
          ageRange: a.ageRange || null,
          preferredLanguage: a.preferredLanguage || null,
          contactConsent: a.contactConsent,
        },
      });
      onDone(fam);
      setA(blank);
      setOpen(false);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button className="add" onClick={() => setOpen(true)}>
        + Add an adult
      </button>
    );
  return (
    <form className="child" onSubmit={submit}>
      <div className="grid2">
        <div>
          <label htmlFor="na-first">First name</label>
          <input id="na-first" value={a.firstName} onChange={(e) => set({ firstName: e.target.value })} required autoFocus />
        </div>
        <div>
          <label htmlFor="na-last">
            Last name <span className="opt">optional</span>
          </label>
          <input id="na-last" value={a.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </div>
        <div>
          <label htmlFor="na-email">Email</label>
          <input id="na-email" type="email" value={a.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="na-phone">Phone</label>
          <input id="na-phone" type="tel" value={a.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="na-age">Age range</label>
          <select id="na-age" value={a.ageRange} onChange={(e) => set({ ageRange: e.target.value })}>
            <option value="">—</option>
            {AGE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r === "prefer_not_to_say" ? "Prefer not to say" : r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="na-lang">Preferred language</label>
          <select id="na-lang" value={a.preferredLanguage} onChange={(e) => set({ preferredLanguage: e.target.value })}>
            <option value="">—</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint">An email or a phone number is required (either is fine).</p>
      <label className="check">
        <input type="checkbox" checked={a.contactConsent} onChange={(e) => set({ contactConsent: e.target.checked })} /> OK to contact about
        events and new books
      </label>
      <ErrorBox error={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Adding…" : "Add adult"}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
