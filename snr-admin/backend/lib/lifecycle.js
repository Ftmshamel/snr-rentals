// The life of a rental, as recorded on a booking. Two fields drive it:
//
//   status              pending → approved → completed   (or rejected / cancelled)
//   FULFILLMENT_STATUS  null → out_for_delivery → out → returned
//
// "out_for_delivery" only happens for delivery bookings (the rider has the
// unit); a pick-up booking goes straight from null to "out" when the renter
// collects it. Moving into out_for_delivery / out is a RELEASE and must name
// the physical unit (UNIT_SERIAL) when the camera has serials. Moving to
// "returned" records the unit's condition (RETURN_CONDITION, RETURN_NOTES).
//
// Every change is appended to TIMELINE by the server ({ at, event, note }),
// so the admin can see when a unit was released, delivered and returned —
// the client never writes TIMELINE itself.

const FULFILLMENT_VALUES = [null, "out_for_delivery", "out", "returned"];
const RETURN_CONDITIONS = ["good", "damaged"];
const RELEASED = new Set(["out_for_delivery", "out"]);

class LifecycleError extends Error {}

function normalizeFulfillment(value) {
  if (value === undefined) return undefined;
  const v = value === null || value === "" ? null : String(value).trim().toLowerCase();
  if (!FULFILLMENT_VALUES.includes(v)) {
    throw new LifecycleError(`Unknown unit status "${value}".`);
  }
  return v;
}

function isReleased(fulfillment) {
  return RELEASED.has(fulfillment);
}

/** Timeline entries for a change from `before` to `after` (booking shapes). */
function timelineEvents(before, after, at) {
  const events = [];
  const serial = after.UNIT_SERIAL ? ` · unit ${after.UNIT_SERIAL}` : "";
  if (after.status !== before.status && after.status) {
    events.push({ at, event: after.status });
  }
  const from = before.FULFILLMENT_STATUS ?? null;
  const to = after.FULFILLMENT_STATUS ?? null;
  if (from !== to) {
    if (to === "out_for_delivery") events.push({ at, event: "out_for_delivery", note: `Out for delivery${serial}` });
    else if (to === "out" && from === "out_for_delivery") events.push({ at, event: "delivered", note: `Delivered to renter${serial}` });
    else if (to === "out") events.push({ at, event: "released", note: `Released to renter${serial}` });
    else if (to === "returned") {
      const cond = after.RETURN_CONDITION === "damaged" ? "damaged" : "good condition";
      const notes = after.RETURN_NOTES ? ` — ${after.RETURN_NOTES}` : "";
      events.push({ at, event: "returned", note: `Returned${serial} (${cond})${notes}` });
    } else if (to === null) events.push({ at, event: "release_undone", note: "Release undone" });
  }
  return events;
}

module.exports = {
  FULFILLMENT_VALUES,
  RETURN_CONDITIONS,
  LifecycleError,
  normalizeFulfillment,
  isReleased,
  timelineEvents,
};
