import { useEffect, useState, type FormEvent } from "react";
import { api, authClient } from "./auth";

type Note = { id: number; body: string; createdAt: string };
type User = { id: string; email: string; name: string };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => setUser((data?.user as User | undefined) ?? null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main style={styles.main}>Loading…</main>;
  return (
    <main style={styles.main}>
      <h1>FoL</h1>
      {user ? <Notes user={user} onSignOut={() => setUser(null)} /> : <SignIn onSignedIn={setUser} />}
    </main>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) return setError(result.error.message ?? "Sign-in failed");
    onSignedIn(result.data.user as User);
  }

  return (
    <form onSubmit={submit} style={styles.col}>
      <h2>{mode === "up" ? "Create account" : "Sign in"}</h2>
      <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      <button disabled={pending}>{pending ? "…" : mode === "up" ? "Sign up" : "Sign in"}</button>
      {error && <p style={styles.error}>{error}</p>}
      <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")}>
        {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
      </button>
    </form>
  );
}

function Notes({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Note[]>("/api/notes").then(setNotes, (e) => setError(e.message));
  useEffect(() => void load(), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({ body: draft }) });
      setDraft("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function summarize() {
    setError(null);
    setSummary("Summarizing…");
    try {
      const r = await api<{ summary: string }>("/api/summarize", { method: "POST" });
      setSummary(r.summary);
    } catch (err) {
      setSummary(null);
      setError((err as Error).message);
    }
  }

  return (
    <section style={styles.col}>
      <p>
        Signed in as <b>{user.email}</b>{" "}
        <button onClick={() => authClient.signOut().then(onSignOut)}>Sign out</button>
      </p>
      <form onSubmit={add} style={styles.row}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New note" required style={{ flex: 1 }} />
        <button>Add</button>
      </form>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>{n.body}</li>
        ))}
      </ul>
      <button onClick={summarize} disabled={notes.length === 0}>Summarize with AI</button>
      {summary && <p>{summary}</p>}
      {error && <p style={styles.error}>{error}</p>}
    </section>
  );
}

const styles = {
  main: { fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "2rem auto", padding: "0 16px" },
  col: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8 },
  error: { color: "#b91c1c" },
} as const;
