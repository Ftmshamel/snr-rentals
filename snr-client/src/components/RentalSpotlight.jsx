// The rental that matters right now — what it is, when, and how far along —
// shown on the member Home and the dashboard. Also the date/money helpers
// both pages use.

export const ACTIVE = new Set(["pending", "reserved", "out_for_delivery", "with_renter", "for_return", "overdue"]);
const JOURNEY = [
  { key: "pending", label: "Requested" },
  { key: "reserved", label: "Approved" },
  { key: "out", label: "With you" },
  { key: "returned", label: "Returned" },
];
const JOURNEY_INDEX = {
  pending: 0,
  reserved: 1,
  out_for_delivery: 1,
  with_renter: 2,
  for_return: 2,
  overdue: 2,
  returned: 3,
  completed: 3,
};

export function shortDate(iso, withYear = false) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function weekday(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
}

export function time12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function peso(n) {
  return `₱${Number(n || 0).toLocaleString()}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The rental to spotlight: one that's out (soonest return), else the next pick-up. */
export function spotlightBooking(bookings) {
  const active = bookings.filter((b) => ACTIVE.has(b.stage?.key));
  const out = active.filter((b) => ["with_renter", "for_return", "overdue", "out_for_delivery"].includes(b.stage?.key));
  return (
    [...out].sort((a, b) => String(a.returnDate).localeCompare(String(b.returnDate)))[0] ||
    [...active].sort((a, b) => String(a.pickUpDate).localeCompare(String(b.pickUpDate)))[0] ||
    null
  );
}

export default function RentalSpotlight({ booking }) {
  if (!booking) {
    return (
      <section className="dash-panel dash-upnext dash-upnext--empty">
        <span className="dash-panel__kicker">Up next</span>
        <h2 className="dash-upnext__title">No rental lined up</h2>
        <p className="dash-muted">Planning a trip? Your next booking will show its status right here.</p>
        <a href="/book" className="btn btn--solid">
          Book a camera
        </a>
      </section>
    );
  }
  const step = JOURNEY_INDEX[booking.stage?.key] ?? 0;
  const urgent = booking.stage?.key === "overdue";
  return (
    <section className={`dash-panel dash-upnext ${urgent ? "is-urgent" : ""}`}>
      <div className="dash-upnext__head">
        <span className="dash-panel__kicker">{booking.stage?.key === "pending" ? "Waiting for approval" : "Your current rental"}</span>
        <span className="dash-upnext__badge">{booking.stage?.label}</span>
      </div>
      <h2 className="dash-upnext__title">{booking.camera}</h2>
      {booking.unitSerial && (
        <p className="unit-serial unit-serial--dark">
          <span>Your unit · serial no.</span>
          <strong>{booking.unitSerial}</strong>
        </p>
      )}
      <div className="dash-upnext__dates">
        <div>
          <span>{booking.mode === "delivery" ? "Delivery" : "Pick-up"}</span>
          <strong>
            {weekday(booking.pickUpDate)}, {shortDate(booking.pickUpDate)}
          </strong>
          <em>{time12(booking.pickUpTime)}</em>
        </div>
        <span className="dash-upnext__arrow" aria-hidden="true">
          →
        </span>
        <div>
          <span>Return</span>
          <strong>
            {weekday(booking.returnDate)}, {shortDate(booking.returnDate)}
          </strong>
          <em>{time12(booking.returnTime)}</em>
        </div>
      </div>
      <ol className="dash-journey" aria-label="Rental progress">
        {JOURNEY.map((s, i) => (
          <li key={s.key} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
            <span className="dash-journey__dot">{i < step ? "✓" : i + 1}</span>
            <span className="dash-journey__label">{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="dash-upnext__foot">
        <span className="dash-muted">
          Ref <strong>{booking.ref}</strong>
          {booking.fee != null && ` · ${peso(booking.fee)}`}
          {booking.savings > 0 && <em className="dash-saved"> · saved {peso(booking.savings)}</em>}
        </span>
        <a href={`/track?ref=${encodeURIComponent(booking.ref)}`} className="btn btn--solid btn--sm">
          Track live →
        </a>
      </div>
    </section>
  );
}

