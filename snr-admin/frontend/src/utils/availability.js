import { addDaysLocal, formatISODateLocal, isDateInBookingRange } from "./dateHelpers.js";

// Shared availability maths for the /cameras and /addons inventory pages.
//
// Everything here takes an explicit date because these pages can be pointed at
// any day, past or future — which is why unitsOn() consults `unitHistory`
// rather than trusting the current stock count. See the header of
// data/cameras.js for why that distinction matters.

// A unit is considered committed unless the booking was cancelled or rejected.
// Pending bookings still hold stock — treating them as free is what causes
// double-booking. This matches backend/api/public-availability.js.
//
// Deliberately NOT the same filter Analytics uses: that one also drops
// "pending" because an unapproved booking has earned no revenue. Here an
// unapproved booking still occupies the camera, so it must count. If you unify
// these two lists, one of the two pages becomes wrong.
const INACTIVE_STATUSES = ["cancelled", "rejected"];

export function isActiveBooking(booking) {
  return !INACTIVE_STATUSES.includes(
    (booking.status || "").trim().toLowerCase(),
  );
}

/** Add-on names on a booking, across the field spellings in the data. */
export function getBookingAddOns(booking) {
  const raw =
    booking["Please_choose_your_add-ons"] ||
    booking.Please_choose_your_add_ons ||
    booking.ADDONS ||
    [];
  return Array.isArray(raw) ? raw : [];
}

const same = (a, b) =>
  (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

/**
 * How many units of one item are out on a given date.
 * @param {"camera"|"addon"} kind
 */
export function countInUse(bookings, name, dateIso, kind = "camera") {
  let inUse = 0;
  for (const b of bookings) {
    if (!isActiveBooking(b)) continue;
    if (!isDateInBookingRange(dateIso, b.PICK_UP_DATE, b.RETURN_DATE)) continue;
    const hit =
      kind === "camera"
        ? same(b.PREFERRED_CAMERA, name)
        : getBookingAddOns(b).some((a) => same(a, name));
    if (hit) inUse += 1;
  }
  return inUse;
}

/**
 * Units of an item that existed on a given date. Stock changes over time, so
 * an item can carry a `unitHistory` ([{ before, units }], newest cut-off
 * first); without it the current count applies to every date.
 */
export function unitsOn(item, dateIso) {
  if (!item) return 0;
  if (dateIso && Array.isArray(item.unitHistory)) {
    for (const entry of item.unitHistory) {
      if (dateIso < entry.before) return Number(entry.units) || 0;
    }
  }
  return Number(item.units) || 0;
}

/**
 * Availability for one item on one date.
 * @returns {{units:number, inUse:number, available:number}}
 */
export function availabilityOn(bookings, item, dateIso, kind = "camera") {
  const units = unitsOn(item, dateIso);
  const inUse = countInUse(bookings, item.name, dateIso, kind);
  return { units, inUse, available: Math.max(units - inUse, 0) };
}

/**
 * First date from `fromIso` onward with a free unit, or null if the item stays
 * fully booked for the whole horizon. Only meaningful when it is out today.
 */
export function nextFreeDate(
  bookings,
  item,
  fromIso,
  kind = "camera",
  horizonDays = 60,
) {
  const start = new Date(fromIso + "T00:00:00");
  if (Number.isNaN(start.getTime())) return null;

  for (let offset = 1; offset <= horizonDays; offset++) {
    const iso = formatISODateLocal(addDaysLocal(start, offset));
    // Stock can change within the horizon, so re-read the count per day.
    const units = unitsOn(item, iso);
    if (units > 0 && countInUse(bookings, item.name, iso, kind) < units) {
      return iso;
    }
  }
  return null;
}
