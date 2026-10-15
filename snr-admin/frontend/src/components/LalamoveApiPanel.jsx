import { useEffect, useState } from "react";
import { apiPostJson } from "../utils/api.js";
import Icon from "./Icon.jsx";

// Book and follow a Lalamove order through the API (backend/lib/lalamoveBookings.js).
// For a delivery, booking also releases the unit, so a serial must be picked
// first. Status is pulled from Lalamove on open and with "Refresh"; a
// delivered order marks the unit "with renter" by itself.

const ORDER_FIELD = { delivery: "LALAMOVE_DELIVERY_ORDER", return: "LALAMOVE_RETURN_ORDER" };
const ACTIVE = new Set(["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"]);
const TONE = {
  ASSIGNING_DRIVER: "bg-blue-600",
  ON_GOING: "bg-indigo-600",
  PICKED_UP: "bg-amber-500",
  COMPLETED: "bg-green-600",
};

export default function LalamoveApiPanel({ booking, kind, serial, needsSerial, env, onBooking }) {
  const order = booking[ORDER_FIELD[kind]];
  const active = order && ACTIVE.has(order.status);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function act(action, extra = {}) {
    setBusy(action);
    setError(null);
    try {
      const data = await apiPostJson(`/api/lalamove?action=${action}`, { ref: booking.responseId, kind, ...extra });
      if (action === "quote") setQuote(data.quote);
      if (data.booking) {
        onBooking(data.booking);
        setQuote(null);
      }
    } catch (e) {
      setError(e.message || "Lalamove request failed.");
    } finally {
      setBusy(null);
    }
  }

  // Pull the latest status when the booking is opened with an order running.
  useEffect(() => {
    if (active && !order?.simulated) act("sync");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderId]);

  const sandbox = env !== "production";

  return (
    <div className="space-y-2 rounded-[14px] border border-[color:var(--color-ink)] bg-white/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-kicker text-[0.6rem]">Lalamove {kind === "delivery" ? "delivery" : "return pickup"} · API</span>
        {sandbox && (
          <span className="rounded-full border border-amber-500 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-700">
            Sandbox · test only
          </span>
        )}
      </div>

      {order?.orderId && (
        <div className="space-y-1 rounded-[10px] border border-[rgba(58,58,58,0.2)] p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white ${TONE[order.status] || "bg-rose-600"}`}>
              {order.statusLabel || order.status}
            </span>
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              Order {order.orderId} · ₱{Number(order.total || 0).toLocaleString()}
            </span>
            {order.simulated && (
              <span className="rounded-full border border-amber-500 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-700">
                Simulated
              </span>
            )}
          </div>
          {order.driver?.name ? (
            <div>
              Rider: <strong>{order.driver.name}</strong>
              {order.driver.plateNumber && <> · {order.driver.plateNumber}</>}
              {order.driver.phone && (
                <>
                  {" "}
                  · <a href={`tel:${order.driver.phone}`} className="underline">{order.driver.phone}</a>
                </>
              )}
            </div>
          ) : (
            active && <div className="text-[color:var(--color-dark-gray)]">Waiting for a rider to accept…</div>
          )}
          {order.driver?.location && active && (
            <a
              href={`https://www.google.com/maps?q=${order.driver.location.lat},${order.driver.location.lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] font-bold underline"
            >
              Rider location — open in Google Maps
            </a>
          )}
          {kind === "return" && order.status === "COMPLETED" && (
            <div className="font-bold text-orange-700">The rider dropped it at the shop — check the unit and mark it returned below.</div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {order.shareLink && (
              <a href={order.shareLink} target="_blank" rel="noreferrer" className="ui-btn ui-btn--sm">
                Live tracking <Icon name="external" size={13} />
              </a>
            )}
            {active && !order.simulated && (
              <button type="button" disabled={Boolean(busy)} onClick={() => act("sync")} className="ui-btn ui-btn--sm">
                {busy === "sync" ? "Refreshing…" : "Refresh status"}
              </button>
            )}
            {active && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => window.confirm("Cancel this Lalamove order?") && act("cancel")}
                className="ui-btn ui-btn--sm ui-btn--danger"
              >
                Cancel order
              </button>
            )}
          </div>
          {/* Lalamove's sandbox has no riders, so nothing ever accepts a test
              order. For demos, step it through by hand — clearly labelled. */}
          {active && sandbox && (
            <div className="mt-1 rounded-[10px] border border-dashed border-amber-500 p-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act("simulate")}
                className="ui-btn ui-btn--sm w-full"
              >
                {busy === "simulate" ? "Moving…" : "Simulate next step (sandbox demo)"}
              </button>
              <p className="mt-1 font-mono text-[9px] text-amber-800">
                Sandbox has no real riders. This moves the order to the next stage (rider found → picked up →
                dropped off) and labels every step "simulated" — for demos only, never shown in production.
              </p>
            </div>
          )}
        </div>
      )}

      {!active && !(kind === "delivery" && order?.status === "COMPLETED") && (
        <div className="space-y-2">
          {needsSerial && <p className="font-mono text-[10px] font-bold text-rose-600">Pick the unit (serial) above first.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => act("quote")} className="ui-btn ui-btn--sm">
              {busy === "quote" ? "Getting price…" : quote ? "Refresh price" : "Get price"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || needsSerial}
              onClick={() =>
                window.confirm(
                  `Book a Lalamove ${kind === "delivery" ? "delivery" : "return pickup"}${quote ? ` for about ₱${quote.total}` : ""}?` +
                    (sandbox ? "\n\n(Sandbox — no real rider, no charge.)" : "\n\nThis is charged to the Lalamove wallet."),
                ) && act("book", kind === "delivery" ? { serial } : {})
              }
              className="ui-btn ui-btn--sm ui-btn--solid flex-1 disabled:opacity-50"
            >
              {busy === "book" ? "Booking…" : `Book Lalamove${quote ? ` · ₱${quote.total}` : ""}`}
            </button>
          </div>
          {quote && (
            <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              {quote.serviceType} · ₱{quote.total} {quote.currency} — price may change slightly when booked.
            </p>
          )}
          {kind === "delivery" && (
            <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              Booking releases the unit as "out for delivery" and sends the renter's pin, contact and note to Lalamove.
            </p>
          )}
        </div>
      )}

      {error && <p className="font-mono text-xs font-bold text-rose-600">{error}</p>}
    </div>
  );
}
