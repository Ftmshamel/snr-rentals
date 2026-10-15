import { useBookings } from "../hooks/useBookings.js";
import { StageBadge } from "./lifecycle.jsx";

// Several cameras booked together on the public site share one reference
// code: each camera is its own booking (own fee, ₱1,000 deposit, serial,
// contract and lifecycle) carrying ORDER_REF / ORDER_SIZE / ORDER_INDEX.
// The first camera's responseId is the code itself; the others are
// "<code>-2", "<code>-3"…

export function isOrder(b) {
  return Boolean(b?.ORDER_REF) && Number(b.ORDER_SIZE) > 1;
}

/** "Camera 2 of 3" — on list rows, so staff see the booking isn't alone. */
export function OrderChip({ booking, small = false }) {
  if (!isOrder(booking)) return null;
  return (
    <span
      title={`One booking of ${booking.ORDER_SIZE} cameras · ref ${booking.ORDER_REF}`}
      className={`inline-flex items-center rounded-full border border-[color:var(--color-ink)] px-2 py-0.5 font-mono font-bold uppercase text-[color:var(--color-ink)] ${
        small ? "text-[9px]" : "text-[10px]"
      }`}
    >
      {booking.ORDER_INDEX || "?"} of {booking.ORDER_SIZE} cameras
    </span>
  );
}

const money = (n) => `₱${Number(n || 0).toLocaleString()}`;

/** The other cameras of this booking's order, in the booking window. */
export function OrderSiblings({ booking }) {
  const { bookings } = useBookings(isOrder(booking) ? "/api/bookings" : null);
  if (!isOrder(booking)) return null;
  const items = bookings
    .filter((b) => b.ORDER_REF === booking.ORDER_REF)
    .sort((a, b) => (a.ORDER_INDEX || 0) - (b.ORDER_INDEX || 0));
  const live = items.filter((b) => !["cancelled", "rejected"].includes(String(b.status).toLowerCase()));
  const fees = live.reduce((sum, b) => sum + (Number(b.RENTAL_FEE) || 0), 0);
  const deposits = live.reduce((sum, b) => sum + (Number(b.SECURITY_DEPOSIT) || 1000), 0);
  return (
    <section className="bm-order">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="ui-kicker">
          Booked together · {booking.ORDER_SIZE} cameras
        </span>
        <span className="font-mono text-xs">{booking.ORDER_REF}</span>
      </div>
      <ul className="bm-order__list">
        {items.map((b) => (
          <li key={b.responseId} className={b.responseId === booking.responseId ? "is-current" : ""}>
            <span className="bm-order__num">{b.ORDER_INDEX}</span>
            <span className="bm-order__cam">
              <strong>{b.PREFERRED_CAMERA}</strong>
              <small>
                {b.responseId}
                {b.UNIT_SERIAL ? ` · ${b.UNIT_SERIAL}` : ""}
              </small>
            </span>
            <StageBadge booking={b} />
          </li>
        ))}
      </ul>
      {live.length > 0 && (
        <p className="bm-order__sum">
          Whole booking: rental {money(fees)} + deposits {money(deposits)} ({live.length} × ₱1,000) ={" "}
          <strong>{money(fees + deposits)}</strong>
        </p>
      )}
      <p className="bm-order__note">
        Each camera is approved, released and returned on its own. With the Lalamove API, one rider
        takes every approved camera of this booking.
      </p>
    </section>
  );
}
