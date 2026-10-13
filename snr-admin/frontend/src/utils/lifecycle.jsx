import { todayISOLocal } from "./dateHelpers.js";

// One place that turns a booking's two stored fields — `status` and
// `FULFILLMENT_STATUS` — into the single stage staff actually think in:
//
//   Pending → Reserved → (Out for delivery →) With renter → Returned → Completed
//
// plus date-aware variants ("Deliver today", "Due for return today",
// "Overdue"). Every list, badge and dashboard reads this, so a booking means
// the same thing on every page. The server enforces the same steps
// (backend/lib/firestoreQueries.js applyLifecycle).

export function isDelivery(b) {
  return String(b?.PREFERRED_MODE || "").trim().toLowerCase().startsWith("deliver");
}

const TONES = {
  pending: "border-amber-400 bg-amber-100 text-amber-900",
  reserved: "border-slate-400 bg-slate-100 text-slate-800",
  today: "border-blue-600 bg-blue-600 text-white",
  late: "border-rose-600 bg-rose-600 text-white",
  transit: "border-indigo-600 bg-indigo-600 text-white",
  out: "border-amber-500 bg-amber-500 text-white",
  due: "border-orange-500 bg-orange-500 text-white",
  returned: "border-teal-600 bg-teal-50 text-teal-800",
  done: "border-green-600 bg-green-600 text-white",
  muted: "border-[rgba(58,58,58,0.3)] bg-transparent text-[color:var(--color-dark-gray)]",
};

/**
 * @returns {{ key: string, label: string, tone: string, step: number }}
 *   `step` indexes stepsFor(booking); -1 for pending / rejected / cancelled.
 */
export function getStage(b, today = todayISOLocal()) {
  const status = String(b?.status || "").trim().toLowerCase();
  const fs = b?.FULFILLMENT_STATUS || null;
  const delivery = isDelivery(b);
  const make = (key, label, tone, step) => ({ key, label, tone: TONES[tone], step });

  if (status === "cancelled") return make("cancelled", "Cancelled", "muted", -1);
  if (status === "rejected") return make("rejected", "Rejected", "muted", -1);
  if (status === "completed") return make("completed", "Completed", "done", delivery ? 4 : 3);
  if (status === "pending" || !status) return make("pending", "Waiting for approval", "pending", -1);

  if (fs === "returned") return make("returned", "Returned · close it", "returned", delivery ? 3 : 2);
  if (fs === "out_for_delivery") return make("out_for_delivery", "Out for delivery", "transit", 1);
  if (fs === "out") {
    const step = delivery ? 2 : 1;
    if (b.RETURN_DATE && b.RETURN_DATE < today) return make("overdue", "Overdue return", "late", step);
    if (b.RETURN_DATE === today) return make("for_return", "Due for return today", "due", step);
    return make("with_renter", "With renter", "out", step);
  }
  // approved, not yet released
  if (b.PICK_UP_DATE && b.PICK_UP_DATE < today) {
    return make("release_late", delivery ? "Delivery missed" : "Pickup missed", "late", 0);
  }
  if (b.PICK_UP_DATE === today) {
    return make("release_today", delivery ? "Deliver today" : "Pickup today", "today", 0);
  }
  return make("reserved", "Reserved", "reserved", 0);
}

export function stepsFor(b) {
  return isDelivery(b)
    ? ["Reserved", "Out for delivery", "Delivered", "Returned", "Completed"]
    : ["Reserved", "Picked up", "Returned", "Completed"];
}

/** Stage keys meaning a physical unit is out of the shop. */
export const OUT_STAGES = new Set(["out_for_delivery", "with_renter", "for_return", "overdue"]);

export const TIMELINE_LABELS = {
  submitted: "Booking submitted",
  pending: "Set to pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Rental completed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  released: "Released to renter",
  returned: "Returned",
  release_undone: "Release undone",
};

export function formatStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StageBadge({ booking, className = "" }) {
  const stage = getStage(booking);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${stage.tone} ${className}`}
    >
      {stage.label}
    </span>
  );
}
