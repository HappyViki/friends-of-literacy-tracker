// Admin: staff accounts. Create accounts with a password (e.g. an intern without a work email),
// reset passwords, change roles, and remove access when someone leaves.
// Accounts and passwords go through Neon Auth's admin API from this browser (the signed-in admin);
// the staff list, roles and blocking go through our API, which keeps Neon Auth in step.
import { useState, type FormEvent } from "react";
import { api, authAdmin } from "../auth";
import { useApp } from "../context";
import type { StaffMember } from "../types";
import { ErrorBox, Loading, Notice, PagerBar, fmtDate, toApiError, useAsync, usePager } from "../ui";

const WORDS = ["maple", "river", "sunny", "robin", "cedar", "lark", "meadow", "story", "puzzle", "comet", "harbor", "willow", "acorn", "pebble", "lantern", "otter"];

/** An easy-to-read temporary password, e.g. "Cedar-Otter-4821". */
function generatePassword() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  return `${cap(WORDS[r[0] % WORDS.length])}-${cap(WORDS[r[1] % WORDS.length])}-${1000 + (r[2] % 9000)}`;
}

const authError = (error: { message?: string; code?: string; status?: number } | null) => {
  if (!error) return null;
  if (error.status === 403 || /not allowed|forbidden|admin/i.test(error.message ?? ""))
    return new Error("Your sign-in account can't manage accounts yet. Reload the page and try again.");
  return new Error(error.message || "Neon Auth refused the request.");
};

type Handoff = { email: string; password: string; name: string };

export function StaffAccounts() {
  const { me } = useApp();
  const staff = useAsync(() => api<StaffMember[]>("/api/staff"), []);
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [resetFor, setResetFor] = useState<StaffMember | null>(null);

  async function save(s: Pick<StaffMember, "email" | "role" | "active">) {
    setBusy(s.email);
    setError(null);
    try {
      await api("/api/staff", { json: { email: s.email, role: s.role, active: s.active } });
      staff.reload();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const rows = (staff.data ?? []).filter((s) => showRemoved || s.active);
  const pager = usePager(rows, { resetKey: showRemoved });
  return (
    <section className="card stack">
      <div className="row spread wrap">
        <h2>👥 Staff accounts</h2>
        <label className="check">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show people whose access was removed
        </label>
      </div>

      <AddAccount
        onAdded={(h) => {
          setHandoff(h);
          staff.reload();
        }}
      />
      {handoff && <HandoffCard {...handoff} onClose={() => setHandoff(null)} />}
      {resetFor && (
        <ResetPassword
          member={resetFor}
          onDone={(h) => {
            setResetFor(null);
            setHandoff(h);
          }}
          onCancel={() => setResetFor(null)}
        />
      )}
      <ErrorBox error={error} />

      {staff.loading && !staff.data ? (
        <Loading />
      ) : staff.error ? (
        <ErrorBox error={staff.error} onRetry={staff.reload} />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Signs in with</th>
                <th>Last active</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((s) => {
                const you = s.email === me.email;
                const hasPassword = s.signIn.includes("credential");
                return (
                  <tr key={s.email} className={s.active ? "" : "inactive"}>
                    <td>
                      <b>{s.name || s.email}</b>
                      {s.name && <div className="muted small">{s.email}</div>}
                      {!s.active && <div className="small">🚫 Access removed</div>}
                    </td>
                    <td>{s.role === "admin" ? "Admin" : "Staff"}</td>
                    <td className="small">
                      {!s.authUserId
                        ? "No account yet"
                        : [hasPassword && "Password", s.signIn.includes("google") && "Google"].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="small">{s.lastActive ? fmtDate(s.lastActive) : "—"}</td>
                    <td className="row-actions">
                      {you ? (
                        <span className="muted small">you</span>
                      ) : s.active ? (
                        <>
                          {hasPassword && (
                            <button className="link" disabled={!!busy} onClick={() => setResetFor(s)}>
                              Reset password
                            </button>
                          )}
                          <button className="link" disabled={!!busy} onClick={() => save({ ...s, role: s.role === "admin" ? "staff" : "admin" })}>
                            Make {s.role === "admin" ? "staff" : "admin"}
                          </button>
                          <button
                            className="link danger"
                            disabled={!!busy}
                            onClick={() => {
                              if (confirm(`Remove ${s.name || s.email}'s access? They'll be signed out everywhere and can't sign in again until you restore it.`))
                                void save({ ...s, active: false });
                            }}
                          >
                            {busy === s.email ? "Removing…" : "Remove access"}
                          </button>
                        </>
                      ) : (
                        <button className="link" disabled={!!busy} onClick={() => save({ ...s, active: true })}>
                          Restore access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PagerBar pager={pager} noun="people" />
        </div>
      )}
      <p className="muted small">
        Removing access takes effect right away: the app stops accepting their sign-in, and their account is blocked so they
        can't sign back in. Their past work (families, giveaways) stays.
      </p>
    </section>
  );
}

function AddAccount({ onAdded }: { onAdded: (h: Handoff) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [method, setMethod] = useState<"password" | "own">("password");
  const [password, setPassword] = useState(generatePassword);
  const [error, setError] = useState<Error | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      let alreadyHadAccount = false;
      if (method === "password") {
        const { error: err } = await authAdmin.createUser({
          email: cleanEmail,
          password,
          name: name.trim() || cleanEmail.split("@")[0],
          role: role === "admin" ? "admin" : "user",
          // An admin vouches for this address, so there's no emailed code to wait for.
          data: { emailVerified: true },
        });
        if (err && !/already exists/i.test(err.message ?? "")) throw authError(err);
        alreadyHadAccount = !!err;
      }
      await api("/api/staff", { json: { email: cleanEmail, role, active: true } });
      if (method === "password" && !alreadyHadAccount) onAdded({ email: cleanEmail, password, name: name.trim() || cleanEmail });
      else if (alreadyHadAccount) setNote(`${cleanEmail} already had an account. They're on the staff list now; use "Reset password" if they need a new one.`);
      else setNote(`${cleanEmail} is on the staff list. They can create an account with that email.`);
      setName("");
      setEmail("");
      setPassword(generatePassword());
      setOpen(false);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="stack">
        {note && <Notice kind="ok">{note}</Notice>}
        <div className="actions">
          <button className="primary" onClick={() => setOpen(true)}>
            + Add a staff member
          </button>
        </div>
      </div>
    );
  return (
    <form className="child" onSubmit={submit}>
      <div className="grid2">
        <div>
          <label htmlFor="sa-name">Name</label>
          <input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Rivera" autoFocus />
        </div>
        <div>
          <label htmlFor="sa-email">Email (their sign-in)</label>
          <input id="sa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="intern@example.org" required />
        </div>
        <div>
          <label htmlFor="sa-role">Role</label>
          <select id="sa-role" value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}>
            <option value="staff">Staff: front desk, books, surveys, reports</option>
            <option value="admin">Admin: also staff accounts, locations and exports</option>
          </select>
        </div>
        <div>
          <label htmlFor="sa-method">How they'll sign in</label>
          <select id="sa-method" value={method} onChange={(e) => setMethod(e.target.value as "password" | "own")}>
            <option value="password">I'll set a password for them</option>
            <option value="own">They'll create their own account</option>
          </select>
        </div>
      </div>
      {method === "password" && (
        <>
          <label htmlFor="sa-pass">Password</label>
          <div className="row">
            <input id="sa-pass" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required className="mono" style={{ flex: 1 }} />
            <button type="button" className="secondary" onClick={() => setPassword(generatePassword())}>
              New one
            </button>
          </div>
          <p className="hint">At least 8 characters. You'll see it once more to hand over; it isn't stored anywhere you can look it up later.</p>
        </>
      )}
      <ErrorBox error={error} />
      {note && <Notice kind="info">{note}</Notice>}
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Adding…" : method === "password" ? "Create account" : "Add to staff list"}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ResetPassword({ member, onDone, onCancel }: { member: StaffMember; onDone: (h: Handoff) => void; onCancel: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authAdmin.setUserPassword({ userId: member.authUserId!, newPassword: password });
      if (err) throw authError(err);
      onDone({ email: member.email, password, name: member.name || member.email });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="child" onSubmit={submit}>
      <h3>Reset password for {member.name || member.email}</h3>
      <label htmlFor="rp-pass">New password</label>
      <div className="row">
        <input id="rp-pass" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required className="mono" style={{ flex: 1 }} />
        <button type="button" className="secondary" onClick={() => setPassword(generatePassword())}>
          New one
        </button>
      </div>
      <p className="hint">Their old password stops working right away.</p>
      <ErrorBox error={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function HandoffCard({ email, password, name, onClose }: Handoff & { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Friends of Literacy staff app\n${window.location.origin}\nEmail: ${email}\nPassword: ${password}`;
  return (
    <Notice kind="ok">
      <p>
        <b>Give these to {name}:</b>
      </p>
      <pre className="mono small">{text}</pre>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="small">This is the only time the password is shown. If it's lost, reset it.</p>
    </Notice>
  );
}
