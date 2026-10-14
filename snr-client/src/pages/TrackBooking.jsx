import { useEffect, useState } from "react";
import { apiGetJson, apiPostJson } from "../utils/api.js";
import { BookingTopBar } from "./PublicBooking.jsx";
import { useMember } from "../hooks/useMember.js";
import { ACTIVE, shortDate, spotlightBooking } from "../components/RentalSpotlight.jsx";
import RiderMap from "../components/RiderMap.jsx";
import DeliveryDetailsForm, { EMPTY_DELIVERY, deliveryMissing } from "../components/DeliveryDetailsForm.jsx";

// /track — a renter looks up their booking by reference code: where it is in
// the rental (approved → out for delivery → delivered → returned), the live
// Lalamove link once S&R books the rider, and where the camera will be
// collected on return (which they can still change until that rider is
// booked). Backed by GET/POST /api/public?action=track|return-details.

function stepsFor(mode) {
  return mode === "delivery"
    ? ["Approved", "Out for delivery", "Delivered", "Returned", "Completed"]
    : ["Approved", "Picked up", "Returned", "Completed"];
}

function stepIndex(stageKey, mode) {
  const d = mode === "delivery";
  switch (stageKey) {
    case "reserved":
      return 0;
    case "out_for_delivery":
      return 1;
    case "with_renter":
    case "for_return":
    case "overdue":
      return d ? 2 : 1;
    case "returned":
      return d ? 3 : 2;
    case "completed":
      return d ? 4 : 3;
    default:
      return -1;
  }
}

function formatDate(iso, time) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (!time) return date;
  const [h, min] = time.split(":").map(Number);
  return `${date}, ${h % 12 || 12}:${String(min || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function formatStamp(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReturnPickup({ booking, onSaved }) {
  const current = booking.returnDetails || { sameAsDelivery: true };
  const [editing, setEditing] = useState(false);
  const [same, setSame] = useState(current.sameAsDelivery !== false);
  const [details, setDetails] = useState(current.sameAsDelivery === false ? { ...EMPTY_DELIVERY, ...current } : EMPTY_DELIVERY);
  const [showErrors, setShowErrors] = useState(false);
  const [state, setState] = useState({ saving: false, error: null });

  async function save() {
    const problem = same ? null : deliveryMissing(details, "Return pickup");
    if (problem) {
      setShowErrors(true);
      setState({ saving: false, error: problem });
      return;
    }
    setState({ saving: true, error: null });
    try {
      const data = await apiPostJson("/api/public?action=return-details", {
        ref: booking.reference,
        returnDetails: same ? { sameAsDelivery: true } : { sameAsDelivery: false, ...details },
      });
      onSaved(data.booking);
      setEditing(false);
      setState({ saving: false, error: null });
    } catch (err) {
      setState({ saving: false, error: err.message || "Couldn't save — please try again." });
    }
  }

  return (
    <section className="bk-track__section">
      <div className="bk-panel-label">Return pickup</div>
      {!editing ? (
        <>
          <p className="bk-track__text">
            {current.sameAsDelivery !== false ? (
              <>
                We'll collect the camera where we delivered it
                {booking.deliveryAddress ? <> — <strong>{booking.deliveryAddress}</strong></> : null}.
              </>
            ) : (
              <>
                We'll collect the camera from <strong>{current.recipientName}</strong> at{" "}
                <strong>{current.address}</strong>.
              </>
            )}
          </p>
          {booking.canEditReturn ? (
            <button type="button" className="btn btn--outline" onClick={() => setEditing(true)}>
              Change return pickup
            </button>
          ) : (
            booking.lalamove.returnLink == null && (
              <p className="bk-track__muted">Need a change? Message S&amp;R Rentals on Facebook.</p>
            )
          )}
        </>
      ) : (
        <div className="bk-stack">
          <div className="bk-repeat__toggle">
            <button type="button" className={`bk-repeat__option ${same ? "is-active" : ""}`} onClick={() => setSame(true)}>
              Same as delivery
            </button>
            <button type="button" className={`bk-repeat__option ${!same ? "is-active" : ""}`} onClick={() => setSame(false)}>
              Different place / person
            </button>
          </div>
          {!same && <DeliveryDetailsForm idPrefix="return" value={details} onChange={setDetails} showErrors={showErrors} />}
          {state.error && <div className="bk-error">✕ {state.error}</div>}
          <div className="bk-track__actions">
            <button type="button" className="btn btn--outline" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn--solid" onClick={save} disabled={state.saving}>
              {state.saving ? "Saving…" : "Save return pickup"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RiderLine({ label, info }) {
  return (
    <p className="bk-track__text bk-track__rider">
      🛵 <strong>{label}:</strong> {info.status}
      {info.rider && (
        <>
          {" "}
          · rider <strong>{info.rider}</strong>
          {info.plate && <> ({info.plate})</>}
        </>
      )}
    </p>
  );
}

function Result({ booking, onUpdated }) {
  const steps = stepsFor(booking.mode);
  const at = stepIndex(booking.stage.key, booking.mode);
  const ended = ["cancelled", "rejected"].includes(booking.stage.key);
  const showDeliveryLink = booking.lalamove.deliveryLink && ["out_for_delivery", "reserved"].includes(booking.stage.key);
  // The delivery rider stays on screen after drop-off (pinned at the renter's
  // address) until a return rider takes over.
  const showDeliveryRider =
    booking.lalamove.delivery &&
    (["out_for_delivery", "reserved"].includes(booking.stage.key) ||
      (["with_renter", "for_return", "overdue"].includes(booking.stage.key) && !booking.lalamove.return));

  return (
    <div className="bk-panel bk-track">
      <div className="bk-track__head">
        <div>
          <div className="bk-panel-label">Hi{booking.firstName ? ` ${booking.firstName}` : ""}! Your booking</div>
          <h2 className="bk-panel__title bk-track__camera">{booking.camera}</h2>
          <p className="bk-track__muted">
            {booking.mode === "delivery" ? "Delivery" : "Pick-up"} {formatDate(booking.pickUpDate, booking.pickUpTime)} → return{" "}
            {formatDate(booking.returnDate, booking.returnTime)}
          </p>
          {booking.unitSerial && (
            <p className="unit-serial">
              <span>Your unit · serial no.</span>
              <strong>{booking.unitSerial}</strong>
            </p>
          )}
        </div>
        <span className={`bk-track__stage bk-track__stage--${booking.stage.key}`}>{booking.stage.label}</span>
      </div>

      {!ended && at >= 0 && (
        <ol className="bk-track__steps">
          {steps.map((label, i) => (
            <li key={label} className={i < at || (i === at && booking.stage.key === "completed") ? "is-done" : i === at ? "is-current" : ""}>
              <span className="bk-track__bar" />
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}
      {booking.stage.key === "pending" && (
        <p className="bk-track__text">
          We're checking your requirements. You'll get a message on Facebook once it's approved.
        </p>
      )}

      {(showDeliveryLink || booking.lalamove.returnLink) && (
        <div className="bk-track__links">
          {showDeliveryLink && (
            <a href={booking.lalamove.deliveryLink} target="_blank" rel="noreferrer" className="btn btn--solid">
              🛵 Track your Lalamove rider
            </a>
          )}
          {booking.lalamove.returnLink && !["returned", "completed"].includes(booking.stage.key) && (
            <a href={booking.lalamove.returnLink} target="_blank" rel="noreferrer" className="btn btn--solid">
              🛵 Track the return rider
            </a>
          )}
        </div>
      )}

      {/* Live rider info when S&R booked through the Lalamove API. */}
      {showDeliveryRider && (
        <>
          <RiderLine label="Delivery" info={booking.lalamove.delivery} />
          {booking.lalamove.delivery.route && (
            <RiderMap kind="delivery" route={booking.lalamove.delivery.route} location={booking.lalamove.delivery.location} />
          )}
        </>
      )}
      {booking.lalamove.return && !["returned", "completed"].includes(booking.stage.key) && (
        <>
          <RiderLine label="Return pickup" info={booking.lalamove.return} />
          {booking.lalamove.return.route && (
            <RiderMap kind="return" route={booking.lalamove.return.route} location={booking.lalamove.return.location} />
          )}
        </>
      )}

      {booking.mode === "delivery" && !ended && booking.stage.key !== "completed" && (
        <ReturnPickup booking={booking} onSaved={onUpdated} />
      )}

      {booking.timeline.length > 0 && (
        <section className="bk-track__section">
          <div className="bk-panel-label">History</div>
          <ol className="bk-track__timeline">
            {[...booking.timeline].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span>{formatStamp(e.at)}</span>
                <strong>{e.label}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default function TrackBooking() {
  const initialRef = new URLSearchParams(window.location.search).get("ref") || "";
  const [ref, setRef] = useState(initialRef);
  const [state, setState] = useState({ loading: false, error: null, booking: null });

  async function lookup(code) {
    const value = String(code || "").trim();
    if (!value) {
      setState({ loading: false, error: "Enter the reference code from your booking.", booking: null });
      return;
    }
    setState({ loading: true, error: null, booking: null });
    try {
      const data = await apiGetJson(`/api/public?action=track&ref=${encodeURIComponent(value)}`);
      setState({ loading: false, error: null, booking: data.booking });
      window.history.replaceState(null, "", `/track?ref=${encodeURIComponent(value)}`);
    } catch (err) {
      setState({ loading: false, error: err.message || "Couldn't find that booking.", booking: null });
    }
  }

  useEffect(() => {
    if (initialRef) lookup(initialRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Members pick from their own bookings; with no code in the link, open the
  // rental that matters now.
  const member = useMember();
  const mine = member.me?.bookings || [];
  const picks = [...mine.filter((b) => ACTIVE.has(b.stage?.key)), ...mine.filter((b) => !ACTIVE.has(b.stage?.key))].slice(0, 6);
  useEffect(() => {
    if (initialRef || !member.me) return;
    const first = spotlightBooking(member.me.bookings);
    if (first) {
      setRef(first.ref);
      lookup(first.ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.me]);
  const current = String(state.booking?.reference || ref || "").toUpperCase();

  return (
    <main className="bk-page">
      <BookingTopBar />
      <header className="bk-head">
        <p className="bk-kicker">Track Booking ✦</p>
        <h1 className="bk-title">Where's my camera?</h1>
        <p className="bk-sub bk-sub--small">
          {picks.length
            ? "Pick one of your bookings, or enter any reference code."
            : "Enter the reference code you got when you booked (e.g. PUBLIC-1760…)."}
        </p>
      </header>

      {picks.length > 0 && (
        <div className="trk-picks" role="list" aria-label="Your bookings">
          {picks.map((b) => (
            <button
              key={b.ref}
              type="button"
              role="listitem"
              className={`trk-pick ${current === String(b.ref).toUpperCase() ? "is-on" : ""}`}
              onClick={() => {
                setRef(b.ref);
                lookup(b.ref);
              }}
            >
              <strong>{b.camera}</strong>
              <span>
                {shortDate(b.pickUpDate)} → {shortDate(b.returnDate)}
              </span>
              <em>{b.stage?.label}</em>
            </button>
          ))}
        </div>
      )}

      <form
        className="bk-track__lookup"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(ref);
        }}
      >
        <input
          className="bk-input"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Reference code"
          aria-label="Reference code"
          autoCapitalize="characters"
        />
        <button type="submit" className="btn btn--solid" disabled={state.loading}>
          {state.loading ? "Checking…" : "Track"}
        </button>
      </form>
      {state.error && <div className="bk-error bk-track__error">✕ {state.error}</div>}
      {state.booking && <Result booking={state.booking} onUpdated={(b) => setState((s) => ({ ...s, booking: b }))} />}
    </main>
  );
}
