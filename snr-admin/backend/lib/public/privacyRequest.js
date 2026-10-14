const { isFirebase } = require("../sourceName");
const { isRateLimited } = require("./rateLimit");
const { findBooking } = require("./track");

// POST /api/public?action=privacy-request
//   { ref, contact, type: "access" | "correction" | "deletion", details }
//
// A renter exercising their rights under the Data Privacy Act (RA 10173):
// a copy of their data, a correction, or erasure. The booking's reference
// code plus the contact number on it are the proof that it is theirs. The
// request is queued for the owner (admin /privacy); nothing is changed here.
const TYPES = new Set(["access", "correction", "deletion"]);
const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);

module.exports = async function privacyRequest(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Not available." });
  if (isRateLimited(req, "privacy-request", 5)) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please try again in a minute." });
  }
  let body = req.body;
  try {
    body = body && typeof body === "object" && !Buffer.isBuffer(body) ? body : JSON.parse(body || "{}");
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }
  const type = String(body.type || "");
  if (!TYPES.has(type)) return res.status(400).json({ ok: false, error: "Choose what you'd like us to do." });
  if (type === "correction" && !String(body.details || "").trim()) {
    return res.status(400).json({ ok: false, error: "Tell us what needs to be corrected." });
  }

  const booking = await findBooking(body.ref);
  const contact = digits(body.contact);
  // Same answer for an unknown code and a wrong number — no guessing which.
  if (!booking || contact.length < 10 || digits(booking.CONTACT_NUMBER) !== contact) {
    return res.status(404).json({
      ok: false,
      error: "We couldn't match that reference code and contact number. Use the number you booked with.",
    });
  }

  const store = require("../firestoreQueries");
  const refs = booking.ORDER_REF
    ? (await store.findBookingsByOrder(booking.ORDER_REF)).map((b) => b.responseId)
    : [booking.responseId];
  const { id } = await store.createPrivacyRequest({ type, ref: booking.responseId, refs, details: body.details });
  return res.status(200).json({ ok: true, id, message: "S&R Rentals will act on it and reply through the contact number on your booking." });
};
