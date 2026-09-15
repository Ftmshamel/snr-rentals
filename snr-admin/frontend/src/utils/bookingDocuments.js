import { apiGetJson } from "./api.js";

// GET /api/bookings omits the uploaded document columns — they hold whole images
// as base64 data URLs, which made the list payload tens of MB. Rows from it carry
// `_partial: true`. Use the helpers here to pull the documents for the one booking
// that actually needs them, via GET /api/bookings/:responseId.
//
// These fields are written once at submission and are never touched by PATCH (see
// FIELD_MAP in backend/lib/supabaseQueries.js), so caching them for the session
// cannot go stale.

export const DOCUMENT_FIELDS = [
  "1st_ID",
  "2nd_ID",
  "PROOF_OF_BILLING",
  "SELFIE_HOLDING_YOUR_ID's",
  "PROOF_OF_DOWNPAYMENT",
  "RENTER_E_SIGNATURE",
];

const EMPTY_DOCUMENTS = Object.freeze(
  Object.fromEntries(DOCUMENT_FIELDS.map((key) => [key, []])),
);

/** In-flight and resolved document sets, keyed by responseId. */
const cache = new Map();

export function isPartialBooking(booking) {
  return Boolean(booking && booking._partial);
}

function pickDocuments(booking) {
  return Object.fromEntries(
    DOCUMENT_FIELDS.map((key) => [key, booking?.[key] ?? EMPTY_DOCUMENTS[key]]),
  );
}

/**
 * Fetch the document fields for one booking. Rejects if the record can't be
 * loaded, so callers that write these values onward can fail loudly instead of
 * silently saving a booking with no documents attached.
 * @param {string} responseId
 * @returns {Promise<Record<string, unknown>>}
 */
export function fetchBookingDocuments(responseId) {
  const id = String(responseId || "").trim();
  if (!id) return Promise.reject(new Error("Missing booking reference."));

  if (!cache.has(id)) {
    const pending = apiGetJson(`/api/bookings/${encodeURIComponent(id)}`)
      .then((data) => {
        if (!data.booking) throw new Error("Booking not found.");
        return pickDocuments(data.booking);
      })
      .catch((err) => {
        cache.delete(id); // never cache a failure — allow a retry
        throw err;
      });
    cache.set(id, pending);
  }
  return cache.get(id);
}

/**
 * Resolve a booking to one with its documents attached. Complete bookings — and
 * anything without a reference to fetch by — are returned unchanged.
 * @returns {Promise<object>}
 */
export async function withDocuments(booking) {
  if (!isPartialBooking(booking) || !booking.responseId) return booking;
  const documents = await fetchBookingDocuments(booking.responseId);
  return { ...booking, ...documents, _partial: false };
}

/** Seed the cache from a record already known to be complete. */
export function primeBookingDocuments(booking) {
  if (!booking || isPartialBooking(booking) || !booking.responseId) return;
  cache.set(String(booking.responseId), Promise.resolve(pickDocuments(booking)));
}
