// Program report: KPIs and charts with date-range and location filters.
import { useState } from "react";
import { api } from "../auth";
import { useApp } from "../context";
import type { Report } from "../types";
import { BarList, ChartCard, ColumnChart, DataTable, Heatmap, ShareBar } from "../charts";
import { ErrorBox, Loading, useAsync } from "../ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
export const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "12m", label: "Last 12 months", range: () => { const t = today(); const f = new Date(t); f.setMonth(f.getMonth() - 12); f.setDate(f.getDate() + 1); return [iso(f), iso(t)]; } },
  { key: "ytd", label: "This year", range: () => [`${today().getFullYear()}-01-01`, iso(today())] },
  { key: "90d", label: "Last 90 days", range: () => { const f = today(); f.setDate(f.getDate() - 89); return [iso(f), iso(today())]; } },
  { key: "30d", label: "Last 30 days", range: () => { const f = today(); f.setDate(f.getDate() - 29); return [iso(f), iso(today())]; } },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar", or "Jan ’26" for January and for the first month shown (so a range starting mid-year is dated). */
const monthLabel = (m: string, first = false) => {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1]}${mo === 1 || first ? ` ’${String(y).slice(2)}` : ""}`;
};
// "26+" is the Story Garden bucket; the others are from older surveys.
const BOOKS_IN_HOME_ORDER = ["0", "1-10", "11-25", "26+", "26-50", "51-100", "100+"];
const BOOKS_IN_HOME_LABEL: Record<string, string> = { "0": "None", "100+": "More than 100" };
const AGE_ORDER = ["0-2", "3-5", "6-8", "9-12", "13-17", "18+", "unknown"];
const LEVEL_ORDER = ["Board Book", "Picture Book", "Early Reader", "Chapter Book", "YA", "Adult", "Unknown"];
const LANG_ORDER = ["English", "Spanish", "Bilingual", "Other", "Unknown"];
const byOrder = (order: string[]) => (a: string, b: string) => (order.indexOf(a) + 99 * +(order.indexOf(a) < 0)) - (order.indexOf(b) + 99 * +(order.indexOf(b) < 0));
const ageLabel = (a: string) => (a === "unknown" ? "Age unknown" : `Ages ${a}`);

export function Reports() {
  const { locations } = useApp();
  const [preset, setPreset] = useState("12m");
  const [[from, to], setRange] = useState(PRESETS[0].range());
  const [locationId, setLocationId] = useState<string>("");
  const qs = new URLSearchParams({ from, to, ...(locationId ? { locationId } : {}) }).toString();
  const rep = useAsync(() => api<Report>(`/api/reports/summary?${qs}`), [qs]);

  return (
    <div className="stack">
      <header className="page-head">
        <h1>📊 Reports</h1>
        <div className="filters" role="group" aria-label="Report filters">
          <div className="segmented wrap">
            {PRESETS.map((p) => (
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
            From <input type="date" value={from} max={to} onChange={(e) => (setPreset("custom"), setRange([e.target.value, to]))} />
          </label>
          <label className="inline">
            To <input type="date" value={to} min={from} onChange={(e) => (setPreset("custom"), setRange([from, e.target.value]))} />
          </label>
          <select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {/* Deactivated locations still count under "All locations". */}
            {locations.filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>
      </header>
      {rep.loading && <Loading label="Crunching the numbers…" />}
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {rep.data && <ReportBody r={rep.data} dim={rep.loading} />}
    </div>
  );
}

function Kpi({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{typeof value === "number" ? value.toLocaleString() : value}</span>
      <span className="kpi-label">{label}</span>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  );
}

function ReportBody({ r, dim }: { r: Report; dim: boolean }) {
  const b = r.booksGivenAway;
  const newFams = r.families.served - r.families.returning;
  const rd = r.surveys.readDaysPerWeek;
  const ch = rd.changeForReturningFamilies;
  const delta = ch.first_average != null && ch.latest_average != null ? ch.latest_average - ch.first_average : null;
  const ageRows = [...b.byChildAgeBracket].sort((x, y) => AGE_ORDER.indexOf(x.age_bracket) - AGE_ORDER.indexOf(y.age_bracket));
  const bih = [...r.surveys.booksInHome].sort((x, y) => BOOKS_IN_HOME_ORDER.indexOf(x.answer) - BOOKS_IN_HOME_ORDER.indexOf(y.answer));
  const bihTotal = bih.reduce((n, x) => n + x.families, 0);
  const er = r.surveys.everyoneReads;
  const en = r.surveys.childEnjoysReading;
  const enCh = en.changeForReturningFamilies;
  const vr = r.surveys.visitRating;
  const change = (c: typeof enCh, unit: string) =>
    c.families && c.first_average != null && c.latest_average != null
      ? `${c.first_average.toFixed(1)} → ${c.latest_average.toFixed(1)}${unit}, ${c.families} returning families`
      : "Needs families with 2+ answers";
  const stockByLoc = new Map<string, { new: number; used: number; titles: number }>();
  for (const s of r.stockOnHand) {
    const v = stockByLoc.get(s.location) ?? { new: 0, used: 0, titles: 0 };
    v[s.condition as "new" | "used"] += s.on_hand;
    v.titles += s.titles;
    stockByLoc.set(s.location, v);
  }
  const perVisit = b.visits ? (b.books / b.visits).toFixed(1) : "—";
  const levels = [...b.byReadingLevel].sort((x, y) => byOrder(LEVEL_ORDER)(x.reading_level, y.reading_level));
  const bookLangs = [...b.byBookLanguage].sort((x, y) => byOrder(LANG_ORDER)(x.language, y.language));
  const al = b.byChildAgeBracketAndReadingLevel;
  const alAges = [...new Set(al.map((x) => x.age_bracket))].sort(byOrder(AGE_ORDER));
  const alLevels = [...new Set(al.map((x) => x.reading_level))].sort(byOrder(LEVEL_ORDER));
  const alValue = (age: string, level: string) => al.find((x) => x.age_bracket === age && x.reading_level === level)?.books ?? 0;

  return (
    <div className={`stack ${dim ? "dim" : ""}`}>
      <section className="kpis">
        <Kpi value={r.families.served} label="Families served" note={`${newFams.toLocaleString()} new · ${r.families.returning.toLocaleString()} returning`} />
        <Kpi value={r.families.signed_up} label="New sign-ups" note="Families who got a card" />
        <Kpi value={b.books} label="Books given" note={`${perVisit} per visit`} />
        <Kpi value={b.visits} label="Visits" note="Times a family left with books" />
      </section>

      <ChartCard
        title="Books given by month"
        subtitle="Hover a month for families served"
        table={<DataTable head={["Month", "Books", "Families"]} rows={b.byMonth.map((m) => [m.month, m.books, m.families])} />}
      >
        <ColumnChart data={b.byMonth.map((m) => ({ x: m.month, y: m.books }))} label={(m) => monthLabel(m, m === b.byMonth[0]?.month)} unit="books" secondary={{ name: "families", values: b.byMonth.map((m) => m.families) }} />
      </ChartCard>

      <div className="two-col">
        <ChartCard title="Books by category" table={<DataTable head={["Category", "Books"]} rows={b.byCategory.map((c) => [c.category, c.books])} />}>
          <BarList data={b.byCategory.slice(0, 10).map((c) => ({ label: c.category, value: c.books }))} unit="books" />
        </ChartCard>
        <ChartCard title="Books by child's age" subtitle="Age when the book was given" table={<DataTable head={["Age", "Books"]} rows={ageRows.map((a) => [a.age_bracket, a.books])} />}>
          <BarList data={ageRows.map((a) => ({ label: ageLabel(a.age_bracket), value: a.books }))} unit="books" />
        </ChartCard>
        <ChartCard title="Books by reading level" table={<DataTable head={["Reading level", "Books"]} rows={levels.map((l) => [l.reading_level, l.books])} />}>
          <BarList data={levels.map((l) => ({ label: l.reading_level, value: l.books }))} unit="books" />
        </ChartCard>
        <ChartCard title="Books by language" subtitle="The book's language, not the family's" table={<DataTable head={["Language", "Books"]} rows={bookLangs.map((l) => [l.language, l.books])} />}>
          <BarList data={bookLangs.map((l) => ({ label: l.language, value: l.books }))} unit="books" />
        </ChartCard>
        <ChartCard title="Books by location" table={<DataTable head={["Location", "Books", "Families"]} rows={b.byLocation.map((l) => [`${l.name} (${l.location})`, l.books, l.families])} />}>
          <BarList data={b.byLocation.map((l) => ({ label: l.name, value: l.books, note: `· ${l.families} fam.` }))} unit="books" />
        </ChartCard>
        <ChartCard title="Families by home language" subtitle="A family can speak more than one" table={<DataTable head={["Language", "Families", "Books"]} rows={b.byHomeLanguage.map((l) => [l.language, l.families, l.books])} />}>
          <BarList data={[...b.byHomeLanguage].sort((x, y) => y.families - x.families).map((l) => ({ label: l.language, value: l.families }))} unit="families" />
        </ChartCard>
        <ChartCard title="New vs. used books" table={<DataTable head={["Condition", "Books"]} rows={b.byCondition.map((c) => [c.condition, c.books])} />}>
          <ShareBar parts={["new", "used"].map((c) => ({ label: c === "new" ? "New" : "Used", value: b.byCondition.find((x) => x.condition === c)?.books ?? 0 }))} />
        </ChartCard>
        <ChartCard
          title="Stock on hand"
          subtitle="Right now, not limited to the date range"
          table={<DataTable head={["Location", "New", "Used", "Titles"]} rows={[...stockByLoc].map(([k, v]) => [k, v.new, v.used, v.titles])} />}
        >
          <BarList data={[...stockByLoc].map(([k, v]) => ({ label: k, value: v.new + v.used, note: `· ${v.new} new / ${v.used} used` }))} unit="copies" />
        </ChartCard>
      </div>

      <ChartCard
        title="Reading level by child's age"
        subtitle="Books given to a specific child, by their age at the time"
        table={<DataTable head={["Age", "Reading level", "Books"]} rows={al.map((x) => [x.age_bracket, x.reading_level, x.books])} />}
      >
        <Heatmap rows={alAges} cols={alLevels} value={alValue} rowLabel={ageLabel} unit="books" />
      </ChartCard>

      <h2 className="section-title">📝 Survey outcomes</h2>
      <section className="kpis">
        <Kpi value={rd.average != null ? rd.average.toFixed(1) : "—"} label="Avg. days a week reading to their child" note={`${rd.responses.toLocaleString()} answers in range`} />
        <Kpi
          value={delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` : "—"}
          label="Change for returning families"
          note={ch.families ? `${ch.first_average?.toFixed(1)} → ${ch.latest_average?.toFixed(1)} days, ${ch.families} families (first vs. latest answer)` : "Needs families with 2+ answers"}
        />
        <Kpi value={en.average != null ? en.average.toFixed(1) : "—"} label="Child enjoys reading (1–10)" note={change(enCh, "")} />
        <Kpi value={vr.average != null ? vr.average.toFixed(1) : "—"} label="Visit rating (1–5)" note={`${vr.responses.toLocaleString()} returning-visitor answers in range`} />
        {er.yes + er.no > 0 && (
          <Kpi value={er.percent_yes != null ? `${er.percent_yes}%` : "—"} label="Homes where everyone reads" note={`older surveys · ${er.yes} yes · ${er.no} no`} />
        )}
      </section>
      <div className="two-col">
        <ChartCard title="Books at home" subtitle="Latest answer per family" table={<DataTable head={["Books at home", "Families"]} rows={bih.map((x) => [BOOKS_IN_HOME_LABEL[x.answer] ?? x.answer, x.families])} />}>
          <BarList data={bih.map((x) => ({ label: BOOKS_IN_HOME_LABEL[x.answer] ?? x.answer, value: x.families, note: bihTotal ? `· ${Math.round((x.families / bihTotal) * 100)}%` : undefined }))} unit="families" />
        </ChartCard>
        <ChartCard
          title="Reading days per week: first vs. latest"
          subtitle="Families who answered at least twice"
          table={<DataTable head={["Answer", "Avg. days / week"]} rows={[["First", ch.first_average ?? "—"], ["Latest", ch.latest_average ?? "—"]]} />}
        >
          {ch.families ? (
            <BarList max={Math.max(5, ch.first_average ?? 0, ch.latest_average ?? 0)} data={[{ label: "First answer", value: ch.first_average ?? 0 }, { label: "Latest answer", value: ch.latest_average ?? 0 }]} unit="days a week" />
          ) : (
            <p className="muted">No families have answered twice yet.</p>
          )}
        </ChartCard>
      </div>
      <div className="two-col">
        <ChartCard
          title="How families heard about Story Garden"
          subtitle="Families can pick more than one"
          table={<DataTable head={["Source", "Families"]} rows={r.surveys.heardAbout.map((h) => [h.label, h.families])} />}
        >
          {r.surveys.heardAbout.length ? (
            <BarList data={r.surveys.heardAbout.map((h) => ({ label: h.label, value: h.families }))} unit="families" />
          ) : (
            <p className="muted">No answers in this range yet.</p>
          )}
        </ChartCard>
        <Comments comments={r.surveys.comments} />
      </div>
    </div>
  );
}

const COMMENT_GROUPS: { key: string; title: string }[] = [
  { key: "other_resources", title: "Asked about community resources" },
  { key: "ideas", title: "Ideas for Story Garden" },
  { key: "why_visit", title: "Why they came" },
  { key: "heard_about_other", title: "Heard about us another way" },
];

/** Latest written answers, grouped, each linking to the family so staff can follow up. */
function Comments({ comments }: { comments: Report["surveys"]["comments"] }) {
  const [group, setGroup] = useState(COMMENT_GROUPS[0].key);
  const rows = comments.filter((c) => c.key === group);
  return (
    <section className="card chart-card">
      <h3>What families told us</h3>
      <div className="segmented wrap" role="group" aria-label="Which answers">
        {COMMENT_GROUPS.map((g) => (
          <button key={g.key} type="button" className={group === g.key ? "on" : ""} aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
            {g.title} ({comments.filter((c) => c.key === g.key).length})
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nothing yet in this range.</p>
      ) : (
        <ul className="plain comments">
          {rows.map((c, i) => (
            <li key={i}>
              <p>“{c.text}”</p>
              <p className="muted small">
                {new Date(c.submittedAt).toLocaleDateString()} · {c.location} ·{" "}
                <a href={`#/family/${c.householdId}`}>{c.cardNumber ?? "family"}</a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
