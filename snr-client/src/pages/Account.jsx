import { useState } from "react";
import MemberCard from "../components/MemberCard.jsx";
import TierLadder from "../components/TierLadder.jsx";
import { useCatalog } from "../data/catalog.js";
import { claimBooking, openSignIn, refreshMe, signOut, useMember } from "../hooks/useMember.js";
import { TIER_ICONS, perkLines } from "../utils/loyalty.js";
import MemberShell from "../components/MemberShell.jsx";
import RentalSpotlight, { ACTIVE, greeting, peso, shortDate, spotlightBooking } from "../components/RentalSpotlight.jsx";

// /account — the member dashboard. Guests get a sign-in page that sells the
// tiers; members get their own space: tier card, stats, what's happening
// with their current rental, every booking, perks and the tier ladder.

function SignInPage({ tiers }) {
  return (
    <div className="dash">
      <section className="dash-join">
        <div className="dash-join__copy">
          <p className="bk-kicker">S&amp;R Rewards ✦</p>
          <h1 className="dash-join__title">Rent more. Pay less.</h1>
          <p className="dash-join__lead">
            Sign in and every completed rental moves you up a tier — Silver, Gold, then Platinum. Your
            discount and free add-ons apply to the price automatically when you book.
          </p>
          <ul className="dash-join__points">
            <li>Your details filled in for you — no retyping</li>
            <li>Skip re-uploading IDs after your first rental</li>
            <li>All your bookings and live tracking in one place</li>
          </ul>
          <button type="button" className="btn btn--solid dash-join__google" onClick={openSignIn}>
            Sign in or create an account
          </button>
          <p className="dash-join__fine">Free. We only use your name and email. You can always book as a guest.</p>
        </div>
        <div className="dash-join__ladder">
          <TierLadder tiers={tiers} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat__label">{label}</span>
      <span className="dash-stat__value">{value}</span>
      {sub && <span className="dash-stat__sub">{sub}</span>}
    </div>
  );
}

function BookingsPanel({ bookings }) {
  const [tab, setTab] = useState("active");
  const active = bookings.filter((b) => ACTIVE.has(b.stage?.key));
  const past = bookings.filter((b) => !ACTIVE.has(b.stage?.key));
  const list = tab === "active" ? active : past;
  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2 className="dash-panel__title">My bookings</h2>
        <div className="dash-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "active"} className={tab === "active" ? "is-on" : ""} onClick={() => setTab("active")}>
            Active <span>{active.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "past"} className={tab === "past" ? "is-on" : ""} onClick={() => setTab("past")}>
            History <span>{past.length}</span>
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="dash-muted dash-empty">{tab === "active" ? "Nothing active right now." : "No past rentals yet."}</p>
      ) : (
        <ul className="dash-bookings">
          {list.map((b) => (
            <li key={b.ref}>
              <a href={`/track?ref=${encodeURIComponent(b.ref)}`} className="dash-booking">
                <span className="dash-booking__date">
                  <strong>{shortDate(b.pickUpDate).split(" ")[1]}</strong>
                  <span>{shortDate(b.pickUpDate).split(" ")[0]}</span>
                </span>
                <span className="dash-booking__main">
                  <strong>{b.camera}</strong>
                  <span>
                    {shortDate(b.pickUpDate)} → {shortDate(b.returnDate, true)} · {b.mode === "delivery" ? "Delivery" : "Pick-up"}
                  </span>
                </span>
                <span className="dash-booking__money">
                  {b.fee != null && <strong>{peso(b.fee)}</strong>}
                  {b.savings > 0 && <em>saved {peso(b.savings)}</em>}
                </span>
                <span className={`dash-stage dash-stage--${b.stage?.key}`}>{b.stage?.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClaimForm() {
  const [ref, setRef] = useState("");
  const [state, setState] = useState({ busy: false, error: null, done: null });
  return (
    <form
      className="dash-claim"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ref.trim()) return;
        setState({ busy: true, error: null, done: null });
        try {
          await claimBooking(ref.trim());
          setState({ busy: false, error: null, done: `Added ${ref.trim().toUpperCase()}.` });
          setRef("");
        } catch (err) {
          setState({ busy: false, error: err.message, done: null });
        }
      }}
    >
      <label htmlFor="claim-ref">Booked before you signed in? Add it with its reference code — it counts toward your tier.</label>
      <div className="dash-claim__row">
        <input id="claim-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PUBLIC-…" className="bk-input" autoComplete="off" />
        <button type="submit" className="btn btn--outline btn--sm" disabled={state.busy || !ref.trim()}>
          {state.busy ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && <p className="bk-error">✕ {state.error}</p>}
      {state.done && <p className="dash-ok">✓ {state.done}</p>}
    </form>
  );
}

function Dashboard({ me, user }) {
  const name = (me.renter?.name || user?.name || "there").split(" ")[0];
  const active = me.bookings.filter((b) => ACTIVE.has(b.stage?.key));
  const upNext = spotlightBooking(me.bookings);
  const saved = me.bookings.reduce((s, b) => s + (b.savings || 0), 0);
  const current = perkLines(me.tier);
  const unlock = me.next ? perkLines(me.next).filter((line) => !current.includes(line)) : [];

  return (
    <div className="dash mh-in">
      <section className="dash-hero">
        <div className="dash-hero__left">
          <p className="dash-hero__hello">
            {greeting()}, {name} <span aria-hidden="true">👋</span>
          </p>
          <h1 className="dash-hero__title">My rentals &amp; rewards</h1>
          <MemberCard me={me} user={user} />
        </div>
        <div className="dash-stats">
          <Stat label="Tier" value={`${TIER_ICONS[me.tier.key]} ${me.tier.name}`} sub={me.next ? `${me.toNext} to ${me.next.name}` : "Top tier"} />
          <Stat label="Completed rentals" value={me.completed} sub="count toward your tier" />
          <Stat label="Active bookings" value={active.length} sub={active.length ? "see below" : "none right now"} />
          <Stat label="Saved as a member" value={peso(saved)} sub={me.tier.discountPercent ? `${me.tier.discountPercent}% off every rental` : "discounts start at Silver"} />
        </div>
      </section>

      <div className="dash-main">
        <div className="dash-col">
          <RentalSpotlight booking={upNext} />
          <BookingsPanel bookings={me.bookings} />
        </div>
        <aside className="dash-col">
          <section className={`dash-panel dash-perks tier--${me.tier.key}`}>
            <span className="dash-panel__kicker">Your {me.tier.name} perks</span>
            {current.length ? (
              <ul className="dash-perks__list">
                {current.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Complete rentals to unlock discounts.</p>
            )}
            <p className="dash-perks__auto">Applied automatically when you book signed in.</p>
          </section>
          {me.next && (
            <section className="dash-panel dash-unlock">
              <span className="dash-panel__kicker">
                Next: {TIER_ICONS[me.next.key]} {me.next.name}
              </span>
              <p className="dash-unlock__count">
                <strong>{me.toNext}</strong> more completed rental{me.toNext === 1 ? "" : "s"}
              </p>
              {unlock.length > 0 && (
                <ul>
                  {unlock.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="dash-panel">
            <span className="dash-panel__kicker">Link a past booking</span>
            <ClaimForm />
          </section>
        </aside>
      </div>

      <section className="dash-tiers">
        <h2 className="dash-panel__title">All tiers</h2>
        <TierLadder tiers={me.tiers} current={me.tier.key} />
      </section>

      <p className="dash-signedin">
        Signed in as {me.renter?.email || user?.email} ·{" "}
        <button type="button" className="dash-top__out" onClick={() => signOut().then(() => window.location.assign("/"))}>
          Sign out
        </button>
      </p>
    </div>
  );
}

export default function Account() {
  const member = useMember();
  const { tiers } = useCatalog();

  let body;
  if (member.status === "off") {
    body = (
      <div className="dash dash-center">
        <h1 className="dash-join__title">Accounts are coming soon</h1>
        <p className="dash-muted">
          You can still book and <a href="/track">track your booking</a> with your reference code.
        </p>
      </div>
    );
  } else if (member.status === "guest") {
    body = <SignInPage tiers={tiers} />;
  } else if (member.status === "loading" || !member.me) {
    body = member.error ? (
      <div className="dash dash-center">
        <p className="bk-error">✕ {member.error}</p>
        <button type="button" className="btn btn--outline" onClick={refreshMe}>
          Try again
        </button>
      </div>
    ) : (
      <div className="dash" aria-busy="true" aria-label="Loading your dashboard">
        <div className="dash-hero">
          <div className="mh-skel mh-skel--card" />
          <div className="mh-skel mh-skel--card" />
        </div>
        <div className="dash-main">
          <div className="mh-skel mh-skel--card" />
          <div className="mh-skel mh-skel--card" />
        </div>
      </div>
    );
  } else {
    body = <Dashboard me={member.me} user={member.user} />;
  }

  return <MemberShell member={member}>{body}</MemberShell>;
}
