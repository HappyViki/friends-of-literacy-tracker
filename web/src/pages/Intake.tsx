// New family intake: adults, children, ZIP and home languages. Issues a library card.
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../auth";
import { useApp } from "../context";
import { LibraryCard } from "../LibraryCard";
import type { Family, FamilySummary } from "../types";
import { ErrorBox, Notice, familyName, fmtPhone, fullName, go, toApiError } from "../ui";

export const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "prefer_not_to_say"] as const;
const COMMON_LANGS = ["en", "es"];

type Adult = { firstName: string; lastName: string; email: string; phone: string; ageRange: string; preferredLanguage: string; contactConsent: boolean };
type Kid = { firstName: string; mode: "birth" | "age"; birthYear: string; birthMonth: string; age: string };

const blankAdult = (): Adult => ({ firstName: "", lastName: "", email: "", phone: "", ageRange: "", preferredLanguage: "", contactConsent: false });
const blankKid = (): Kid => ({ firstName: "", mode: "birth", birthYear: "", birthMonth: "", age: "" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Intake() {
  const { location, languages } = useApp();
  const [zip, setZip] = useState("");
  const [langs, setLangs] = useState<string[]>([]);
  const [adults, setAdults] = useState<Adult[]>([blankAdult()]);
  const [kids, setKids] = useState<Kid[]>([blankKid()]);
  const [error, setError] = useState<ApiError | null>(null);
  const [dupes, setDupes] = useState<FamilySummary[] | null>(null);
  const [created, setCreated] = useState<Family | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();

  const setAdult = (i: number, patch: Partial<Adult>) => setAdults((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setKid = (i: number, patch: Partial<Kid>) => setKids((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const toggleLang = (code: string) => setLangs((l) => (l.includes(code) ? l.filter((x) => x !== code) : [...l, code]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDupes(null);
    const missingContact = adults.findIndex((a) => !a.email.trim() && !a.phone.trim());
    if (missingContact >= 0) {
      setError(new ApiError(`Adult ${missingContact + 1} needs an email or a phone number so we can find the family next time.`, 400));
      return;
    }
    const body = {
      locationId: location.id,
      zipCode: zip.trim(),
      languages: langs,
      guardians: adults.map((a) => ({
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim() || null,
        email: a.email.trim() || null,
        phone: a.phone.trim() || null,
        ageRange: a.ageRange || null,
        preferredLanguage: a.preferredLanguage || null,
        contactConsent: a.contactConsent,
      })),
      children: kids
        .filter((k) => k.firstName.trim())
        .map((k) =>
          k.mode === "age"
            ? { firstName: k.firstName.trim(), age: k.age === "" ? null : Number(k.age) }
            : {
                firstName: k.firstName.trim(),
                birthYear: k.birthYear === "" ? null : Number(k.birthYear),
                birthMonth: k.birthMonth === "" ? null : Number(k.birthMonth),
              },
        ),
    };
    setBusy(true);
    try {
      setCreated(await api<Family>("/api/households", { json: body }));
      window.scrollTo(0, 0);
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.status === 409 && apiErr.details?.households) setDupes(apiErr.details.households);
      setError(apiErr);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="stack">
        <section className="card success-card">
          <Notice kind="ok">
            <b>Welcome, {familyName(created)} family!</b> Their library card is ready.
          </Notice>
          <div className="card-issued">
            <div>
              <p className="muted">Library card number</p>
              <p className="big-number">{created.cardNumber}</p>
              <p className="muted">Write it on the card or print one. Scanning it at any location finds this family.</p>
            </div>
            {created.cardNumber && <LibraryCard number={created.cardNumber} name={familyName(created)} location={location.name} />}
          </div>
        </section>
        <section className="card">
          <h2>Next steps</h2>
          <div className="actions">
            <a className="button primary" href={`#/family/${created.householdId}/survey/intake`}>
              📝 Take the intake survey
            </a>
            <a className="button secondary" href={`#/family/${created.householdId}/give`}>
              🎁 Give books
            </a>
            <a className="button ghost" href={`#/family/${created.householdId}`}>
              Open family page
            </a>
            <button
              className="ghost"
              onClick={() => {
                setCreated(null);
                setZip("");
                setLangs([]);
                setAdults([blankAdult()]);
                setKids([blankKid()]);
              }}
            >
              Sign up another family
            </button>
          </div>
        </section>
      </div>
    );
  }

  const otherLangs = languages.filter((l) => !COMMON_LANGS.includes(l.code));

  return (
    <form className="stack intake" onSubmit={submit}>
      <header className="page-head">
        <h1>🌼 New family</h1>
        <p className="muted">A little information helps us share a lot of stories! Signing up at {location.name}.</p>
      </header>

      <section className="card">
        <h2>💜 Parents & caregivers</h2>
        {adults.map((a, i) => (
          <fieldset key={i} className="sub">
            <legend>{i === 0 ? "Main contact" : `Adult ${i + 1}`}</legend>
            <div className="grid2">
              <div>
                <label htmlFor={`a${i}-first`}>First name</label>
                <input id={`a${i}-first`} value={a.firstName} onChange={(e) => setAdult(i, { firstName: e.target.value })} required autoFocus={i === 0} />
              </div>
              <div>
                <label htmlFor={`a${i}-last`}>
                  Last name <span className="opt">optional</span>
                </label>
                <input id={`a${i}-last`} value={a.lastName} onChange={(e) => setAdult(i, { lastName: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`a${i}-email`}>Email</label>
                <input id={`a${i}-email`} type="email" value={a.email} onChange={(e) => setAdult(i, { email: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <label htmlFor={`a${i}-phone`}>Phone</label>
                <input id={`a${i}-phone`} type="tel" value={a.phone} onChange={(e) => setAdult(i, { phone: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <label htmlFor={`a${i}-age`}>Age range</label>
                <select id={`a${i}-age`} value={a.ageRange} onChange={(e) => setAdult(i, { ageRange: e.target.value })}>
                  <option value="">—</option>
                  {AGE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r === "prefer_not_to_say" ? "Prefer not to say" : r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`a${i}-lang`}>Preferred language</label>
                <select id={`a${i}-lang`} value={a.preferredLanguage} onChange={(e) => setAdult(i, { preferredLanguage: e.target.value })}>
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
              <input type="checkbox" checked={a.contactConsent} onChange={(e) => setAdult(i, { contactConsent: e.target.checked })} /> OK to contact
              about events and new books
            </label>
            {adults.length > 1 && (
              <button type="button" className="remove" onClick={() => setAdults((x) => x.filter((_, j) => j !== i))}>
                Remove adult
              </button>
            )}
          </fieldset>
        ))}
        {adults.length < 4 && (
          <button type="button" className="add" onClick={() => setAdults((x) => [...x, blankAdult()])}>
            + Add another adult
          </button>
        )}
      </section>

      <section className="card">
        <h2>🧸 Little readers</h2>
        {kids.map((k, i) => (
          <fieldset key={i} className="child">
            <legend>🌼 Child {i + 1}</legend>
            <label htmlFor={`k${i}-first`}>First name</label>
            <input id={`k${i}-first`} value={k.firstName} onChange={(e) => setKid(i, { firstName: e.target.value })} />
            <div className="segmented" role="radiogroup" aria-label="Birthday or age">
              <button type="button" role="radio" aria-checked={k.mode === "birth"} className={k.mode === "birth" ? "on" : ""} onClick={() => setKid(i, { mode: "birth" })}>
                Birth year & month
              </button>
              <button type="button" role="radio" aria-checked={k.mode === "age"} className={k.mode === "age" ? "on" : ""} onClick={() => setKid(i, { mode: "age" })}>
                Just their age
              </button>
            </div>
            {k.mode === "birth" ? (
              <div className="grid2">
                <div>
                  <label htmlFor={`k${i}-year`}>Birth year</label>
                  <input
                    id={`k${i}-year`}
                    type="number"
                    inputMode="numeric"
                    min={year - 25}
                    max={year}
                    value={k.birthYear}
                    onChange={(e) => setKid(i, { birthYear: e.target.value })}
                    placeholder={String(year - 4)}
                  />
                </div>
                <div>
                  <label htmlFor={`k${i}-month`}>
                    Month <span className="opt">optional</span>
                  </label>
                  <select id={`k${i}-month`} value={k.birthMonth} onChange={(e) => setKid(i, { birthMonth: e.target.value })}>
                    <option value="">—</option>
                    {MONTHS.map((m, n) => (
                      <option key={m} value={n + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                <label htmlFor={`k${i}-age`}>Age</label>
                <input id={`k${i}-age`} type="number" inputMode="numeric" min={0} max={25} value={k.age} onChange={(e) => setKid(i, { age: e.target.value })} />
              </>
            )}
            {kids.length > 1 && (
              <button type="button" className="remove" onClick={() => setKids((x) => x.filter((_, j) => j !== i))}>
                Remove child
              </button>
            )}
          </fieldset>
        ))}
        <button type="button" className="add" onClick={() => setKids((x) => [...x, blankKid()])}>
          + Add another child
        </button>
      </section>

      <section className="card">
        <h2>🏡 Household</h2>
        <label htmlFor="zip">ZIP code</label>
        <input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" pattern="\d{5}(-\d{4})?" required className="short" />
        <label>Languages spoken at home</label>
        <div className="chips">
          {COMMON_LANGS.map((code) => (
            <button type="button" key={code} className={`chip ${langs.includes(code) ? "on" : ""}`} aria-pressed={langs.includes(code)} onClick={() => toggleLang(code)}>
              {languages.find((l) => l.code === code)?.name ?? code}
            </button>
          ))}
          {langs
            .filter((c) => !COMMON_LANGS.includes(c))
            .map((code) => (
              <button type="button" key={code} className="chip on" aria-pressed onClick={() => toggleLang(code)}>
                {languages.find((l) => l.code === code)?.name ?? code} ✕
              </button>
            ))}
          <select aria-label="Add another language" value="" onChange={(e) => e.target.value && toggleLang(e.target.value)} className="chip-select">
            <option value="">+ Other language…</option>
            {otherLangs
              .filter((l) => !langs.includes(l.code))
              .map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
          </select>
        </div>
        <p className="hint">Each adult's preferred language is added automatically.</p>
      </section>

      {error && (
        <section className="card">
          <ErrorBox error={error} />
          {dupes && (
            <>
              <p>Someone in this family already has a library card. Open their page instead of signing them up again:</p>
              <ul className="results">
                {dupes.map((f) => (
                  <li key={f.householdId}>
                    <button type="button" className="result" onClick={() => go(`/family/${f.householdId}`)}>
                      <div className="result-main">
                        <b>{f.guardians.map(fullName).join(" & ")}</b>
                        <span className="muted small">
                          {[f.guardians[0]?.email, fmtPhone(f.guardians[0]?.phone ?? null)].filter(Boolean).join(" · ")} · ZIP {f.zipCode}
                        </span>
                      </div>
                      <span className="card-number">{f.cardNumber ?? "no active card"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <button className="submit" disabled={busy}>
        {busy ? "Signing up…" : "Sign up family & issue card 💌"}
      </button>
    </form>
  );
}
