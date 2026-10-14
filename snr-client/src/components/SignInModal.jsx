import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  closeSignIn,
  createEmailAccount,
  sendPasswordReset,
  signInErrorMessage,
  signInProviders,
  signInWith,
  signInWithEmail,
  useMember,
  useSignInModal,
} from "../hooks/useMember.js";
import { GoogleMark } from "./AccountButton.jsx";

// One sign-in window for the whole site (rendered once in App). Google,
// Facebook and email + password, whichever are enabled. It stays open with
// "Signing you in…" until the account has loaded, then closes — the page
// behind switches to the member view in one step.

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\//i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="#fff"
        d="M13.5 22v-8h2.7l.4-3.2h-3.1v-2c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4V14h2.8v8h3.3z"
      />
    </svg>
  );
}

export default function SignInModal() {
  const { open } = useSignInModal();
  const member = useMember();
  const providers = signInProviders();
  const [mode, setMode] = useState("signin"); // signin | create | reset
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(null); // which button is working
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [waiting, setWaiting] = useState(false);

  // Reset whenever it opens.
  useEffect(() => {
    if (open) {
      setMode("signin");
      setError(null);
      setNotice(null);
      setBusy(null);
      setWaiting(false);
    }
  }, [open]);

  // Close once the account is loaded.
  useEffect(() => {
    if (open && waiting && member.status === "member") closeSignIn();
  }, [open, waiting, member.status]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && !waiting && closeSignIn();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, waiting]);

  if (!open) return null;

  async function run(key, fn) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const value = await fn();
      setBusy(null);
      return value !== false;
    } catch (err) {
      setError(signInErrorMessage(err));
      setBusy(null);
      return false;
    }
  }

  async function social(name) {
    // false = popup closed (or redirecting away) — stay on the choices.
    if (await run(name, () => signInWith(name))) setWaiting(true);
  }

  async function submitEmail(e) {
    e.preventDefault();
    if (mode === "reset") {
      const ok = await run("email", () => sendPasswordReset(form.email));
      if (ok) {
        setNotice("Check your email for a link to reset your password.");
        setMode("signin");
      }
      return;
    }
    if (mode === "create" && !form.name.trim()) {
      setError("Enter your name.");
      return;
    }
    const ok = await run("email", () =>
      mode === "create"
        ? createEmailAccount(form.name, form.email, form.password)
        : signInWithEmail(form.email, form.password),
    );
    if (ok) setWaiting(true);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const hasEmail = providers.includes("email");
  const socials = providers.filter((p) => p !== "email");

  return createPortal(
    <div className="signin-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !waiting && closeSignIn()}>
      <div className="signin" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        {!waiting && (
          <button type="button" className="signin__close" aria-label="Close" onClick={closeSignIn}>
            ✕
          </button>
        )}

        {waiting ? (
          <div className="signin__waiting" aria-live="polite">
            <span className="signin__spinner" aria-hidden="true" />
            <p>Signing you in…</p>
            <span>Loading your rewards and bookings</span>
          </div>
        ) : (
          <>
            <p className="signin__kicker">S&amp;R Rentals</p>
            <h2 id="signin-title" className="signin__title">
              {mode === "create" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in"}
            </h2>
            <p className="signin__lead">
              {mode === "reset"
                ? "We'll email you a link to set a new password."
                : "Earn a tier with every completed rental and get your member price automatically."}
            </p>

            {mode !== "reset" && socials.length > 0 && (
              <div className="signin__socials">
                {socials.includes("google") && (
                  <button type="button" className="signin__social" disabled={Boolean(busy)} onClick={() => social("google")}>
                    <GoogleMark /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
                  </button>
                )}
                {socials.includes("facebook") && (
                  <button
                    type="button"
                    className="signin__social signin__social--fb"
                    disabled={Boolean(busy)}
                    onClick={() => social("facebook")}
                  >
                    <FacebookMark /> {busy === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
                  </button>
                )}
              </div>
            )}

            {IN_APP_BROWSER && mode !== "reset" && (
              <p className="signin__hint">
                Google sign-in may not work inside Messenger or Facebook. Use{" "}
                {hasEmail ? "email below" : "Facebook"}, or open this page in Chrome or Safari.
              </p>
            )}

            {hasEmail && (
              <>
                {mode !== "reset" && socials.length > 0 && (
                  <div className="signin__or">
                    <span>or with email</span>
                  </div>
                )}
                <form className="signin__form" onSubmit={submitEmail}>
                  {mode === "create" && (
                    <label>
                      <span>Your name</span>
                      <input className="bk-input" value={form.name} onChange={set("name")} autoComplete="name" required />
                    </label>
                  )}
                  <label>
                    <span>Email</span>
                    <input
                      className="bk-input"
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      autoComplete="email"
                      required
                    />
                  </label>
                  {mode !== "reset" && (
                    <label>
                      <span>Password</span>
                      <input
                        className="bk-input"
                        type="password"
                        value={form.password}
                        onChange={set("password")}
                        autoComplete={mode === "create" ? "new-password" : "current-password"}
                        minLength={6}
                        required
                      />
                    </label>
                  )}
                  <button type="submit" className="btn btn--solid signin__submit" disabled={Boolean(busy)}>
                    {busy === "email"
                      ? "Please wait…"
                      : mode === "create"
                        ? "Create account"
                        : mode === "reset"
                          ? "Send reset link"
                          : "Sign in"}
                  </button>
                </form>
                <div className="signin__links">
                  {mode === "signin" && (
                    <>
                      <button type="button" onClick={() => setMode("create")}>
                        New here? <strong>Create an account</strong>
                      </button>
                      <button type="button" onClick={() => setMode("reset")}>
                        Forgot password?
                      </button>
                    </>
                  )}
                  {mode !== "signin" && (
                    <button type="button" onClick={() => setMode("signin")}>
                      ← Back to sign in
                    </button>
                  )}
                </div>
              </>
            )}

            {error && <p className="bk-error signin__msg">✕ {error}</p>}
            {notice && <p className="signin__ok signin__msg">✓ {notice}</p>}
            <p className="signin__fine">Optional. You can always book as a guest.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
