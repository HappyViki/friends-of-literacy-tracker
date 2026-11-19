// Find a returning family by scanned/typed card, email, phone or name.
import { useState } from "react";
import { api } from "../auth";
import type { ApiError } from "../auth";
import type { SearchResult } from "../types";
import { ErrorBox, Notice, ScanField, fmtPhone, fullName, go, plural, toApiError } from "../ui";

const MATCHED: Record<SearchResult["matchedBy"], string> = {
  card: "card number",
  email: "email",
  phone: "phone number",
  name: "name",
};

export function FrontDesk() {
  const [query, setQuery] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(q: string) {
    setBusy(true);
    setError(null);
    setQuery(q);
    try {
      const r = await api<SearchResult>(`/api/households/search?q=${encodeURIComponent(q)}`);
      setResult(r);
      // A scanned, active card with one match goes straight to the family.
      if (r.matchedBy === "card" && r.results.length === 1 && r.cardStatus === "active") go(`/family/${r.results[0].householdId}`);
    } catch (e) {
      setResult(null);
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card hero-card">
        <h1>Front desk</h1>
        <p className="muted">Scan a library card, or type a card number, email, phone number or name.</p>
        <ScanField
          label="Find a family"
          placeholder="e.g. MID-004217-3, maria@example.com, (512) 555-0123, Lopez"
          onScan={search}
          busy={busy}
          formats={["code_128", "qr_code"]}
        />
        <ErrorBox error={error} />
        {error?.status === 400 && /check digit/i.test(error.message) && (
          <p className="hint">Card numbers end in a check digit, so one wrong digit is caught. Re-scan the card or compare it carefully.</p>
        )}
      </section>

      {result && (
        <section className="card">
          {result.cardStatus && result.cardStatus !== "active" && (
            <Notice kind="warn">
              <b>This card was marked {result.cardStatus}.</b> It still finds the family, but use their current card for giveaways. If
              someone else has this card, check their ID before continuing.
            </Notice>
          )}
          <h2>
            {result.results.length === 0
              ? `No family found for “${query}”`
              : `${plural(result.results.length, "family", "families")} matched by ${MATCHED[result.matchedBy]}`}
          </h2>
          {result.results.length === 0 ? (
            <div className="empty">
              <p>Check the spelling, try a phone number or email, or sign them up.</p>
              <a className="button primary" href={`#/intake`}>
                🌼 Sign up a new family
              </a>
            </div>
          ) : (
            <ul className="results">
              {result.results.map((f) => (
                <li key={f.householdId}>
                  <a className="result" href={`#/family/${f.householdId}`}>
                    <div className="result-main">
                      <b>{f.guardians.map(fullName).join(" & ") || "Family"}</b>
                      <span className="muted">
                        {f.children.length ? `Kids: ${f.children.join(", ")}` : "No children listed"} · ZIP {f.zipCode}
                      </span>
                      <span className="muted small">
                        {[f.guardians[0]?.email, fmtPhone(f.guardians[0]?.phone ?? null)].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <span className="result-side">
                      <span className="card-number">{f.cardNumber ?? "no active card"}</span>
                      {f.surveyDue && (
                        <span className="badge warn" title={f.surveyDue.reason}>
                          📝 {f.surveyDue.survey === "intake" ? "First-visit survey" : "Survey due"}
                        </span>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="quick-grid">
        <a className="quick" href="#/intake">
          <span aria-hidden>🌼</span>
          <b>New family</b>
          <span className="muted">Sign up and print a card</span>
        </a>
        <a className="quick" href="#/books">
          <span aria-hidden>📖</span>
          <b>Scan a book</b>
          <span className="muted">Details, stock and history</span>
        </a>
        <a className="quick" href="#/books/receive">
          <span aria-hidden>📦</span>
          <b>Add books</b>
          <span className="muted">Donations and purchases</span>
        </a>
        <a className="quick" href="#/reports">
          <span aria-hidden>📊</span>
          <b>Reports</b>
          <span className="muted">How the program is doing</span>
        </a>
      </section>
    </div>
  );
}
