// Books: scan for details/stock/history, add copies to inventory, and manage stock per location.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../auth";
import { useApp } from "../context";
import type { Book, BookScan, Classifications, InventoryRow, StockRow } from "../types";
import { ErrorBox, Loading, Notice, PagerBar, ScanField, fmtDate, fmtDateTime, go, plural, toApiError, useAsync, usePager } from "../ui";
import { BookTags, Cover } from "./GiveBooks";

const TABS = [
  { key: "scan", label: "📖 Scan a book" },
  { key: "receive", label: "📦 Add books" },
  { key: "stock", label: "🗂️ Inventory" },
];

export function BooksPage({ tab = "scan", arg }: { tab?: string; arg?: string }) {
  return (
    <div className="stack">
      <nav className="subtabs" aria-label="Books">
        {TABS.map((t) => (
          <a key={t.key} href={`#/books/${t.key}`} className={tab === t.key ? "active" : ""} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      {tab === "receive" ? <Receive /> : tab === "stock" ? <Inventory /> : <ScanBook isbn={arg} />}
    </div>
  );
}

// ---------------------------------------------------------------- scan

function ScanBook({ isbn }: { isbn?: string }) {
  const [result, setResult] = useState<BookScan | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan(code: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<BookScan>(`/api/books/${encodeURIComponent(code)}`));
    } catch (e) {
      setResult(null);
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (isbn) void scan(isbn);
  }, [isbn]);

  return (
    <>
      <section className="card">
        <ScanField label="Scan or type an ISBN" placeholder="978…" onScan={scan} busy={busy} inputMode="numeric" buttonLabel="Look up" formats={["ean_13", "upc_a"]} />
        {busy && <Loading label="Looking it up… (new books take a few seconds)" />}
        <ErrorBox error={error} />
        {error?.code === "isbn_not_found" && (
          <a className="button secondary" href="#/books/receive">
            Add it by hand
          </a>
        )}
      </section>
      {result && <BookDetails scan={result} />}
    </>
  );
}

function confidence(c: number | null) {
  if (c == null) return null;
  return `${Math.round(c * 100)}% confident`;
}

const SOURCE_LABEL: Record<string, string> = { manual: "entered by hand", demo: "demo data", rules: "by keyword rules", metadata: "from the publisher's data" };
const sourceLabel = (s: string | null) => (s ? (SOURCE_LABEL[s] ?? `by ${s}`) : null);

function Classification({ label, value, source, conf }: { label: string; value: string | null; source: string | null; conf: number | null }) {
  return (
    <div className="classification">
      <dt>{label}</dt>
      <dd>
        {value ? <b>{value}</b> : <span className="muted">Not known</span>}
        {value && <span className="muted small"> {[sourceLabel(source), confidence(conf)].filter(Boolean).join(", ")}</span>}
      </dd>
    </div>
  );
}

function BookDetails({ scan }: { scan: BookScan }) {
  const { locations } = useApp();
  const b = scan.book;
  const history = usePager(scan.giveaways, { resetKey: b.isbn });
  const byLoc = new Map<number, { code: string; name: string; new: number; used: number }>();
  for (const s of scan.stock) {
    const l = byLoc.get(s.locationId) ?? { code: s.location, name: locations.find((x) => x.id === s.locationId)?.name ?? s.location, new: 0, used: 0 };
    l[s.condition] += s.onHand;
    byLoc.set(s.locationId, l);
  }
  return (
    <>
      <section className="card book-card">
        <Cover url={b.coverUrl} title={b.title} large />
        <div className="book-info">
          {scan.firstScan && <Notice kind="ok">New to the catalog: looked up and categorized just now.</Notice>}
          <h2>{b.title}</h2>
          {b.subtitle && <p className="muted">{b.subtitle}</p>}
          <p>{b.authors.join(", ") || "Unknown author"}</p>
          <p className="muted small">
            {[b.publisher, b.publishedDate, b.pageCount ? `${b.pageCount} pages` : null, `ISBN ${b.isbn}`].filter(Boolean).join(" · ")}
          </p>
          <dl className="classifications">
            <Classification label="Reading level" value={b.readingLevel} source={b.readingLevelSource} conf={b.readingLevelConfidence} />
            <Classification label="Language" value={b.language} source={b.languageSource} conf={b.languageConfidence} />
            <Classification label="Genre" value={b.category} source={b.categoryModel} conf={b.categoryConfidence} />
          </dl>
          {b.description && <p className="desc">{b.description.length > 400 ? b.description.slice(0, 400) + "…" : b.description}</p>}
          <div className="kpis small-kpis">
            <div className="kpi">
              <span className="kpi-value">{scan.onHand}</span>
              <span className="kpi-label">on hand</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{scan.givenAway.total}</span>
              <span className="kpi-label">given away</span>
            </div>
            <div className="kpi">
              <span className="kpi-value small">{fmtDate(scan.givenAway.lastGivenAt)}</span>
              <span className="kpi-label">last given</span>
            </div>
          </div>
        </div>
      </section>
      <section className="card">
        <h2>Stock by location</h2>
        {byLoc.size === 0 ? (
          <p className="muted">
            No copies anywhere. <a href="#/books/receive">Add some.</a>
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Location</th>
                <th className="num">New</th>
                <th className="num">Used</th>
              </tr>
            </thead>
            <tbody>
              {[...byLoc.values()].map((l) => (
                <tr key={l.code}>
                  <td>
                    {l.name} <span className="muted">({l.code})</span>
                  </td>
                  <td className="num">{l.new}</td>
                  <td className="num">{l.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>Giveaway history</h2>
        {scan.giveaways.length === 0 ? (
          <p className="muted">Not given away yet.</p>
        ) : (
          <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Where</th>
                  <th>Card</th>
                  <th>For</th>
                  <th>Copy</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((g, i) => (
                  <tr key={i}>
                    <td>{fmtDateTime(g.distributedAt)}</td>
                    <td>{g.location}</td>
                    <td>
                      <a className="mono" href={`#/family/${g.householdId}`}>
                        {g.cardNumber ?? "family page"}
                      </a>
                    </td>
                    <td>{g.forChild ?? <span className="muted">family</span>}</td>
                    <td>
                      {g.condition}
                      {g.quantity > 1 && ` ×${g.quantity}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PagerBar pager={history} noun="giveaways" />
          </>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- receive

type Received = { book: Book; firstScan: boolean; stock: StockRow[]; quantity: number; condition: string };

function Receive() {
  const { location } = useApp();
  const [condition, setCondition] = useState<"new" | "used">("used");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<"donation" | "purchase">("donation");
  const [donor, setDonor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [log, setLog] = useState<Received[]>([]);

  async function receive(isbn: string) {
    setBusy(true);
    setError(null);
    setNotFound(null);
    try {
      const r = await api<{ book: Book; firstScan: boolean; stock: StockRow[] }>("/api/inventory/receive", {
        json: { isbn, locationId: location.id, condition, quantity, reason, donor: donor.trim() || null },
      });
      setLog((l) => [{ ...r, quantity, condition }, ...l].slice(0, 30));
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "isbn_not_found") setNotFound(err.details?.isbn ?? isbn);
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const here = (s: StockRow[]) => s.filter((x) => x.locationId === location.id).map((x) => `${x.onHand} ${x.condition}`).join(", ");

  return (
    <>
      <section className="card">
        <h2>📦 Add books to {location.name}</h2>
        <p className="muted">Set the options, then scan each book. Every scan adds the copies right away.</p>
        <div className="grid4">
          <div>
            <span className="label">Condition</span>
            <div className="segmented" role="radiogroup" aria-label="Condition">
              {(["new", "used"] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={condition === c} className={condition === c ? "on" : ""} onClick={() => setCondition(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Source</span>
            <div className="segmented" role="radiogroup" aria-label="Source">
              {(["donation", "purchase"] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={reason === c} className={reason === c ? "on" : ""} onClick={() => setReason(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="qty">Copies per scan</label>
            <input id="qty" type="number" min={1} max={5000} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className="short" />
          </div>
          <div>
            <label htmlFor="donor">
              {reason === "donation" ? "Donor" : "Vendor / note"} <span className="opt">optional</span>
            </label>
            <input id="donor" value={donor} onChange={(e) => setDonor(e.target.value)} placeholder={reason === "donation" ? "e.g. Rotary book drive" : "e.g. First Book order"} />
          </div>
        </div>
        <ScanField label="Scan a book (ISBN)" placeholder="978…" onScan={receive} busy={busy} inputMode="numeric" buttonLabel="Add" formats={["ean_13", "upc_a"]} />
        {busy && <Loading label="Adding… (new books are looked up first)" />}
        <ErrorBox error={notFound ? null : error} />
        {notFound && (
          <AddByHand
            isbn={notFound}
            onAdded={() => {
              const isbn = notFound;
              setNotFound(null);
              setError(null);
              void receive(isbn);
            }}
            onCancel={() => setNotFound(null)}
          />
        )}
      </section>
      {log.length > 0 && (
        <section className="card">
          <h2>Added this session</h2>
          <ul className="basket">
            {log.map((r, i) => (
              <li key={i}>
                <Cover url={r.book.coverUrl} title={r.book.title} />
                <div className="basket-main">
                  <b>
                    +{r.quantity} {r.condition} · {r.book.title}
                  </b>
                  <BookTags book={r.book} />
                  <span className="muted small">
                    {r.firstScan ? "New to the catalog · " : ""}now {here(r.stock) || "0"} here
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AddByHand({ isbn, onAdded, onCancel }: { isbn: string; onAdded: () => void; onCancel: () => void }) {
  const cats = useAsync(() => api<Classifications>("/api/categories"), []);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [category, setCategory] = useState("Children's");
  const [readingLevel, setReadingLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/books", {
        json: {
          isbn,
          title,
          category,
          readingLevel,
          language: language || null,
          authors: authors.split(/[,;]/).map((a) => a.trim()).filter(Boolean),
        },
      });
      onAdded();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sub by-hand" onSubmit={submit}>
      <Notice kind="warn">
        ISBN <b className="mono">{isbn}</b> isn't in Google Books or Open Library. Add it by hand from the cover and title page, then we'll add
        the copies.
      </Notice>
      <label htmlFor="bh-title">Title</label>
      <input id="bh-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      <label htmlFor="bh-authors">
        Author(s) <span className="opt">comma-separated</span>
      </label>
      <input id="bh-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} />
      <div className="grid3">
        <div>
          <label htmlFor="bh-level">Reading level</label>
          <select id="bh-level" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)} required>
            <option value="" disabled>
              Pick one…
            </option>
            {(cats.data?.readingLevels ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bh-lang">
            Language <span className="opt">optional</span>
          </label>
          <select id="bh-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Not sure</option>
            {(cats.data?.languages ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bh-cat">Genre</label>
          <select id="bh-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {(cats.data?.categories ?? [category]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <ErrorBox error={error ?? cats.error} />
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save book & add copies"}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- inventory, transfer, adjust

function Inventory() {
  const { location, locations } = useApp();
  const active = locations.filter((l) => l.active);
  const [locId, setLocId] = useState<number | "all">(location.id);
  const inv = useAsync(() => api<InventoryRow[]>(`/api/inventory${locId === "all" ? "" : `?locationId=${locId}`}`), [locId]);
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<{ row: InventoryRow; kind: "transfer" | "adjust" } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (inv.data ?? []).filter((r) => !f || r.title.toLowerCase().includes(f) || r.isbn.includes(f) || r.category.toLowerCase().includes(f) || (r.readingLevel ?? "").toLowerCase().includes(f) || (r.language ?? "").toLowerCase().includes(f) || r.authors.join(" ").toLowerCase().includes(f));
  }, [inv.data, filter]);
  const pager = usePager(rows, { resetKey: `${locId}|${filter}` });
  const total = rows.reduce((n, r) => n + r.onHand, 0);

  return (
    <>
      <section className="card">
        <div className="row spread wrap">
          <h2>🗂️ Inventory</h2>
          <div className="row wrap">
            <select aria-label="Location" value={locId} onChange={(e) => setLocId(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">All locations</option>
              {active.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
            <input aria-label="Filter" placeholder="Filter by title, author, reading level, language, genre, ISBN" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        {flash && <Notice kind="ok">{flash}</Notice>}
        {action && (
          <StockAction
            row={action.row}
            kind={action.kind}
            onClose={() => setAction(null)}
            onDone={(msg) => {
              setAction(null);
              setFlash(msg);
              inv.reload();
            }}
          />
        )}
        {inv.loading && !inv.data ? (
          <Loading />
        ) : inv.error ? (
          <ErrorBox error={inv.error} onRetry={inv.reload} />
        ) : (
          <>
            <p className="muted">
              {plural(total, "copy", "copies")} · {plural(new Set(rows.map((r) => r.isbn)).size, "title")}
            </p>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Reading level</th>
                    <th>Language</th>
                    <th>Genre</th>
                    {locId === "all" && <th>Location</th>}
                    <th>Condition</th>
                    <th className="num">On hand</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pager.rows.map((r) => (
                    <tr key={`${r.isbn}-${r.locationId}-${r.condition}`}>
                      <td>
                        <a href={`#/books/scan/${r.isbn}`}>{r.title}</a>
                        <div className="muted small">{r.authors.join(", ")}</div>
                      </td>
                      <td>{r.readingLevel ?? "—"}</td>
                      <td>{r.language ?? "—"}</td>
                      <td>{r.category}</td>
                      {locId === "all" && <td>{r.location}</td>}
                      <td>{r.condition}</td>
                      <td className="num">{r.onHand}</td>
                      <td className="row-actions">
                        <button className="link" onClick={() => setAction({ row: r, kind: "transfer" })}>
                          Transfer
                        </button>
                        <button className="link" onClick={() => setAction({ row: r, kind: "adjust" })}>
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="muted">No copies on hand{filter ? " match that filter" : ""}.</p>}
            <PagerBar pager={pager} noun="rows" />
          </>
        )}
      </section>
    </>
  );
}

function StockAction({ row, kind, onClose, onDone }: { row: InventoryRow; kind: "transfer" | "adjust"; onClose: () => void; onDone: (msg: string) => void }) {
  const { locations } = useApp();
  const others = locations.filter((l) => l.active && l.id !== row.locationId);
  const [to, setTo] = useState<number>(others[0]?.id ?? 0);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<"damaged" | "recount">("damaged");
  const [count, setCount] = useState(row.onHand);
  const [note, setNote] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "transfer") {
        await api("/api/inventory/transfer", {
          json: { isbn: row.isbn, fromLocationId: row.locationId, toLocationId: to, condition: row.condition, quantity: qty, note: note || null },
        });
        onDone(`Moved ${plural(qty, "copy", "copies")} of “${row.title}” to ${locations.find((l) => l.id === to)?.code}.`);
      } else {
        const delta = mode === "damaged" ? -qty : count - row.onHand;
        if (delta === 0) throw new ApiError("The count matches what's on hand; nothing to change.", 400);
        await api("/api/inventory/adjust", {
          json: { isbn: row.isbn, locationId: row.locationId, condition: row.condition, delta, reason: mode === "damaged" ? "damaged" : "adjustment", note: note || null },
        });
        onDone(mode === "damaged" ? `Removed ${plural(qty, "damaged copy", "damaged copies")} of “${row.title}”.` : `Recounted “${row.title}”: now ${count}.`);
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sub" onSubmit={submit}>
      <h3>
        {kind === "transfer" ? "Transfer" : "Adjust"} “{row.title}” · {row.condition} · {row.onHand} at {row.location}
      </h3>
      {kind === "transfer" ? (
        <div className="grid2">
          <div>
            <label htmlFor="sa-to">To</label>
            <select id="sa-to" value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {others.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sa-qty">Copies</label>
            <input id="sa-qty" type="number" min={1} max={row.onHand} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
        </div>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label="Adjustment">
            <button type="button" role="radio" aria-checked={mode === "damaged"} className={mode === "damaged" ? "on" : ""} onClick={() => setMode("damaged")}>
              Mark damaged
            </button>
            <button type="button" role="radio" aria-checked={mode === "recount"} className={mode === "recount" ? "on" : ""} onClick={() => setMode("recount")}>
              Recount
            </button>
          </div>
          {mode === "damaged" ? (
            <>
              <label htmlFor="sa-dmg">Damaged copies to remove</label>
              <input id="sa-dmg" type="number" min={1} max={row.onHand} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="short" />
            </>
          ) : (
            <>
              <label htmlFor="sa-count">Copies actually on the shelf</label>
              <input id="sa-count" type="number" min={0} value={count} onChange={(e) => setCount(Number(e.target.value))} className="short" />
            </>
          )}
        </>
      )}
      <label htmlFor="sa-note">
        Note <span className="opt">optional</span>
      </label>
      <input id="sa-note" value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBox error={error} />
      <div className="actions">
        <button className="primary" disabled={busy || (kind === "transfer" && !to)}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

