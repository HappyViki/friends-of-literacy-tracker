// Admin: download a Mailchimp-ready CSV of adults who agreed to be contacted.
import { useState } from "react";
import { ApiError, getJwt } from "../auth";
import { useApp } from "../context";
import { ErrorBox, Notice } from "../ui";

type Channel = "email" | "phone" | "all";
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "email", label: "Email list", hint: "Adults with an email address, for a Mailchimp audience." },
  { key: "phone", label: "Phone list", hint: "Adults with a phone number, for SMS or calls." },
  { key: "all", label: "Everyone", hint: "Adults with an email or a phone number." },
];

export function ExportContacts() {
  const { locations, languages } = useApp();
  const [channel, setChannel] = useState<Channel>("email");
  const [locationId, setLocationId] = useState("");
  const [language, setLanguage] = useState("");
  const [visitedSince, setVisitedSince] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const token = await getJwt();
      if (!token) throw new ApiError("You're signed out. Sign in again.", 401);
      const q = new URLSearchParams({ channel });
      if (locationId) q.set("locationId", locationId);
      if (language) q.set("language", language);
      if (visitedSince) q.set("visitedSince", visitedSince);
      const res = await fetch(`${__API_URL__}/api/exports/contacts?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new ApiError(json.error ?? `Export failed (HTTP ${res.status})`, res.status);
      }
      const count = Number(res.headers.get("X-Row-Count") ?? "0");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "fol-contacts.csv";
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setDone(`Downloaded ${count.toLocaleString()} ${count === 1 ? "contact" : "contacts"} (${name}).`);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>📤 Export contacts</h2>
      <p className="muted">
        A CSV ready to import into Mailchimp (Audience → Import contacts). Only adults who said it's{" "}
        <b>OK to contact</b> them are included. Columns: Email Address, First Name, Last Name, Phone Number, Zip Code, Preferred
        Language, Library Card, Home Location, Children, Last Visit, and Tags (Friends of Literacy, location, language).
      </p>
      <div className="segmented wrap" role="group" aria-label="Which contacts">
        {CHANNELS.map((c) => (
          <button key={c.key} type="button" className={channel === c.key ? "on" : ""} aria-pressed={channel === c.key} onClick={() => setChannel(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="hint">{CHANNELS.find((c) => c.key === channel)!.hint}</p>
      <div className="grid3">
        <div>
          <label htmlFor="ex-loc">Home location</label>
          <select id="ex-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.filter((l) => l.active).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ex-lang">Preferred language</label>
          <select id="ex-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Any language</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ex-since">Visited since</label>
          <input id="ex-since" type="date" value={visitedSince} onChange={(e) => setVisitedSince(e.target.value)} />
        </div>
      </div>
      <ErrorBox error={error} />
      {done && <Notice kind="ok">{done}</Notice>}
      <div className="actions">
        <button className="primary" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "⬇️ Download CSV"}
        </button>
      </div>
      <p className="muted small">The file has personal contact details. Keep it private and delete it after the import.</p>
    </section>
  );
}
