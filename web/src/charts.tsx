// Small, dependency-free charts. Palette validated with the dataviz validator (light surface):
// series 1 #8a5cad (purple), series 2 #c97a1e (amber). Every chart has a table view.
import { useState, type ReactNode } from "react";

export const SERIES = ["#8a5cad", "#c97a1e"];

export function ChartCard({ title, subtitle, children, table }: { title: string; subtitle?: string; children: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <button className="link small" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? <div className="table-scroll">{table}</div> : children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i > 0 ? "num" : ""}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={j > 0 ? "num" : ""}>
                {typeof c === "number" ? c.toLocaleString() : c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** Vertical bars over time (one series), with a hover tooltip and the peak labeled. */
export function ColumnChart({ data, label, unit, secondary }: { data: { x: string; y: number }[]; label: (x: string) => string; unit: string; secondary?: { name: string; values: number[] } }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 8, t: 16, b: 28 };
  const max = niceMax(Math.max(...data.map((d) => d.y), 0));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = data.length ? iw / data.length : iw;
  const barW = Math.max(4, Math.min(36, bw - 8));
  const peak = data.reduce((m, d, i) => (d.y > (data[m]?.y ?? -1) ? i : m), 0);
  const ticks = [0, max / 2, max];
  if (data.length === 0) return <p className="muted">No data for this range.</p>;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${unit} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih - (t / max) * ih} y2={pad.t + ih - (t / max) * ih} className="grid" />
            <text x={pad.l - 6} y={pad.t + ih - (t / max) * ih + 4} className="axis" textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = (d.y / max) * ih;
          const x = pad.l + i * bw + (bw - barW) / 2;
          const y = pad.t + ih - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.x}>
              <path d={`M${x},${pad.t + ih} V${y + r} q0,-${r} ${r},-${r} H${x + barW - r} q${r},0 ${r},${r} V${pad.t + ih} Z`} fill={SERIES[0]} opacity={hover == null || hover === i ? 1 : 0.55} />
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${label(d.x)}: ${d.y} ${unit}`} />
              {(data.length <= 12 || i % 2 === 0) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 8} className="axis" textAnchor="middle">
                  {label(d.x)}
                </text>
              )}
              {i === peak && d.y > 0 && (
                <text x={x + barW / 2} y={y - 4} className="value" textAnchor="middle">
                  {d.y}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="baseline" />
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%` }}>
          <b>{label(data[hover].x)}</b>
          <span>
            {data[hover].y.toLocaleString()} {unit}
          </span>
          {secondary && (
            <span>
              {secondary.values[hover].toLocaleString()} {secondary.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (one series). Values sit at the bar ends in text ink. */
export function BarList({ data, unit, max: maxIn }: { data: { label: string; value: number; note?: string }[]; unit: string; max?: number }) {
  const max = maxIn ?? Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) return <p className="muted">No data for this range.</p>;
  return (
    <ul className="barlist">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${d.value.toLocaleString()} ${unit}${d.note ? ` · ${d.note}` : ""}`}>
          <span className="bl-label">{d.label}</span>
          <span className="bl-track">
            <span className="bl-bar" style={{ width: `${Math.max(1, (d.value / max) * 100)}%`, background: SERIES[0] }} />
          </span>
          <span className="bl-value">
            {d.value.toLocaleString()}
            {d.note && <span className="muted small"> {d.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Two-part share bar (e.g. new vs used) with a legend and direct labels. */
export function ShareBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total === 0) return <p className="muted">No data for this range.</p>;
  return (
    <div>
      <div className="sharebar" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {parts.map((p, i) => (
          <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i % SERIES.length] }} title={`${p.label}: ${p.value.toLocaleString()}`} />
        ))}
      </div>
      <ul className="legend">
        {parts.map((p, i) => (
          <li key={p.label}>
            <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} aria-hidden /> {p.label} <b>{Math.round((p.value / total) * 100)}%</b>{" "}
            <span className="muted">({p.value.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
