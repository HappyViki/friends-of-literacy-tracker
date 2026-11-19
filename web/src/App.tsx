// Staff app shell: sign-in gate, location picker, header/nav and routes.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, authClient, clearJwt } from "./auth";
import { Ctx, saveLocationId, savedLocationId, useApp, type AppCtx } from "./context";
import type { Language, Location, Me } from "./types";
import { ErrorBox, Loading, go, toApiError, useRoute } from "./ui";
import { NotStaff, SignIn, VerifyEmail, type SessionUser } from "./pages/Auth";
import { FrontDesk } from "./pages/FrontDesk";
import { Intake } from "./pages/Intake";
import { FamilyPage } from "./pages/Family";
import { GiveBooks } from "./pages/GiveBooks";
import { TakeSurvey } from "./pages/Survey";
import { BooksPage } from "./pages/Books";
import { Reports } from "./pages/Reports";
import { Admin } from "./pages/Admin";

type Gate =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "verify"; user: SessionUser }
  | { state: "notStaff"; user: SessionUser }
  | { state: "error"; error: ApiError; user: SessionUser }
  | { state: "ready"; user: SessionUser; me: Me; locations: Location[]; languages: Language[] };

export function App() {
  const [gate, setGate] = useState<Gate>({ state: "loading" });

  const check = useCallback(async (known?: SessionUser) => {
    setGate({ state: "loading" });
    // A new sign-in or a just-verified email needs a fresh JWT (it carries emailVerified).
    clearJwt();
    let user = known;
    if (!user) {
      try {
        const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
        user = (data?.user as SessionUser | undefined) ?? undefined;
      } catch {
        user = undefined;
      }
    }
    if (!user) return setGate({ state: "signedOut" });
    if (!user.emailVerified) return setGate({ state: "verify", user });
    try {
      const [me, locations, languages] = await Promise.all([
        api<Me>("/api/me"),
        api<Location[]>("/api/locations"),
        api<Language[]>("/api/languages"),
      ]);
      setGate({ state: "ready", user, me, locations, languages });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === "email_not_verified") return setGate({ state: "verify", user });
      if (err.code === "not_staff") return setGate({ state: "notStaff", user });
      if (err.status === 401) return setGate({ state: "signedOut" });
      setGate({ state: "error", error: err, user });
    }
  }, []);

  useEffect(() => void check(), [check]);

  const signOut = useCallback(async () => {
    clearJwt();
    await authClient.signOut().catch(() => {});
    setGate({ state: "signedOut" });
  }, []);

  switch (gate.state) {
    case "loading":
      return (
        <main className="auth-page">
          <Loading label="Opening Little Readers…" />
        </main>
      );
    case "signedOut":
      return <SignIn onSignedIn={(u) => void check(u)} />;
    case "verify":
      // Re-read the session after verifying so the new token says the email is verified.
      return <VerifyEmail user={gate.user} onVerified={() => void check()} onSignOut={signOut} />;
    case "notStaff":
      return <NotStaff email={gate.user.email} onRetry={() => void check()} onSignOut={signOut} />;
    case "error":
      return (
        <main className="auth-page">
          <section className="card auth-card">
            <h2>Couldn't load the app</h2>
            <ErrorBox error={gate.error} onRetry={() => void check()} />
            <button className="link center" onClick={signOut}>
              Sign out
            </button>
          </section>
        </main>
      );
    case "ready":
      return <SignedIn gate={gate} signOut={signOut} />;
  }
}

function SignedIn({ gate, signOut }: { gate: Extract<Gate, { state: "ready" }>; signOut: () => void }) {
  const [locations, setLocations] = useState(gate.locations);
  const active = locations.filter((l) => l.active);
  const [locationId, setLocationId] = useState<number | null>(() => {
    const saved = savedLocationId();
    return saved && active.some((l) => l.id === saved) ? saved : null;
  });
  const location = active.find((l) => l.id === locationId) ?? null;

  const reloadLocations = useCallback(() => {
    api<Location[]>("/api/locations").then(setLocations, () => {});
  }, []);

  if (!location) {
    return (
      <LocationPicker
        locations={active}
        email={gate.me.email}
        onPick={(id) => {
          saveLocationId(id);
          setLocationId(id);
        }}
        onSignOut={signOut}
      />
    );
  }

  const ctx: AppCtx = {
    me: gate.me,
    location,
    locations,
    languages: gate.languages,
    changeLocation: () => {
      saveLocationId(null);
      setLocationId(null);
    },
    reloadLocations,
  };
  return (
    <Ctx.Provider value={ctx}>
      <Shell name={gate.user.name} signOut={signOut} />
    </Ctx.Provider>
  );
}

const TYPE_ICON: Record<Location["type"], string> = { branch: "🏛️", school: "🏫", event: "🎪", other: "📍" };

function LocationPicker({
  locations,
  email,
  onPick,
  onSignOut,
}: {
  locations: Location[];
  email: string;
  onPick: (id: number) => void;
  onSignOut: () => void;
}) {
  return (
    <main className="auth-page">
      <header className="brand-hero">
        <div className="brand-emoji" aria-hidden>
          📍
        </div>
        <h1>Where are you working today?</h1>
        <p>New library cards and book stock use this location. You can change it any time from the header.</p>
      </header>
      {locations.length === 0 ? (
        <section className="card auth-card">
          <p>There are no active locations yet. An admin needs to add one first.</p>
        </section>
      ) : (
        <ul className="location-grid">
          {locations.map((l) => (
            <li key={l.id}>
              <button className="location-tile" onClick={() => onPick(l.id)}>
                <span className="loc-icon" aria-hidden>
                  {TYPE_ICON[l.type]}
                </span>
                <span className="loc-name">{l.name}</span>
                <span className="loc-meta">
                  {l.code} · {l.type}
                  {l.address ? ` · ${l.address}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="center muted">
        Signed in as {email}.{" "}
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </main>
  );
}

const NAV = [
  { path: "", label: "Front desk", icon: "🔎" },
  { path: "intake", label: "New family", icon: "🌼" },
  { path: "books", label: "Books", icon: "📚" },
  { path: "reports", label: "Reports", icon: "📊" },
];

function Shell({ name, signOut }: { name: string; signOut: () => void }) {
  const { me, location, changeLocation } = useApp();
  const route = useRoute();
  const [section] = route;
  const nav = me.role === "admin" ? [...NAV, { path: "admin", label: "Admin", icon: "⚙️" }] : NAV;
  const current = section === "family" ? "" : (section ?? "");

  return (
    <div className="app">
      <header className="topbar">
        <a className="logo" href="#/">
          <img src="/brandmark.png" alt="" width={32} height={32} /> Friends of Literacy
        </a>
        <button className="loc-chip" onClick={changeLocation} title="Change location">
          <span aria-hidden>📍</span> {location.name} <span className="muted">({location.code})</span>
        </button>
        <div className="who">
          <span className="who-name">{name || me.email}</span>
          {me.role === "admin" && <span className="badge">admin</span>}
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Main">
        {nav.map((n) => (
          <a key={n.path} href={`#/${n.path}`} className={current === n.path ? "active" : ""} aria-current={current === n.path ? "page" : undefined}>
            <span aria-hidden>{n.icon}</span> {n.label}
          </a>
        ))}
      </nav>
      <main className="content">
        <Routes route={route} />
      </main>
    </div>
  );
}

function Routes({ route }: { route: string[] }) {
  const [section, a, b, c] = route;
  switch (section) {
    case undefined:
      return <FrontDesk />;
    case "intake":
      return <Intake />;
    case "family":
      if (!a) break;
      if (b === "give") return <GiveBooks householdId={a} />;
      if (b === "survey") return <TakeSurvey householdId={a} surveyKey={c} />;
      return <FamilyPage householdId={a} />;
    case "books":
      return <BooksPage tab={a} arg={b} />;
    case "reports":
      return <Reports />;
    case "admin":
      return <Admin />;
  }
  return (
    <section className="card">
      <h2>Page not found</h2>
      <button className="link" onClick={() => go("/")}>
        Back to the front desk
      </button>
    </section>
  );
}
