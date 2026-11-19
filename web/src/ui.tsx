// Small shared pieces: hash routing, loading/error states, scan fields, barcodes.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import JsBarcode from "jsbarcode";
import { ApiError } from "./auth";

// ---------------------------------------------------------------- routing

export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function go(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

/** Query string after the hash route, e.g. #/intake?q=... */
export function hashQuery(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}

// ---------------------------------------------------------------- async state

export type Async<T> = { data: T | null; error: ApiError | null; loading: boolean; reload: () => void; set: (d: T) => void };

/** Run an API call when `deps` change; keep the last data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn().then(
      (d) => live && (setData(d), setLoading(false)),
      (e) => live && (setError(toApiError(e)), setLoading(false)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []), set: setData };
}

export function toApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError((e as Error)?.message ?? "Something went wrong", 0);
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | string | null; onRetry?: () => void }) {
  if (!error) return null;
  const msg = typeof error === "string" ? error : error.message;
  return (
    <div className="notice error" role="alert">
      <span>{msg}</span>
      {onRetry && (
        <button type="button" className="link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === "error" || kind === "warn" ? "alert" : "status"}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- scanning

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
  }
}

/**
 * A text field for USB barcode scanners: they type the code and press Enter.
 * Autofocuses, submits on Enter, clears after submit, and offers camera scanning where supported.
 */
export function ScanField({
  label,
  placeholder,
  onScan,
  busy,
  autoFocus = true,
  formats,
  inputMode = "text",
  buttonLabel = "Find",
  id,
}: {
  label: string;
  placeholder?: string;
  onScan: (value: string) => void | Promise<void>;
  busy?: boolean;
  autoFocus?: boolean;
  formats?: string[];
  inputMode?: "text" | "numeric";
  buttonLabel?: string;
  id?: string;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fieldId = id ?? `scan-${label.replace(/\W+/g, "-").toLowerCase()}`;

  useEffect(() => {
    if (autoFocus && !busy) input.current?.focus();
  }, [autoFocus, busy]);

  async function submit(v: string) {
    const trimmed = v.trim();
    if (!trimmed) return;
    setValue("");
    await onScan(trimmed);
    input.current?.focus();
  }

  return (
    <div className="scan">
      <label htmlFor={fieldId}>{label}</label>
      <form
        className="scan-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
      >
        <input
          id={fieldId}
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          disabled={busy}
        />
        <button className="primary" disabled={busy || !value.trim()}>
          {busy ? "…" : buttonLabel}
        </button>
        {typeof window !== "undefined" && window.BarcodeDetector && (
          <button type="button" className="ghost" onClick={() => setCamera(true)} aria-label="Scan with camera" title="Scan with camera">
            📷
          </button>
        )}
      </form>
      {camera && (
        <CameraScanner
          formats={formats}
          onClose={() => setCamera(false)}
          onDetect={(v) => {
            setCamera(false);
            void submit(v);
          }}
        />
      )}
    </div>
  );
}

function CameraScanner({ onDetect, onClose, formats }: { onDetect: (v: string) => void; onClose: () => void; formats?: string[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        const supported = (await (window.BarcodeDetector as any).getSupportedFormats?.()) as string[] | undefined;
        const wanted = (formats ?? ["ean_13", "code_128", "qr_code", "upc_a"]).filter((f) => !supported || supported.includes(f));
        const detector = new window.BarcodeDetector!({ formats: wanted });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) return onDetect(found[0].rawValue);
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("The camera isn't available here. Type the number or use a USB scanner instead.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="camera">
      {error ? <ErrorBox error={error} /> : <video ref={video} muted playsInline aria-label="Camera preview" />}
      <button type="button" className="secondary" onClick={onClose}>
        Close camera
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- barcode

export function Barcode({ value, height = 48 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, { format: "CODE128", height, displayValue: false, margin: 0, width: 1.6, background: "transparent" });
    }
  }, [value, height]);
  return <svg ref={ref} role="img" aria-label={`Barcode for ${value}`} />;
}

// ---------------------------------------------------------------- formatting

export const fmtDate = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
export const fmtDateTime = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export function fmtPhone(e164: string | null) {
  if (!e164) return null;
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function fullName(g: { firstName: string; lastName: string | null }) {
  return [g.firstName, g.lastName].filter(Boolean).join(" ");
}

export function familyName(f: { guardians: { firstName: string; lastName: string | null }[] }) {
  const g = f.guardians[0];
  return g ? (g.lastName ? `${g.firstName} ${g.lastName}` : g.firstName) : "Family";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- paging

const PAGE_SIZES = [10, 25, 50, 100];

export type Pager<T> = { rows: T[]; page: number; pages: number; size: number; total: number; setPage: (p: number) => void; setSize: (s: number) => void };

/**
 * Splits a long list into pages. Goes back to page 1 when `resetKey` changes (a new filter
 * or search) and stays in range when the list shrinks (a row was removed).
 */
export function usePager<T>(items: readonly T[], { size: initial = 10, resetKey = "" }: { size?: number; resetKey?: unknown } = {}): Pager<T> {
  const [size, setSizeState] = useState(initial);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  return {
    rows: items.slice((current - 1) * size, current * size),
    page: current,
    pages,
    size,
    total: items.length,
    setPage: (p) => setPage(Math.max(1, Math.min(p, pages))),
    setSize: (s) => {
      setSizeState(s);
      setPage(1);
    },
  };
}

/** Page numbers to show: first, last, and two either side of the current page, with gaps. */
function pageList(page: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** "Showing 26–50 of 54", page buttons and a rows-per-page picker. Hidden when everything fits on one page. */
export function PagerBar<T>({ pager, noun = "rows" }: { pager: Pager<T>; noun?: string }) {
  const { page, pages, size, total, setPage, setSize } = pager;
  if (total <= PAGE_SIZES[0]) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="muted small">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {pages > 1 && (
        <span className="pager-pages">
          <button type="button" className="secondary small" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            ‹ Prev
          </button>
          {pageList(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap${i}`} className="muted pager-gap">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                className={`small ${p === page ? "" : "secondary"}`}
                onClick={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="secondary small" onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Next page">
            Next ›
          </button>
        </span>
      )}
      <label className="pager-size small">
        Rows per page{" "}
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
