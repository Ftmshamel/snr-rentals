import { useState } from "react";
import MemberCard from "../components/MemberCard.jsx";
import TierLadder from "../components/TierLadder.jsx";
import MemberShell from "../components/MemberShell.jsx";
import { ACTIVE, peso, shortDate, time12 } from "../components/RentalSpotlight.jsx";
import { findCamera, useCatalog } from "../data/catalog.js";
import { getCameraAssets } from "../data/assets.js";
import { CONTACT } from "../data/content.js";
import { claimBooking, openSignIn, refreshMe, signOut, useMember } from "../hooks/useMember.js";
import { perkLines } from "../utils/loyalty.js";

// Member pages, each with one job:
//   /account   My rentals — every booking, with its progress and a Track link
//   /rewards   Rewards    — tier card, perks, what's next, all tiers
// (The member home, "/", is pages/MemberHome.jsx.) Guests get a join page.

const STEP_OF = {
  pending: 0,
  reserved: 1,
  out_for_delivery: 1,
  with_renter: 2,
  for_return: 2,
  overdue: 2,
  returned: 3,
  completed: 3,
};
const STEPS = ["Requested", "Approved", "With you", "Returned"];

function SignInPage({ tiers }) {
  return (
    <div className="dash mh-in">
      <section className="dash-join">
        <div className="dash-join__copy">
          <p className="bk-kicker">S&amp;R Rewards</p>
          <h1 className="dash-join__title">Your rentals, in one place.</h1>
          <p className="dash-join__lead">
            Sign in and every completed rental moves you up a tier: Silver, Gold, then Platinum. Your discount and
            free add-ons apply to the price automatically when you book.
          </p>
          <ul className="dash-join__points">
            <li>Your details filled in for you</li>
            <li>Skip re-uploading IDs after your first rental</li>
            <li>All your bookings and live tracking in one place</li>
          </ul>
          <button type="button" className="btn btn--solid dash-join__google" onClick={openSignIn}>
            Sign in or create an account
          </button>
          <p className="dash-join__fine">Free. You can always book as a guest.</p>
        </div>
        <div className="dash-join__ladder">
          <TierLadder tiers={tiers} />
        </div>
      </section>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="dash" aria-busy="true" aria-label="Loading">
      <div className="mh-skel mh-skel--title" />
      <div className="dash-main">
        <div className="mh-skel mh-skel--card" />
        <div className="mh-skel mh-skel--card" />
      </div>
    </div>
  );
}

function PageHead({ kicker, title, children }) {
  return (
    <header className="mp-head">
      <div>
        <p className="dash-panel__kicker">{kicker}</p>
        <h1 className="mp-head__title">{title}</h1>
      </div>
      {children}
    </header>
  );
}

// ── My rentals ───────────────────────────────────────────────────────────────

function RentalCard({ booking, cameras }) {
  const camera = findCamera(cameras, booking.camera);
  const image = getCameraAssets(camera || { name: booking.camera }).image;
  const step = STEP_OF[booking.stage?.key];
  const ended = booking.stage?.key === "cancelled" || booking.stage?.key === "rejected";
  return (
    <article className={`mp-rental ${ended ? "is-ended" : ""} ${booking.stage?.key === "overdue" ? "is-overdue" : ""}`}>
      <div className="mp-rental__art">{image && <img src={image} alt="" loading="lazy" />}</div>
      <div className="mp-rental__body">
        <div className="mp-rental__top">
          <h3>
            {booking.camera}
            {booking.order?.size > 1 && (
              <small className="mp-rental__order">
                Camera {booking.order.index} of {booking.order.size} · ref {booking.order.ref}
              </small>
            )}
          </h3>
          <span className={`dash-stage dash-stage--${booking.stage?.key}`}>{booking.stage?.label}</span>
        </div>
        <p className="mp-rental__when">
          <strong>{shortDate(booking.pickUpDate)}</strong> {time12(booking.pickUpTime)} →{" "}
          <strong>{shortDate(booking.returnDate, true)}</strong> {time12(booking.returnTime)} ·{" "}
          {booking.mode === "delivery" ? "Lalamove delivery" : "Pick-up"}
        </p>
        {booking.unitSerial && (
          <p className="unit-serial unit-serial--sm">
            <span>Your unit · serial no.</span>
            <strong>{booking.unitSerial}</strong>
          </p>
        )}
        {!ended && step != null && (
          <ol className="mp-steps" aria-label="Progress">
            {STEPS.map((label, i) => (
              <li key={label} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
                {label}
              </li>
            ))}
          </ol>
        )}
        <div className="mp-rental__foot">
          <span className="mp-rental__ref">
            Ref {booking.ref}
            {booking.fee != null && <> · {peso(booking.fee)}</>}
            {booking.savings > 0 && <em> · saved {peso(booking.savings)}</em>}
          </span>
          <a href={`/track?ref=${encodeURIComponent(booking.ref)}`} className="btn btn--solid btn--sm">
            {ACTIVE.has(booking.stage?.key) ? "Track →" : "Details"}
          </a>
        </div>
      </div>
    </article>
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
      <label htmlFor="claim-ref">Booked before you signed in? Add it with its reference code and it counts toward your tier.</label>
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

function MyRentals({ me }) {
  const { cameras } = useCatalog();
  const [tab, setTab] = useState("active");
  const active = me.bookings.filter((b) => ACTIVE.has(b.stage?.key));
  const past = me.bookings.filter((b) => !ACTIVE.has(b.stage?.key));
  const list = tab === "active" ? active : past;
  const spent = me.bookings.filter((b) => ["completed", "returned"].includes(b.stage?.key)).reduce((s, b) => s + (b.fee || 0), 0);

  return (
    <div className="dash mh-in">
      <PageHead kicker="Your bookings" title="My rentals">
        <div className="mp-summary">
          <span>
            <strong>{me.bookings.length}</strong> total
          </span>
          <span>
            <strong>{active.length}</strong> active
          </span>
          <span>
            <strong>{me.completed}</strong> completed
          </span>
          <span>
            <strong>{peso(spent)}</strong> spent
          </span>
        </div>
      </PageHead>

      <div className="mp-layout">
        <section className="mp-list">
          <div className="dash-tabs mp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "active"} className={tab === "active" ? "is-on" : ""} onClick={() => setTab("active")}>
              Active <span>{active.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "past"} className={tab === "past" ? "is-on" : ""} onClick={() => setTab("past")}>
              History <span>{past.length}</span>
            </button>
          </div>
          {list.length === 0 ? (
            <div className="dash-panel mp-empty">
              <p>{tab === "active" ? "No active rentals right now." : "No past rentals yet."}</p>
              <a href="/book" className="btn btn--solid btn--sm">
                Book a camera
              </a>
            </div>
          ) : (
            list.map((b) => <RentalCard key={b.ref} booking={b} cameras={cameras} />)
          )}
        </section>
        <aside className="dash-col">
          <section className="dash-panel">
            <span className="dash-panel__kicker">Link a past booking</span>
            <ClaimForm />
          </section>
          <section className="dash-panel mh-help">
            <span className="dash-panel__kicker">Need help with a rental?</span>
            <a href={CONTACT.facebookUrl} target="_blank" rel="noreferrer" className="mh-action">
              <span>✉</span> Message us on Facebook
            </a>
            <a href={CONTACT.phoneHref} className="mh-action">
              <span>☎</span> Call {CONTACT.phone}
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ── Rewards ──────────────────────────────────────────────────────────────────

function Rewards({ me, user }) {
  const current = perkLines(me.tier);
  const unlock = me.next ? perkLines(me.next).filter((line) => !current.includes(line)) : [];
  const saved = me.bookings.reduce((s, b) => s + (b.savings || 0), 0);
  return (
    <div className="dash mh-in">
      <PageHead kicker="S&R Rewards" title="Your rewards" />
      <div className="rw-top">
        <MemberCard me={me} user={user} />
        <div className="rw-facts">
          <div className="dash-stat">
            <span className="dash-stat__label">Saved as a member</span>
            <span className="dash-stat__value">{peso(saved)}</span>
            <span className="dash-stat__sub">{me.tier.discountPercent ? `${me.tier.discountPercent}% off every rental` : "discounts start at Silver"}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__label">Completed rentals</span>
            <span className="dash-stat__value">{me.completed}</span>
            <span className="dash-stat__sub">{me.next ? `${me.toNext} more to ${me.next.name}` : "top tier"}</span>
          </div>
        </div>
      </div>

      <div className="rw-perks">
        <section className={`dash-panel dash-perks tier--${me.tier.key}`}>
          <span className="dash-panel__kicker">
            Your {me.tier.name} perks
          </span>
          <ul className="dash-perks__list">
            {current.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="dash-perks__auto">Applied automatically when you book signed in.</p>
        </section>
        {me.next ? (
          <section className="dash-panel dash-unlock">
            <span className="dash-panel__kicker">
              Unlock at {me.next.name}
            </span>
            <p className="dash-unlock__count">
              <strong>{me.toNext}</strong> more completed rental{me.toNext === 1 ? "" : "s"}
            </p>
            <ul>
              {unlock.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <a href="/book" className="btn btn--solid btn--sm">
              Book your next rental
            </a>
          </section>
        ) : (
          <section className="dash-panel dash-unlock">
            <span className="dash-panel__kicker">Top tier</span>
            <p>You have every perk we offer. Thank you for renting with S&amp;R!</p>
          </section>
        )}
      </div>

      <section className="dash-tiers">
        <h2 className="dash-panel__title">How tiers work</h2>
        <p className="dash-muted">
          A rental counts once it's completed (returned). Cancelled bookings don't count. Your tier's perks are locked
          in when you book.
        </p>
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

// ── Page wrapper ─────────────────────────────────────────────────────────────

function MemberPage({ render }) {
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
  } else if (member.status === "loading") {
    body = <PageSkeleton />;
  } else if (!member.me) {
    body = (
      <div className="dash dash-center">
        <p className="bk-error">✕ {member.error || "Couldn't load your account."}</p>
        <button type="button" className="btn btn--outline" onClick={refreshMe}>
          Try again
        </button>
      </div>
    );
  } else {
    body = render(member);
  }
  return <MemberShell member={member}>{body}</MemberShell>;
}

export default function Account() {
  return <MemberPage render={(m) => <MyRentals me={m.me} />} />;
}

export function RewardsPage() {
  return <MemberPage render={(m) => <Rewards me={m.me} user={m.user} />} />;
}
