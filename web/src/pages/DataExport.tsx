// Admin: download everything as one Excel workbook, for building reports in Excel or Google Sheets.
import { useState } from "react";
import { downloadFile } from "../auth";
import { useApp } from "../context";
import { ErrorBox, Notice } from "../ui";
import { PRESETS } from "./Reports";

const ALL_TIME = { key: "all", label: "All time", range: (): [string, string] => ["", ""] };

const TABS: [string, string][] = [
  ["Books given", "one row per book handed out, with the family, child's age, book genre, reading level and language. Start here."],
  ["Visits", "one row per visit, with first visit or returning, books and children served."],
  ["Families", "every family with totals and their latest survey answers."],
  ["Adults / Children", "everyone, with contact details, age ranges and ages."],
  ["Survey answers", "one row per answer, for any survey."],
  ["Books received / Stock now", "donations, purchases and what's on the shelves."],
];

export function DataExport() {
  const { locations } = useApp();
  const presets = [...PRESETS, ALL_TIME];
  const [preset, setPreset] = useState("12m");
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[0].range());
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      if (locationId) q.set("locationId", locationId);
      const { name } = await downloadFile(`/api/exports/workbook?${q}`, "fol-data.xlsx");
      setDone(`Downloaded ${name}.`);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>📈 Build your own reports</h2>
      <p className="muted">
        Download all the data as one Excel file and slice it any way you like with pivot tables and filters. It opens in Excel, and
        in Google Sheets (File → Import → Upload). Each tab has filters on its header row, and a "Read me" tab explains every column.
      </p>
      <ul className="small">
        {TABS.map(([name, about]) => (
          <li key={name}>
            <b>{name}</b>: {about}
          </li>
        ))}
      </ul>
      <div className="filters" role="group" aria-label="Export filters">
        <div className="segmented wrap">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={preset === p.key ? "on" : ""}
              aria-pressed={preset === p.key}
              onClick={() => {
                setPreset(p.key);
                setRange(p.range());
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="inline">
          From <input type="date" value={from} max={to || undefined} onChange={(e) => (setPreset("custom"), setRange([e.target.value, to]))} />
        </label>
        <label className="inline">
          To <input type="date" value={to} min={from || undefined} onChange={(e) => (setPreset("custom"), setRange([from, e.target.value]))} />
        </label>
        <select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.filter((l) => l.active).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>
      <p className="hint">Dates and location apply to visits, books, surveys and stock. Families, adults and children always include everyone.</p>
      <ErrorBox error={error} />
      {done && <Notice kind="ok">{done}</Notice>}
      <div className="actions">
        <button className="primary" onClick={download} disabled={busy}>
          {busy ? "Preparing the file…" : "⬇️ Download Excel file"}
        </button>
      </div>
      <p className="muted small">The file includes contact details (Adults tab). Keep it private and delete old copies.</p>
    </section>
  );
}
