import { useState } from "react";
import { BookingTopBar } from "./PublicBooking.jsx";
import MemberCard from "../components/MemberCard.jsx";
import TierLadder from "../components/TierLadder.jsx";
import { GoogleMark } from "../components/AccountButton.jsx";
import { useCatalog } from "../data/catalog.js";
import { claimBooking, refreshMe, signIn, signOut, useMember } from "../hooks/useMember.js";
import { perkLines } from "../utils/loyalty.js";

// /account — a renter's rewards: tier card, perks, bookings, and linking a
// booking they made before signing in.

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString()}`;
}

function SignInPanel({ tiers }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <>
      <section className="acct-signin">
        <p className="bk-kicker">S&amp;R Rewards ✦</p>
        <h1 className="bk-title">Your account</h1>
        <p className="bk-sub">
          Sign in with Google to see your tier, keep all your bookings in one place, and get your member price
          automatically when you book.
        </p>
        <button
          type="button"
          className="btn btn--solid acct-google"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await signIn();
            } catch (err) {
              setError(err.message || "Sign-in failed. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <GoogleMark /> {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p className="bk-error">✕ {error}</p>}
        <p className="acct-fine">We only use your name and email. You can still book as a guest anytime.</p>
      </section>
      <TierLadder tiers={tiers} compact />
    </>
  );
}

function ClaimForm() {
  const [ref, setRef] = useState("");
  const [state, setState] = useState({ busy: false, error: null, done: null });
  return (
    <form
      className="acct-claim"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ref.trim()) return;
        setState({ busy: true, error: null, done: null });
        try {
          await claimBooking(ref.trim());
          setState({ busy: false, error: null, done: `Added ${ref.trim().toUpperCase()} to your account.` });
          setRef("");
        } catch (err) {
          setState({ busy: false, error: err.message, done: null });
        }
      }}
    >
      <label htmlFor="claim-ref" className="acct-claim__label">
        Booked before you signed in? Add it with its reference code — it counts toward your tier once completed.
      </label>
      <div className="acct-claim__row">
        <input
          id="claim-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="PUBLIC-…"
          className="bk-input"
          autoComplete="off"
        />
        <button type="submit" className="btn btn--outline" disabled={state.busy || !ref.trim()}>
          {state.busy ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && <p className="bk-error">✕ {state.error}</p>}
      {state.done && <p className="acct-ok">✓ {state.done}</p>}
    </form>
  );
}

export default function Account() {
  const member = useMember();
  const { tiers } = useCatalog();
  const me = member.me;

  let body;
  if (member.status === "off") {
    body = (
      <section className="acct-signin">
        <h1 className="bk-title">Accounts are coming soon</h1>
        <p className="bk-sub">
          You can still book and <a href="/track">track your booking</a> with your reference code.
        </p>
      </section>
    );
  } else if (member.status === "guest") {
    body = <SignInPanel tiers={tiers} />;
  } else if (member.status === "loading" || !me) {
    body = member.error ? (
      <section className="acct-signin">
        <p className="bk-error">✕ {member.error}</p>
        <button type="button" className="btn btn--outline" onClick={refreshMe}>
          Try again
        </button>
      </section>
    ) : (
      <div className="acct-skeleton" aria-busy="true">
        Loading your account…
      </div>
    );
  } else {
    const current = perkLines(me.tier);
    const unlock = me.next ? perkLines(me.next).filter((line) => !current.includes(line)) : [];
    body = (
      <>
        <MemberCard me={me} user={member.user} />

        <section className="acct-section">
          <h2 className="acct-section__title">Your perks</h2>
          {current.length ? (
            <ul className="acct-perks">
              {current.map((line) => (
                <li key={line}>✓ {line}</li>
              ))}
            </ul>
          ) : (
            <p className="acct-muted">Complete rentals to unlock discounts.</p>
          )}
          {me.next && unlock.length > 0 && (
            <div className="acct-unlock">
              <span>{me.next.name} unlocks</span>
              <ul>
                {unlock.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="acct-muted">Applied automatically when you book while signed in.</p>
        </section>

        <section className="acct-section">
          <div className="acct-section__head">
            <h2 className="acct-section__title">Your bookings</h2>
            <a href="/book" className="btn btn--solid btn--sm">
              Book a camera
            </a>
          </div>
          {me.bookings.length === 0 ? (
            <p className="acct-muted">No bookings yet. Your next one will show up here.</p>
          ) : (
            <ul className="acct-bookings">
              {me.bookings.map((b) => (
                <li key={b.ref}>
                  <a href={`/track?ref=${encodeURIComponent(b.ref)}`} className="acct-booking">
                    <div className="acct-booking__main">
                      <strong>{b.camera}</strong>
                      <span>
                        {shortDate(b.pickUpDate)} → {shortDate(b.returnDate)}
                        {b.fee != null && ` · ${peso(b.fee)}`}
                        {b.savings > 0 && <em> · saved {peso(b.savings)}</em>}
                      </span>
                    </div>
                    <span className={`acct-stage acct-stage--${b.stage?.key}`}>{b.stage?.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <ClaimForm />
        </section>

        <section className="acct-section">
          <h2 className="acct-section__title">All tiers</h2>
          <TierLadder tiers={me.tiers} current={me.tier.key} compact />
        </section>

        <div className="acct-foot">
          <span className="acct-muted">Signed in as {me.renter?.email || member.user?.email}</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="bk-page acct-page">
      <BookingTopBar />
      {body}
    </main>
  );
}
