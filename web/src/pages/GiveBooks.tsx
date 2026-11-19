// Give books: scan ISBNs into a basket, pick new/used and the child, then confirm.
import { useState } from "react";
import { api, ApiError } from "../auth";
import { useApp } from "../context";
import type { BookScan, Family } from "../types";
import { ErrorBox, Loading, Notice, ScanField, familyName, plural, toApiError, useAsync } from "../ui";

type Line = { key: number; scan: BookScan; condition: "new" | "used"; childId: string; quantity: number };
type Shortage = { isbn: string; condition: "new" | "used"; quantity: number; onHand: number };

let nextKey = 1;

export function GiveBooks({ householdId }: { householdId: string }) {
  const { location } = useApp();
  const fam = useAsync(() => api<Family>(`/api/households/${householdId}`), [householdId]);
  const [lines, setLines] = useState<Line[]>([]);
  const [scanError, setScanError] = useState<ApiError | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ count: number; family: Family } | null>(null);
  const [lastChild, setLastChild] = useState("");

  const onHandHere = (s: BookScan, c: "new" | "used") => s.stock.find((x) => x.locationId === location.id && x.condition === c)?.onHand ?? 0;

  async function scan(isbn: string) {
    setScanError(null);
    setScanning(true);
    try {
      const s = await api<BookScan>(`/api/books/${encodeURIComponent(isbn)}`);
      const inBasket = (c: "new" | "used") => lines.filter((l) => l.scan.book.isbn === s.book.isbn && l.condition === c).reduce((n, l) => n + l.quantity, 0);
      const newLeft = onHandHere(s, "new") - inBasket("new");
      const usedLeft = onHandHere(s, "used") - inBasket("used");
      const condition = usedLeft > 0 ? "used" : newLeft > 0 ? "new" : "used";
      // Default to the child picked last, or the only child.
      const kids = fam.data?.children ?? [];
      const childId = kids.length === 1 ? kids[0].id : lastChild;
      setLines((ls) => [...ls, { key: nextKey++, scan: s, condition, childId, quantity: 1 }]);
      if (newLeft <= 0 && usedLeft <= 0) {
        setScanError(new ApiError(`“${s.book.title}” has no copies left at ${location.code}. Add it to inventory first, or remove it from the basket.`, 409));
      }
    } catch (e) {
      const err = toApiError(e);
      setScanError(
        err.code === "isbn_not_found" ? new ApiError("We don't know this ISBN yet, so it can't be in stock here. Add it under Books → Add books first.", 404) : err,
      );
    } finally {
      setScanning(false);
    }
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function confirm() {
    setBusy(true);
    setSubmitError(null);
    setShortages([]);
    try {
      const r = await api<{ distributionId: number; household: Family }>("/api/giveaways", {
        json: {
          householdId,
          locationId: location.id,
          items: lines.map((l) => ({ isbn: l.scan.book.isbn, condition: l.condition, quantity: l.quantity, childId: l.childId || null })),
        },
      });
      setDone({ count: lines.reduce((n, l) => n + l.quantity, 0), family: r.household });
      setLines([]);
    } catch (e) {
      const err = toApiError(e);
      setSubmitError(err);
      if (err.status === 409 && err.details?.shortages) setShortages(err.details.shortages);
    } finally {
      setBusy(false);
    }
  }

  if (fam.loading && !fam.data) return <Loading label="Loading family…" />;
  if (fam.error && !fam.data) return <ErrorBox error={fam.error} onRetry={fam.reload} />;
  const f = fam.data!;
  const total = lines.reduce((n, l) => n + l.quantity, 0);

  if (done) {
    return (
      <section className="card success-card">
        <Notice kind="ok">
          <b>
            {plural(done.count, "book")} given to the {familyName(done.family)} family.
          </b>{" "}
          They've received {plural(done.family.booksReceived, "book")} in all. Happy reading! 📚
        </Notice>
        <div className="actions">
          <button className="primary" onClick={() => setDone(null)}>
            Give more books
          </button>
          <a className="button secondary" href={`#/family/${householdId}`}>
            Back to family
          </a>
          <a className="button ghost" href="#/">
            Next family
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">
          <a href={`#/family/${householdId}`}>← {familyName(f)} family</a> · card {f.cardNumber ?? "none"}
        </p>
        <h1>🎁 Give books</h1>
        <p className="muted">Scan each book's barcode. Copies come from {location.name} stock.</p>
      </header>
      <section className="card">
        <ScanField label="Scan a book (ISBN)" placeholder="978…" onScan={scan} busy={scanning} inputMode="numeric" buttonLabel="Add" formats={["ean_13", "upc_a"]} />
        <ErrorBox error={scanError} />
      </section>

      <section className="card">
        <h2>Basket {total > 0 && <span className="muted">· {plural(total, "book")}</span>}</h2>
        {lines.length === 0 ? (
          <p className="muted">Nothing yet. Scanned books show up here.</p>
        ) : (
          <ul className="basket">
            {lines.map((l) => {
              const short = shortages.find((s) => s.isbn === l.scan.book.isbn && s.condition === l.condition);
              return (
                <li key={l.key} className={short ? "short" : ""}>
                  <Cover url={l.scan.book.coverUrl} title={l.scan.book.title} />
                  <div className="basket-main">
                    <b>{l.scan.book.title}</b>
                    <span className="muted small">
                      {l.scan.book.authors.join(", ") || "Unknown author"} · {l.scan.book.category}
                    </span>
                    <div className="basket-controls">
                      <div className="segmented small" role="radiogroup" aria-label="Condition">
                        {(["new", "used"] as const).map((c) => (
                          <button key={c} type="button" role="radio" aria-checked={l.condition === c} className={l.condition === c ? "on" : ""} onClick={() => update(l.key, { condition: c })}>
                            {c} ({onHandHere(l.scan, c)})
                          </button>
                        ))}
                      </div>
                      <select
                        aria-label="For which child"
                        value={l.childId}
                        onChange={(e) => {
                          update(l.key, { childId: e.target.value });
                          setLastChild(e.target.value);
                        }}
                      >
                        <option value="">For the family</option>
                        {f.children.map((c) => (
                          <option key={c.id} value={c.id}>
                            For {c.firstName}
                            {c.age != null ? ` (${c.age})` : ""}
                          </option>
                        ))}
                      </select>
                      <label className="qty">
                        Qty
                        <input type="number" min={1} max={50} value={l.quantity} onChange={(e) => update(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                      </label>
                      <button type="button" className="remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.scan.book.title}`}>
                        Remove
                      </button>
                    </div>
                    {short && (
                      <span className="short-msg" role="alert">
                        Only {short.onHand} {short.condition} {short.onHand === 1 ? "copy" : "copies"} on hand here; basket has {short.quantity}.
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <ErrorBox error={submitError} />
        <button className="submit" onClick={confirm} disabled={busy || lines.length === 0}>
          {busy ? "Saving…" : `Give ${plural(total, "book")} to the ${familyName(f)} family`}
        </button>
      </section>
    </div>
  );
}

export function Cover({ url, title, large }: { url: string | null; title: string; large?: boolean }) {
  return url ? (
    <img className={`cover ${large ? "large" : ""}`} src={url.replace(/^http:/, "https:")} alt={`Cover of ${title}`} loading="lazy" />
  ) : (
    <div className={`cover placeholder ${large ? "large" : ""}`} aria-hidden>
      📖
    </div>
  );
}
