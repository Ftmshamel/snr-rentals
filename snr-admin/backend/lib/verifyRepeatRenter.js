const { findBookingByResponseId } = require("./dataSource");
const { normalizeBookingStatus } = require("./statusRules");

// Only bookings the admin already vetted count as proof of identity —
// pending/rejected/cancelled ones never had their documents approved.
// The admin workflow mostly marks units "out"/"returned" (FULFILLMENT_STATUS)
// rather than setting status to completed, so a released unit also counts:
// gear is never handed over without the documents having been checked.
const VERIFIED_STATUSES = new Set(["approved", "completed"]);
const VETTED_FULFILLMENTS = new Set(["out", "returned"]);
const BLOCKED_STATUSES = new Set(["cancelled", "rejected"]);

/**
 * Checks whether a reference code belongs to a past vetted booking. The code
 * alone is the credential (high-entropy, rate-limited at the endpoint). On
 * success it returns the renter's own contact details so the form can prefill
 * them — never their documents.
 */
async function verifyRepeatRenter(ref) {
  const reference = String(ref || "").trim();
  if (!reference) return { verified: false };

  // Use the configured data source instead of querying MongoDB directly.
  // This keeps repeat-renter verification working when DATASOURCE=supabase.
  // Lookups are exact-match, so try the code as typed first, then uppercased
  // as a fallback (public-form codes are stored uppercase, but legacy Google
  // Form response IDs are mixed-case and must not be uppercased).
  let booking = await findBookingByResponseId(reference);
  if (!booking && reference !== reference.toUpperCase()) {
    booking = await findBookingByResponseId(reference.toUpperCase());
  }

  if (!booking) return { verified: false };
  const status = normalizeBookingStatus(booking.status);
  const fulfillment = String(booking.FULFILLMENT_STATUS || "")
    .trim()
    .toLowerCase();
  const vetted =
    VERIFIED_STATUSES.has(status) || VETTED_FULFILLMENTS.has(fulfillment);
  if (BLOCKED_STATUSES.has(status) || !vetted) {
    return { verified: false, reason: "not_approved" };
  }

  return {
    verified: true,
    fullName: String(booking.FULL_NAME || "").trim(),
    facebookName: String(booking.FACEBOOK_ACCOUNT_NAME || "").trim(),
    facebookLink: String(booking.FACEBOOK_PROFILE_LINK || "").trim(),
    address: String(booking.COMPLETE_ADDRESS || "").trim(),
    contactNumber: String(booking.CONTACT_NUMBER || "").trim(),
    responseId: booking.responseId,
  };
}

module.exports = { verifyRepeatRenter };
