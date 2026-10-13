const { isFirebase } = require("../sourceName");
const { isRateLimited } = require("./rateLimit");
const { isDeliveryMode } = require("../delivery");

// GET /api/public?action=track&ref=<reference code>
//
// What a renter may see about their own booking: where it is in the rental
// lifecycle, its timeline, and the Lalamove tracking links. The reference
// code is the credential (high-entropy, rate-limited). Never returns IDs,
// documents, the address or anyone's contact details beyond the renter's
// own first name.

// Timeline events a renter is shown, in their words.
const PUBLIC_EVENTS = {
  submitted: "Booking request received",
  approved: "Booking approved — your slot is reserved",
  rejected: "Booking request declined",
  cancelled: "Booking cancelled",
  lalamove_booked: "Lalamove rider booked",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered to you",
  released: "Picked up",
  return_details: "Return pickup details updated",
  return_booked: "Lalamove return pickup booked",
  returned: "Camera returned",
  completed: "Rental completed — thank you!",
};

function manilaToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Same stages as the admin's utils/lifecycle.jsx getStage, in renter wording. */
function publicStage(b, today = manilaToday()) {
  const status = String(b.status || "").toLowerCase();
  const fs = b.FULFILLMENT_STATUS || null;
  const delivery = isDeliveryMode(b.PREFERRED_MODE);
  if (status === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (status === "rejected") return { key: "rejected", label: "Not approved" };
  if (status === "completed") return { key: "completed", label: "Completed" };
  if (status === "pending" || !status) return { key: "pending", label: "Waiting for approval" };
  if (fs === "returned") return { key: "returned", label: "Returned" };
  if (fs === "out_for_delivery") return { key: "out_for_delivery", label: "Out for delivery" };
  if (fs === "out") {
    if (b.RETURN_DATE && b.RETURN_DATE < today) return { key: "overdue", label: "Return overdue" };
    if (b.RETURN_DATE === today) return { key: "for_return", label: "Due for return today" };
    return { key: "with_renter", label: delivery ? "Delivered — enjoy!" : "Picked up — enjoy!" };
  }
  return { key: "reserved", label: "Approved — slot reserved" };
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function publicView(b) {
  const delivery = isDeliveryMode(b.PREFERRED_MODE);
  const stage = publicStage(b);
  const returnOpen = delivery && !b.LALAMOVE_RETURN_LINK && !["returned", "completed", "cancelled", "rejected"].includes(stage.key);
  return {
    reference: b.responseId,
    firstName: firstName(b.FULL_NAME),
    camera: b.PREFERRED_CAMERA,
    mode: delivery ? "delivery" : "pickup",
    pickUpDate: b.PICK_UP_DATE,
    pickUpTime: b.PICK_UP_TIME,
    returnDate: b.RETURN_DATE,
    returnTime: b.RETURN_TIME,
    stage,
    timeline: (b.TIMELINE || [])
      .filter((e) => PUBLIC_EVENTS[e.event])
      .map((e) => ({ at: e.at, label: PUBLIC_EVENTS[e.event] })),
    lalamove: {
      deliveryLink: b.LALAMOVE_DELIVERY_LINK || null,
      returnLink: b.LALAMOVE_RETURN_LINK || null,
    },
    // The renter may still change where the camera is collected from until
    // the return Lalamove is booked.
    returnDetails: delivery ? b.RETURN_DETAILS || { sameAsDelivery: true } : null,
    deliveryAddress: delivery ? b.DELIVERY_DETAILS?.address || null : null,
    canEditReturn: returnOpen,
  };
}

async function findBooking(ref) {
  const { findBookingByResponseId } = require("../firestoreQueries");
  const code = String(ref || "").trim();
  if (!code) return null;
  return (
    (await findBookingByResponseId(code)) ||
    (code !== code.toUpperCase() ? await findBookingByResponseId(code.toUpperCase()) : null)
  );
}

module.exports = async function track(req, res, query) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!isFirebase()) return res.status(400).json({ ok: false, error: "Tracking is not available." });
  if (isRateLimited(req, "track")) {
    return res.status(429).json({ ok: false, error: "Too many attempts. Please try again in a minute." });
  }
  const booking = await findBooking(query.ref);
  if (!booking) {
    return res.status(404).json({ ok: false, error: "No booking found for that reference code." });
  }
  return res.status(200).json({ ok: true, booking: publicView(booking) });
};

module.exports.findBooking = findBooking;
module.exports.publicView = publicView;
module.exports.publicStage = publicStage;
