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
  lalamove_api_booked: "Lalamove rider booked",
  lalamove_api_return_booked: "Lalamove return pickup booked",
  lalamove_status: null, // shown with its own note (rider name, plate)
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

function riderView(order) {
  if (!order?.orderId) return null;
  return {
    status: order.statusLabel || order.status,
    rider: order.driver?.name || null,
    plate: order.driver?.plateNumber || null,
    // For the map: the rider's position and the trip's two ends.
    location: order.driver?.location ? { lat: order.driver.location.lat, lng: order.driver.location.lng } : null,
    // Coordinates only — the stop labels carry contact names.
    route: order.route
      ? {
          from: { lat: order.route.from.lat, lng: order.route.from.lng },
          to: { lat: order.route.to.lat, lng: order.route.to.lng },
        }
      : null,
    active: ["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"].includes(order.status),
  };
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
    // The physical unit, once it has actually been handed over — the
    // renter's proof of which camera they had (before release it can change).
    unitSerial: ["out_for_delivery", "out", "returned"].includes(b.FULFILLMENT_STATUS) ? b.UNIT_SERIAL || null : null,
    firstName: firstName(b.FULL_NAME),
    camera: b.PREFERRED_CAMERA,
    mode: delivery ? "delivery" : "pickup",
    pickUpDate: b.PICK_UP_DATE,
    pickUpTime: b.PICK_UP_TIME,
    returnDate: b.RETURN_DATE,
    returnTime: b.RETURN_TIME,
    stage,
    timeline: (b.TIMELINE || [])
      .filter((e) => e.event in PUBLIC_EVENTS)
      .map((e) => ({ at: e.at, label: PUBLIC_EVENTS[e.event] || e.note || e.event })),
    lalamove: {
      deliveryLink: b.LALAMOVE_DELIVERY_LINK || null,
      returnLink: b.LALAMOVE_RETURN_LINK || null,
      // API orders: live status and the rider (name + plate only).
      delivery: riderView(b.LALAMOVE_DELIVERY_ORDER),
      return: riderView(b.LALAMOVE_RETURN_ORDER),
    },
    // The renter may still change where the camera is collected from until
    // the return Lalamove is booked.
    returnDetails: delivery ? b.RETURN_DETAILS || { sameAsDelivery: true } : null,
    deliveryAddress: delivery ? b.DELIVERY_DETAILS?.address || null : null,
    canEditReturn: returnOpen,
  };
}

/** The other cameras booked with this one (same reference code). */
async function orderView(booking) {
  const { findBookingsByOrder } = require("../firestoreQueries");
  const items = await findBookingsByOrder(booking.ORDER_REF);
  return {
    reference: booking.ORDER_REF,
    size: booking.ORDER_SIZE || items.length,
    items: items.map((b) => {
      const v = publicView(b);
      return { reference: v.reference, camera: v.camera, stage: v.stage, unitSerial: v.unitSerial, current: b.responseId === booking.responseId };
    }),
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
  let booking = await findBooking(query.ref);
  if (!booking) {
    return res.status(404).json({ ok: false, error: "No booking found for that reference code." });
  }
  // Refresh any active Lalamove order so the renter sees the rider's status.
  const { syncActive } = require("../lalamoveBookings");
  booking = (await syncActive(booking.responseId).catch(() => null)) || booking;
  const view = publicView(booking);
  // A multi-camera order: any of its codes shows every camera in it.
  if (booking.ORDER_REF) view.order = await orderView(booking);
  return res.status(200).json({ ok: true, booking: view });
};

module.exports.findBooking = findBooking;
module.exports.publicView = publicView;
module.exports.publicStage = publicStage;
