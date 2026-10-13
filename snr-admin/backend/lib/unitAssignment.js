// Which physical unit (serial number) goes to which rental.
//
// The server assigns one automatically when a booking is approved, so staff
// only have to look at the booking (or the Today page) to know which unit to
// prepare. Staff can still swap it by hand until the unit is released.
//
// A unit is busy for a booking when another rental holds it over overlapping
// dates: either an approved rental that has it assigned, or a rental that has
// it out right now (an overdue unit is busy for every date until it is
// marked returned — its return date has already proved wrong).
// Returned, completed, cancelled and rejected rentals never hold a unit.

const RELEASED = new Set(["out_for_delivery", "out"]);

function isReleased(fulfillment) {
  return RELEASED.has(fulfillment ?? null);
}

function parseTime(value, fallback) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return [hour, minute];
}

function toMillis(date, time, fallback) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = parseTime(time, fallback);
  return Date.UTC(y, m - 1, d, hh, mm);
}

/** The rental window, with the same whole-day fallbacks as availability. */
function bookingWindow(b) {
  const start = toMillis(b.PICK_UP_DATE, b.PICK_UP_TIME, [0, 0]);
  const end = toMillis(b.RETURN_DATE, b.RETURN_TIME, [23, 59]);
  return start == null || end == null ? null : { start, end };
}

const sameSerial = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

/** Does `other` hold a unit during `window`? */
function holds(other, window, now) {
  const status = String(other.status || "").toLowerCase();
  const fulfillment = other.FULFILLMENT_STATUS ?? null;
  const released = isReleased(fulfillment);
  if (!released && (status !== "approved" || fulfillment === "returned")) return false;
  const w = bookingWindow(other);
  if (!w) return released; // an out unit with no dates is busy, period
  // Overdue: nobody knows when it comes back, so it's busy until marked returned.
  const end = released && w.end < now ? Infinity : w.end;
  return window.start < end && w.start < window.end;
}

/**
 * The rental already holding `serial` during this booking's dates, if any.
 * `others` are { id, data } for every booking.
 */
function holderOf(serial, booking, id, others, now = Date.now()) {
  const window = bookingWindow(booking);
  return (
    others.find(
      (o) =>
        o.id !== id &&
        sameSerial(o.data.UNIT_SERIAL, serial) &&
        (window ? holds(o.data, window, now) : isReleased(o.data.FULFILLMENT_STATUS)),
    ) || null
  );
}

/**
 * Pick a unit for `booking`: keep its current one if still free, otherwise
 * the free unit that has been idle longest (spreads wear across units).
 * Returns null when every unit is taken for those dates.
 */
function pickSerial(serials, booking, id, others, now = Date.now()) {
  const current = serials.find((s) => sameSerial(s, booking.UNIT_SERIAL));
  if (current && !holderOf(current, booking, id, others, now)) return current;

  const free = serials.filter((s) => !holderOf(s, booking, id, others, now));
  if (free.length === 0) return null;
  const lastUse = (serial) =>
    others
      .filter((o) => o.id !== id && sameSerial(o.data.UNIT_SERIAL, serial))
      .reduce((max, o) => Math.max(max, bookingWindow(o.data)?.end ?? 0), 0);
  // Stable: ties keep the catalogue order.
  return free.map((s, i) => ({ s, i, t: lastUse(s) })).sort((a, b) => a.t - b.t || a.i - b.i)[0].s;
}

module.exports = { bookingWindow, holderOf, pickSerial, isReleased, sameSerial };
