// Admins: data export for Excel/Sheets, families missing surveys, contact export, locations, staff accounts, and a read-only view of the surveys.
import { useState, type FormEvent } from "react";
import { api } from "../auth";
import { useApp } from "../context";
import type { Location, StaffMember, Survey } from "../types";
import { ErrorBox, Loading, Notice, PagerBar, fmtDate, toApiError, useAsync, usePager } from "../ui";
import { SurveyCoverage } from "./SurveyCoverage";
import { ExportContacts } from "./ExportContacts";
import { DataExport } from "./DataExport";
import { StaffAccounts } from "./StaffAccounts";

export function Admin() {
  const { me } = useApp();
  if (me.role !== "admin") return <Notice kind="warn">Only admins can open this page.</Notice>;
  return (
    <div className="stack">
      <header className="page-head">
        <h1>⚙️ Admin</h1>
      </header>
      <DataExport />
      <SurveyCoverage />
      <ExportContacts />
      <Locations />
      <StaffAccounts />
      <Surveys />
    </div>
  );
}

function Locations() {
  const { locations, reloadLocations } = useApp();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<Location["type"]>("branch");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [show, setShow] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = locations
    .filter((l) => (show === "all" ? true : show === "active" ? l.active : !l.active))
    .filter((l) => !q || `${l.code} ${l.name} ${l.address ?? ""} ${l.zipCode ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const pager = usePager(shown, { resetKey: `${show}|${q}` });
  const count = (active: boolean) => locations.filter((l) => l.active === active).length;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const l = await api<Location>("/api/locations", { json: { code, name, type, address: address || null, zipCode: zip || null } });
      setMsg(`Added ${l.name} (${l.code}).`);
      setCode("");
      setName("");
      setAddress("");
      setZip("");
      reloadLocations();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(l: Location) {
    setError(null);
    try {
      await api(`/api/locations/${l.id}`, { method: "PATCH", json: { active: !l.active } });
      reloadLocations();
    } catch (err) {
      setError(toApiError(err));
    }
  }

  return (
    <section className="card">
      <h2>📍 Locations</h2>
      <div className="table-tools">
        <div className="segmented small" role="group" aria-label="Which locations">
          {(
            [
              ["active", `Active (${count(true)})`],
              ["inactive", `Inactive (${count(false)})`],
              ["all", `All (${locations.length})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={show === k ? "on" : ""} aria-pressed={show === k} onClick={() => setShow(k)}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search code, name or address" aria-label="Search locations" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((l) => (
              <tr key={l.id} className={l.active ? "" : "inactive"}>
                <td className="mono">{l.code}</td>
                <td>{l.name}</td>
                <td>{l.type}</td>
                <td>{[l.address, l.zipCode].filter(Boolean).join(", ") || <span className="muted">—</span>}</td>
                <td>
                  <button className="link" onClick={() => toggle(l)} title={l.active ? "Deactivate" : "Reactivate"}>
                    {l.active ? "Active · deactivate" : "Inactive · reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted">No locations match.</p>}
      <PagerBar pager={pager} noun="locations" />
      <form className="sub" onSubmit={create}>
        <h3>Add a location</h3>
        <div className="grid4">
          <div>
            <label htmlFor="loc-code">Code</label>
            <input id="loc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))} required minLength={2} placeholder="MID" />
          </div>
          <div>
            <label htmlFor="loc-name">Name</label>
            <input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="loc-type">Type</label>
            <select id="loc-type" value={type} onChange={(e) => setType(e.target.value as Location["type"])}>
              <option value="branch">Library branch</option>
              <option value="school">School</option>
              <option value="event">Event / pop-up</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="loc-zip">ZIP</label>
            <input id="loc-zip" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <label htmlFor="loc-addr">Address</label>
        <input id="loc-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
        <p className="hint">The 2–5 letter code is printed at the start of every library card issued there, so it can't be changed later.</p>
        <ErrorBox error={error} />
        {msg && <Notice kind="ok">{msg}</Notice>}
        <button className="primary" disabled={busy}>
          {busy ? "Adding…" : "Add location"}
        </button>
      </form>
    </section>
  );
}

function Surveys() {
  const surveys = useAsync(() => api<Survey[]>("/api/surveys?all=1"), []);
  const pager = usePager(surveys.data ?? []);
  return (
    <section className="card">
      <h2>📝 Surveys</h2>
      <p className="muted">Read-only. Questions share keys across surveys so reports compare answers over time.</p>
      {surveys.loading && !surveys.data && <Loading />}
      <ErrorBox error={surveys.error} onRetry={surveys.reload} />
      {pager.rows.map((s) => (
        <details key={s.key} className="sub">
          <summary>
            <b>{s.name}</b> <span className="muted mono small">{s.key}</span> {!s.active && <span className="badge">closed</span>}{" "}
            <span className="muted small">· {s.questions.length} questions</span>
          </summary>
          {s.description && <p className="muted">{s.description}</p>}
          <ol>
            {s.questions.map((q) => (
              <li key={q.key}>
                {q.prompt.en} <span className="muted small mono">({q.key}, {q.type}{q.required ? ", required" : ""})</span>
                {q.prompt.es && <div className="muted small" lang="es">{q.prompt.es}</div>}
              </li>
            ))}
          </ol>
        </details>
      ))}
      <PagerBar pager={pager} noun="surveys" />
    </section>
  );
}
