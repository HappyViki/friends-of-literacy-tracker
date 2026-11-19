// Admin: which families who visited haven't answered a survey (intake by default).
// Counts families, not visits: one family can visit many times.
import { useState } from "react";
import { api } from "../auth";
import { useApp } from "../context";
import type { Survey } from "../types";
import { ErrorBox, Loading, fmtDate, fmtPhone, plural, useAsync } from "../ui";
import { PRESETS } from "./Reports";

type MissingFamily = {
  householdId: string;
  cardNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  zipCode: string;
  visits: number;
  lastVisitAt: string;
  lastLocation: string;
  lastSurveyAt: string | null;
};
type Coverage = {
  mode: "ever" | "due";
  dueAfterDays: number | null;
  visits: number;
  surveyResponses: number;
  familiesVisited: number;
  familiesSurveyed: number;
  familiesMissing: number;
  coveragePercent: number | null;
  missing: MissingFamily[];
};

const ALL_TIME = { key: "all", label: "All time", range: (): [string, string] => ["", ""] };

export function SurveyCoverage() {
  const { locations } = useApp();
  const presets = [...PRESETS, ALL_TIME];
  const [preset, setPreset] = useState("12m");
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[0].range());
  const [locationId, setLocationId] = useState("");
  const [survey, setSurvey] = useState("intake");

  const surveys = useAsync(() => api<Survey[]>("/api/surveys"), []);
  const data = useAsync(() => {
    const q = new URLSearchParams({ survey });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (locationId) q.set("locationId", locationId);
    return api<Coverage>(`/api/reports/survey-coverage?${q}`);
  }, [from, to, locationId, survey]);

  const surveyName = surveys.data?.find((s) => s.key === survey)?.name ?? survey;
  const d = data.data;

  function downloadCsv() {
    if (!d) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Card", "First name", "Last name", "Email", "Phone", "ZIP", "Visits", "Last visit", "Last location", "Last survey"],
      ...d.missing.map((m) => [m.cardNumber, m.firstName, m.lastName, m.email, m.phone, m.zipCode, m.visits, m.lastVisitAt.slice(0, 10), m.lastLocation, m.lastSurveyAt?.slice(0, 10) ?? ""]),
    ];
    const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `missing-${survey}-survey${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="card stack">
      <h2>📋 Missing surveys</h2>
      <p className="muted">
        Families who came for books in this period and still need the chosen survey: never answered it, or, for the
        returning-visitors survey, not answered recently. Ask them at their next visit, or reach out using the contact
        details below.
      </p>
      <div className="filters" role="group" aria-label="Survey coverage filters">
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
        <select aria-label="Survey" value={survey} onChange={(e) => setSurvey(e.target.value)}>
          {(surveys.data ?? [{ key: "intake", name: "Intake" } as Survey]).map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.filter((l) => l.active).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>

      {d?.mode === "due" && (
        <p className="hint">
          {surveyName} is asked again every {d.dueAfterDays} days, so this lists families who did the first-visit survey and whose
          latest survey is older than that. Families without a first-visit survey show up under that survey instead.
        </p>
      )}
      {data.error && <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.loading && !d && <Loading label="Comparing visits and surveys…" />}
      {d && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-value">{d.visits.toLocaleString()}</span>
              <span className="kpi-label">Visits</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{d.surveyResponses.toLocaleString()}</span>
              <span className="kpi-label">{surveyName} surveys taken</span>
              <span className="kpi-note">in this period</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{d.familiesVisited.toLocaleString()}</span>
              <span className="kpi-label">{d.mode === "due" ? "Families who visited (first visit done)" : "Families who visited"}</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{d.coveragePercent == null ? "—" : `${d.coveragePercent}%`}</span>
              <span className="kpi-label">{d.mode === "due" ? `Answered within ${d.dueAfterDays} days` : `Have answered ${surveyName}`}</span>
              <span className="kpi-note">{d.familiesSurveyed.toLocaleString()} families</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{d.familiesMissing.toLocaleString()}</span>
              <span className="kpi-label">{d.mode === "due" ? "Families due for it" : "Families missing it"}</span>
            </div>
          </div>

          {d.missing.length === 0 ? (
            <p className="muted">Every family who visited in this period has answered the {surveyName} survey.</p>
          ) : (
            <>
              <div className="actions">
                <button type="button" className="secondary" onClick={downloadCsv}>
                  ⬇️ Download list (CSV)
                </button>
                <span className="muted small">
                  Busiest families first · {plural(d.missing.length, "family", "families")}
                </span>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>Card</th>
                      <th>Contact</th>
                      <th className="num">Visits</th>
                      <th>Last visit</th>
                      <th>Last survey</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.missing.map((m) => (
                      <tr key={m.householdId}>
                        <td>
                          <a href={`#/family/${m.householdId}`}>{[m.firstName, m.lastName].filter(Boolean).join(" ") || "Family"}</a>
                          <div className="muted small">ZIP {m.zipCode}</div>
                        </td>
                        <td className="mono small">{m.cardNumber ?? "—"}</td>
                        <td className="small">
                          {m.phone && <div>{fmtPhone(m.phone)}</div>}
                          {m.email && <div>{m.email}</div>}
                        </td>
                        <td className="num">{m.visits}</td>
                        <td className="small">
                          {fmtDate(m.lastVisitAt)}
                          <div className="muted">{m.lastLocation}</div>
                        </td>
                        <td className="small">{m.lastSurveyAt ? fmtDate(m.lastSurveyAt) : "never"}</td>
                        <td>
                          <a className="button secondary small" href={`#/family/${m.householdId}/survey/${survey}`}>
                            📝 Take survey
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
