// Delivery details for Lalamove. S&R books the Lalamove itself (from the
// admin), so the renter fills in exactly what a Lalamove booking needs — who
// receives it, the full address, a landmark and a map pin — when they book.
//
//   DELIVERY_DETAILS  { recipientName, recipientPhone, address, landmark, notes, lat, lng }
//   RETURN_DETAILS    { sameAsDelivery: true }
//                   | { sameAsDelivery: false, ...same fields as above }   where to collect it back
//
// Lalamove itself is booked by hand in the Lalamove app; the admin pastes
// the order's tracking link back (LALAMOVE_DELIVERY_LINK / LALAMOVE_RETURN_LINK),
// which the renter then sees on the Track page.

const { LifecycleError } = require("./lifecycle");

// A LifecycleError, so the booking PATCH route already turns it into a 400
// with the message shown to the admin.
class DeliveryError extends LifecycleError {}

const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);

// Roughly the Philippines. A pin outside it is a mistake (or 0,0 from a
// failed geolocation) and would send the rider to the wrong place.
const inPhilippines = (lat, lng) => lat >= 4 && lat <= 22 && lng >= 116 && lng <= 127.5;

function sanitizeDetails(raw, { required = false, label = "Delivery" } = {}) {
  if (raw == null) {
    if (required) throw new DeliveryError(`${label} details are required.`);
    return null;
  }
  if (typeof raw !== "object") throw new DeliveryError(`${label} details are invalid.`);
  const lat = raw.lat === "" || raw.lat == null ? null : Number(raw.lat);
  const lng = raw.lng === "" || raw.lng == null ? null : Number(raw.lng);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  if (hasPin && !inPhilippines(lat, lng)) {
    throw new DeliveryError(`${label}: the map pin is outside the Philippines — please re-pin.`);
  }
  const details = {
    recipientName: clean(raw.recipientName, 120),
    recipientPhone: clean(raw.recipientPhone, 40),
    address: clean(raw.address, 400),
    landmark: clean(raw.landmark, 200),
    notes: clean(raw.notes, 300),
    lat: hasPin ? Math.round(lat * 1e6) / 1e6 : null,
    lng: hasPin ? Math.round(lng * 1e6) / 1e6 : null,
  };
  if (required) {
    if (!details.recipientName) throw new DeliveryError(`${label}: who will receive the camera?`);
    if (!details.recipientPhone) throw new DeliveryError(`${label}: a contact number for the rider is required.`);
    if (!details.address) throw new DeliveryError(`${label}: the complete address is required.`);
    if (!hasPin) throw new DeliveryError(`${label}: drop a pin on the map so the rider finds the exact spot.`);
  }
  return details;
}

function sanitizeReturnDetails(raw, { required = false } = {}) {
  if (raw == null) return required ? { sameAsDelivery: true } : null;
  if (typeof raw !== "object") throw new DeliveryError("Return pickup details are invalid.");
  if (raw.sameAsDelivery !== false) return { sameAsDelivery: true };
  return {
    sameAsDelivery: false,
    ...sanitizeDetails(raw, { required: true, label: "Return pickup" }),
  };
}

/** A Lalamove tracking/share link, or an empty value to clear it. */
function sanitizeLink(raw) {
  const v = clean(raw, 500);
  if (!v) return null;
  let url;
  try {
    url = new URL(v);
  } catch {
    throw new DeliveryError("Paste the full Lalamove tracking link (starting with https://).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DeliveryError("Paste the full Lalamove tracking link (starting with https://).");
  }
  return url.toString();
}

function isDeliveryMode(mode) {
  return String(mode || "").trim().toLowerCase().startsWith("deliver");
}

module.exports = {
  DeliveryError,
  sanitizeDetails,
  sanitizeReturnDetails,
  sanitizeLink,
  isDeliveryMode,
};
