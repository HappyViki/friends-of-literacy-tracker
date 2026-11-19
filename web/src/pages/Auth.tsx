// Signed-out screens: sign in / create account, verify email with a code, and "not on the staff list".
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient, emailOtp } from "../auth";
import { ErrorBox, Notice } from "../ui";

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <header className="brand-hero">
      <h1>
        <img className="brand-logo" src="/logo.png" alt="Friends of Literacy" width={2402} height={1019} />
      </h1>
      <p>{subtitle}</p>
    </header>
  );
}

export function SignIn({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        const msg = result.error.message ?? "";
        setError(
          /invalid (email or )?password|credentials/i.test(msg)
            ? "That email and password don't match. Check them and try again."
            : /already exists|already registered/i.test(msg)
              ? "There's already an account with this email. Sign in instead."
              : msg || "Sign-in didn't work. Try again.",
        );
        return;
      }
      onSignedIn(result.data!.user as SessionUser);
    } catch {
      setError("Can't reach the sign-in service. Check the internet connection.");
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setPending(true);
    setError(null);
    try {
      // Redirects to Google and back to this page; the app's session check then signs the user in.
      const result = await authClient.signIn.social({ provider: "google", callbackURL: window.location.origin + window.location.pathname });
      if (result?.error) {
        setError(result.error.message || "Google sign-in didn't start. Try again.");
        setPending(false);
      }
    } catch {
      setError("Can't reach the sign-in service. Check the internet connection.");
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <Brand subtitle="Staff and volunteer sign-in" />
      <form className="card auth-card" onSubmit={submit}>
        <h2>{mode === "up" ? "Create your account" : "Sign in"}</h2>
        {mode === "up" && (
          <>
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          required
        />
        {mode === "up" && <p className="hint">At least 8 characters. Use the email your coordinator added to the staff list.</p>}
        <ErrorBox error={error} />
        <button className="primary block" disabled={pending}>
          {pending ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="link center"
          onClick={() => {
            setMode(mode === "up" ? "in" : "up");
            setError(null);
          }}
        >
          {mode === "up" ? "Already have an account? Sign in" : "New volunteer? Create an account"}
        </button>
        <div className="or-divider" role="separator">
          <span>or</span>
        </div>
        <button type="button" className="google block" onClick={google} disabled={pending}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17z" />
            <path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.2z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>
      </form>
    </main>
  );
}

export function VerifyEmail({ user, onVerified, onSignOut }: { user: SessionUser; onVerified: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const autoSent = useRef(false);

  async function send() {
    setError(null);
    setPending(true);
    try {
      const r = await emailOtp.sendVerificationOtp({ email: user.email, type: "email-verification" });
      if (r.error) setError(r.error.message ?? "Couldn't send the code. Try again in a minute.");
      else setSent(true);
    } catch {
      setError("Can't reach the sign-in service. Check the internet connection.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!autoSent.current) {
      autoSent.current = true;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await emailOtp.verifyEmail({ email: user.email, otp: code.trim() });
      if (r.error) {
        setError(/invalid|expired/i.test(r.error.message ?? "") ? "That code didn't work. Check it, or send a new one." : (r.error.message ?? "That code didn't work."));
        return;
      }
      onVerified();
    } catch {
      setError("Can't reach the sign-in service. Check the internet connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <Brand subtitle="One more step" />
      <form className="card auth-card" onSubmit={verify}>
        <h2>Verify your email</h2>
        <p>
          We {sent ? "sent" : "will send"} a 6-digit code to <b>{user.email}</b>. Enter it here to finish signing in.
        </p>
        {sent && <Notice kind="ok">Code sent. It can take a minute to arrive; check spam too.</Notice>}
        <label htmlFor="otp">Verification code</label>
        <input
          id="otp"
          className="otp"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          required
          autoFocus
        />
        <ErrorBox error={error} />
        <button className="primary block" disabled={pending || code.length < 6}>
          {pending ? "Checking…" : "Verify"}
        </button>
        <div className="row spread">
          <button type="button" className="link" onClick={send} disabled={pending}>
            Send a new code
          </button>
          <button type="button" className="link" onClick={onSignOut}>
            Use a different account
          </button>
        </div>
      </form>
    </main>
  );
}

export function NotStaff({ email, onRetry, onSignOut }: { email: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <main className="auth-page">
      <Brand subtitle="Almost there" />
      <section className="card auth-card">
        <h2>You're not on the staff list yet</h2>
        <p>
          You're signed in as <b>{email}</b>, but this email isn't on the Friends of Literacy staff list. Ask your coordinator or an
          admin to add it (Admin → Staff), then try again.
        </p>
        <button className="primary block" onClick={onRetry}>
          I've been added — try again
        </button>
        <button className="link center" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}
