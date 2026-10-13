const lalamove = require("./lalamove");
const { SHOP, shopReady } = require("./shop");
const { LifecycleError, isReleased } = require("./lifecycle");
const { isDeliveryMode } = require("./delivery");
const store = require("./firestoreQueries");

// Booking Lalamove riders for a rental, through the API.
//
//   delivery  shop → renter. Booking it IS the release: the unit (serial) is
//             released as "out for delivery" first, then the order is placed;
//             if Lalamove refuses, the release is undone.
//   return    renter → shop. Booked while the renter has the camera.
//
// The booking keeps a summary of each order (LALAMOVE_DELIVERY_ORDER /
// LALAMOVE_RETURN_ORDER, server-written) and the share link in
// LALAMOVE_DELIVERY_LINK / LALAMOVE_RETURN_LINK, which the renter sees on
// /track. sync() pulls the latest status from Lalamove: a completed delivery
// marks the unit delivered; a completed return does NOT mark it returned —
// staff still check the unit's condition first.

const ORDER_FIELD = { delivery: "LALAMOVE_DELIVERY_ORDER", return: "LALAMOVE_RETURN_ORDER" };
const LINK_FIELD = { delivery: "LALAMOVE_DELIVERY_LINK", return: "LALAMOVE_RETURN_LINK" };
const STATUS_LABEL = {
  ASSIGNING_DRIVER: "Looking for a rider",
  ON_GOING: "Rider on the way to pick up",
  PICKED_UP: "Rider picked up the camera",
  COMPLETED: "Dropped off",
  CANCELED: "Cancelled",
  REJECTED: "Rejected by Lalamove",
  EXPIRED: "Expired — no rider found",
};
const SYNC_EVERY_MS = 30_000;

function assertKind(kind) {
  if (kind !== "delivery" && kind !== "return") throw new LifecycleError('kind must be "delivery" or "return".');
}

function renterStop(booking, kind) {
  const d = booking.DELIVERY_DETAILS;
  const r = booking.RETURN_DETAILS;
  const s = kind === "return" && r && r.sameAsDelivery === false ? r : d;
  if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) {
    throw new LifecycleError("This booking has no map pin from the renter — book the Lalamove manually.");
  }
  return s;
}

function riderNote(booking, s, kind) {
  return [
    s.landmark && `Landmark: ${s.landmark}`,
    s.notes,
    kind === "return" ? `Camera return to S&R Rentals` : `Camera rental from S&R Rentals`,
    `Ref ${booking.responseId}`,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);
}

/** Pick-up, drop-off and who to call at each end, for one leg. */
function legFor(booking, kind) {
  if (!shopReady()) {
    throw new LifecycleError("The shop's map location isn't set (SHOP_LAT / SHOP_LNG / SHOP_ADDRESS).");
  }
  const s = renterStop(booking, kind);
  const shop = { lat: SHOP.lat, lng: SHOP.lng, address: SHOP.address };
  const renter = { lat: s.lat, lng: s.lng, address: s.address };
  return kind === "delivery"
    ? {
        from: shop,
        to: renter,
        sender: { name: SHOP.name, phone: SHOP.phone },
        recipient: { name: s.recipientName, phone: s.recipientPhone, remarks: riderNote(booking, s, kind) },
      }
    : {
        from: renter,
        to: shop,
        sender: { name: s.recipientName, phone: s.recipientPhone },
        recipient: { name: SHOP.name, phone: SHOP.phone, remarks: riderNote(booking, s, kind) },
      };
}

async function load(responseId) {
  const booking = await store.findBookingByResponseId(responseId);
  if (!booking) throw new LifecycleError("Booking not found.");
  if (!isDeliveryMode(booking.PREFERRED_MODE)) throw new LifecycleError("This is a pick-up booking — no Lalamove needed.");
  return booking;
}

function activeOrder(booking, kind) {
  const o = booking[ORDER_FIELD[kind]];
  return o && !lalamove.FAILED.has(o.status) && o.status !== "COMPLETED" ? o : null;
}

/** Price only — nothing is booked. */
async function quoteLeg(responseId, kind) {
  assertKind(kind);
  const booking = await load(responseId);
  const leg = legFor(booking, kind);
  const q = await lalamove.quote(leg.from, leg.to);
  return { total: q.total, currency: q.currency, serviceType: q.serviceType, expiresAt: q.expiresAt };
}

async function bookLeg(responseId, kind, { serial } = {}) {
  assertKind(kind);
  let booking = await load(responseId);
  if (activeOrder(booking, kind)) throw new LifecycleError("A Lalamove order is already active for this — refresh or cancel it first.");
  const leg = legFor(booking, kind);
  const fs = booking.FULFILLMENT_STATUS ?? null;

  if (kind === "delivery") {
    if (isReleased(fs) || fs === "returned") throw new LifecycleError("This unit was already released.");
    // Release first: this runs every lifecycle check (approved, serial, unit not out elsewhere).
    booking = await store.updateBookingByResponseId(responseId, {
      FULFILLMENT_STATUS: "out_for_delivery",
      UNIT_SERIAL: serial ?? booking.UNIT_SERIAL ?? null,
    });
  } else if (fs !== "out") {
    throw new LifecycleError("Book the return once the renter has the camera.");
  }

  let order;
  try {
    const q = await lalamove.quote(leg.from, leg.to);
    order = await lalamove.placeOrder(q, leg.sender, leg.recipient, { ref: responseId, leg: kind });
  } catch (err) {
    if (kind === "delivery") {
      await store.updateBookingByResponseId(responseId, { FULFILLMENT_STATUS: null }).catch(() => {});
    }
    throw err;
  }

  const at = new Date().toISOString();
  return store.updateBookingByResponseId(
    responseId,
    {
      [ORDER_FIELD[kind]]: {
        ...order,
        statusLabel: STATUS_LABEL[order.status] || order.status,
        route: routeOf(leg),
        bookedAt: at,
        syncedAt: at,
      },
      [LINK_FIELD[kind]]: order.shareLink || null,
    },
    {
      internal: true,
      events: [
        {
          at,
          event: kind === "delivery" ? "lalamove_api_booked" : "lalamove_api_return_booked",
          note: `Lalamove ${kind === "delivery" ? "delivery" : "return pickup"} booked via API · ₱${order.total} · order ${order.orderId}`,
        },
      ],
    },
  );
}

/** The two ends of a leg, for the map on the admin and the Track page. */
function routeOf(leg) {
  const pt = (p, label) => ({ lat: Number(p.lat), lng: Number(p.lng), label });
  return {
    from: pt(leg.from, leg.sender.name),
    to: pt(leg.to, leg.recipient.name),
  };
}

/** Store a new order state on the booking and move the rental along with it. */
async function applyOrderState(responseId, kind, booking, prev, state) {
  const at = new Date().toISOString();
  const label = (STATUS_LABEL[state.status] || state.status) + (state.simulated ? " (simulated)" : "");
  const next = {
    ...prev,
    status: state.status,
    statusLabel: label,
    shareLink: state.shareLink || prev.shareLink || null,
    driverId: state.driverId || prev.driverId || "",
    driver: state.driver ?? prev.driver ?? null,
    simulated: Boolean(state.simulated || prev.simulated),
    route: state.route || prev.route || null,
    syncedAt: at,
  };
  const fields = { [ORDER_FIELD[kind]]: next };
  if (next.shareLink && next.shareLink !== booking[LINK_FIELD[kind]]) fields[LINK_FIELD[kind]] = next.shareLink;

  const events = [];
  if (state.status !== prev.status) {
    const d = next.driver;
    const who = d?.name ? ` (${d.name}${d.plateNumber ? `, ${d.plateNumber}` : ""})` : "";
    events.push({ at, event: "lalamove_status", note: `Lalamove ${kind}: ${label}${who}` });
  }
  // A delivered delivery is the hand-over: the unit is now with the renter.
  if (kind === "delivery" && state.status === "COMPLETED" && booking.FULFILLMENT_STATUS === "out_for_delivery") {
    fields.FULFILLMENT_STATUS = "out";
  }
  return store.updateBookingByResponseId(responseId, fields, { internal: true, events });
}

/** Pull the latest status from Lalamove and move the rental along with it. */
async function syncLeg(responseId, kind, { force = false } = {}) {
  assertKind(kind);
  const booking = await load(responseId);
  const prev = booking[ORDER_FIELD[kind]];
  if (!prev?.orderId) return booking;
  // A simulated order is driven by "Simulate next step" only, never by Lalamove.
  if (prev.simulated) return booking;
  if (!force && prev.syncedAt && Date.now() - Date.parse(prev.syncedAt) < SYNC_EVERY_MS) return booking;
  if (prev.status === "COMPLETED" || lalamove.FAILED.has(prev.status)) return booking;

  const order = await lalamove.getOrder(prev.orderId);
  let driver = prev.driver || null;
  // Re-read the rider while the order is moving, so their position stays current.
  if (order.driverId && (order.driverId !== prev.driverId || lalamove.ACTIVE.has(order.status))) {
    driver = await lalamove.getDriver(order.orderId, order.driverId).catch(() => driver);
  }
  return applyOrderState(responseId, kind, booking, prev, { ...order, driver });
}

// Sandbox only: Lalamove's sandbox has no riders to accept an order, so for
// demos staff can step a sandbox order through the rider's journey by hand.
// Every step is labelled "(simulated)" on the admin, the timeline and the
// renter's Track page, and production never offers it.
const SIM_NEXT = { ASSIGNING_DRIVER: "ON_GOING", ON_GOING: "PICKED_UP", PICKED_UP: "COMPLETED" };
const SIM_DRIVER = { name: "Test Rider (simulated)", phone: "", plateNumber: "SIM 0000" };

async function simulateLeg(responseId, kind) {
  assertKind(kind);
  if (lalamove.config().env === "production") {
    throw new LifecycleError("Simulation is only available with the Lalamove sandbox.");
  }
  const booking = await load(responseId);
  const prev = booking[ORDER_FIELD[kind]];
  const status = prev && SIM_NEXT[prev.status];
  if (!status) throw new LifecycleError("There's no active Lalamove order to move forward.");
  // Place the test rider on the real route: on the way to the pick-up (a
  // short way off it), then at the sender's pin when picked up, then at the
  // recipient's pin when dropped off.
  const route = prev.route || routeOf(legFor(booking, kind));
  const { from, to } = route;
  const spot =
    status === "ON_GOING"
      ? { lat: from.lat + (to.lat - from.lat) * -0.08 + 0.006, lng: from.lng + (to.lng - from.lng) * -0.08 + 0.006 }
      : status === "PICKED_UP"
        ? { lat: from.lat, lng: from.lng }
        : { lat: to.lat, lng: to.lng };
  const round = (n) => Math.round(n * 1e6) / 1e6;
  return applyOrderState(responseId, kind, booking, prev, {
    status,
    route,
    driver: {
      ...(prev.driver?.name ? prev.driver : SIM_DRIVER),
      location: { lat: round(spot.lat), lng: round(spot.lng), updatedAt: new Date().toISOString() },
    },
    driverId: prev.driverId || "simulated",
    simulated: true,
  });
}

async function cancelLeg(responseId, kind) {
  assertKind(kind);
  const booking = await load(responseId);
  const o = activeOrder(booking, kind);
  if (!o) throw new LifecycleError("There's no active Lalamove order to cancel.");
  // A simulated order may already have expired on Lalamove's side.
  await lalamove.cancelOrder(o.orderId).catch((err) => {
    if (!o.simulated) throw err;
  });
  const at = new Date().toISOString();
  const fields = {
    [ORDER_FIELD[kind]]: { ...o, status: "CANCELED", statusLabel: STATUS_LABEL.CANCELED, syncedAt: at },
    [LINK_FIELD[kind]]: null,
  };
  // Cancelling the delivery before hand-over puts the unit back in the shop.
  if (kind === "delivery" && booking.FULFILLMENT_STATUS === "out_for_delivery") fields.FULFILLMENT_STATUS = null;
  return store.updateBookingByResponseId(responseId, fields, {
    internal: true,
    events: [{ at, event: "lalamove_status", note: `Lalamove ${kind} order cancelled` }],
  });
}

/** Keep any active orders on this booking fresh (cheap: throttled per order). */
async function syncActive(responseId) {
  let booking = await store.findBookingByResponseId(responseId);
  if (!booking || !lalamove.isConfigured()) return booking;
  for (const kind of ["delivery", "return"]) {
    if (activeOrder(booking, kind)) booking = await syncLeg(responseId, kind).catch(() => booking);
  }
  return booking;
}

module.exports = { quoteLeg, bookLeg, syncLeg, simulateLeg, cancelLeg, syncActive, STATUS_LABEL };
