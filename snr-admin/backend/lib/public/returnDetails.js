const { isFirebase } = require("../sourceName");
const { isRateLimited } = require("./rateLimit");
const { LifecycleError } = require("../lifecycle");
const { findBooking, publicView } = require("./track");

// POST /api/public?action=return-details   body: { ref, returnDetails }
//
// Lets the renter say where the camera should be collected for the return
// ("same as delivery", or a new Lalamove pickup form) until S&R books the
// return Lalamove. Uses the same reference-code credential as tracking.
module.exports = async function returnDetails(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Not available." });
  if (isRateLimited(req, "return-details", 10)) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please try again in a minute." });
  }
  const raw = req.body;
  let body;
  try {
    body = raw && typeof raw === "object" && !Buffer.isBuffer(raw) ? raw : JSON.parse(raw || "{}");
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const booking = await findBooking(body.ref);
  if (!booking) return res.status(404).json({ ok: false, error: "No booking found for that reference code." });
  if (!publicView(booking).canEditReturn) {
    return res.status(400).json({
      ok: false,
      error: "The return pickup can't be changed anymore — please message S&R Rentals.",
    });
  }

  const { updateBookingByResponseId } = require("../firestoreQueries");
  try {
    const updated = await updateBookingByResponseId(booking.responseId, {
      RETURN_DETAILS: body.returnDetails ?? { sameAsDelivery: true },
      _byRenter: true,
    });
    return res.status(200).json({ ok: true, booking: publicView(updated) });
  } catch (err) {
    if (err instanceof LifecycleError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }
};
