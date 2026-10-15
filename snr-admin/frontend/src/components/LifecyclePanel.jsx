import { useEffect, useState } from "react";
import { findCamera } from "../hooks/useCameras.js";
import LalamoveBox from "./LalamoveBox.jsx";
import LalamoveApiPanel from "./LalamoveApiPanel.jsx";
import { useLalamoveStatus } from "../hooks/useLalamove.js";
import {
  OUT_STAGES,
  StageBadge,
  TIMELINE_LABELS,
  formatStamp,
  getStage,
  isDelivery,
  stepsFor,
} from "../utils/lifecycle.jsx";

// The rental's status, the one action that moves it forward, and its
// timeline. Replaces the old Out / Returned / Cancel toggle, which let staff
// jump to any state and recorded neither the unit nor when it happened.

function Stepper({ booking, stage }) {
  const steps = stepsFor(booking);
  if (stage.step < 0) return null;
  return (
    <ol className="flex items-center gap-1">
      {steps.map((label, i) => {
        const done = i < stage.step || (i === stage.step && stage.key === "completed");
        const current = i === stage.step && stage.key !== "completed";
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={`h-2 w-full rounded-full ${
                done ? "bg-green-600" : current ? "bg-[color:var(--color-ink)]" : "bg-[rgba(58,58,58,0.18)]"
              }`}
            />
            <span
              className={`truncate text-center text-[11px] ${
                current ? "font-bold text-[color:var(--color-black)]" : "text-[color:var(--color-mid-gray,#8f8f8f)]"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Timeline({ entries }) {
  if (!entries?.length) return null;
  return (
    <details className="lp-history">
      <summary>History ({entries.length})</summary>
      <ol className="mt-2 space-y-1.5 border-l-2 border-[rgba(58,58,58,0.2)] pl-3">
        {[...entries].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="text-xs">
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">{formatStamp(e.at)}</span>
            <span className="ml-2 font-semibold text-[color:var(--color-black)]">
              {e.note || TIMELINE_LABELS[e.event] || e.event}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function when(date, time) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (!time) return day;
  const [h, min] = time.split(":").map(Number);
  return `${day}, ${((h + 11) % 12) + 1}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** One plain sentence: what staff should do now. */
function nextStep(stage, booking, delivery) {
  const unit = booking.UNIT_SERIAL ? ` (unit ${booking.UNIT_SERIAL})` : "";
  const out = when(booking.PICK_UP_DATE, booking.PICK_UP_TIME);
  const back = when(booking.RETURN_DATE, booking.RETURN_TIME);
  switch (stage.key) {
    case "pending":
      return "Check the renter's IDs and downpayment below, then approve or reject the request.";
    case "reserved":
    case "release_today":
    case "release_late":
      return delivery
        ? `Prepare the camera${unit} and book the Lalamove for ${out}.`
        : `Prepare the camera${unit} — the renter picks it up ${out}.`;
    case "out_for_delivery":
      return "The rider is on the way. Mark it delivered once the renter has it.";
    case "with_renter":
      return `With the renter until ${back}.${delivery ? " Book the return rider before then." : ""}`;
    case "for_return":
      return `Due back today (${back}). Check the camera when it comes back.`;
    case "overdue":
      return `Overdue — it was due ${back}. Contact the renter.`;
    case "returned":
      return "Back in the shop. Complete the rental once payments are settled.";
    case "completed":
      return "Done — this rental is complete.";
    default:
      return null;
  }
}

/** The physical unit, big and readable — the thing staff hand over. */
function UnitCard({ stage, booking, serials, serial, busy, onPick }) {
  const [changing, setChanging] = useState(false);
  const beforeRelease = ["reserved", "release_today", "release_late"].includes(stage.key);
  if (serials.length === 0 && !booking.UNIT_SERIAL) {
    return beforeRelease ? (
      <div className="lp-unit lp-unit--empty">
        <span className="lp-unit__label">Unit to hand over</span>
        <p className="text-xs">
          This camera has no serial numbers yet. Owner: open <strong>Catalog</strong> and press{" "}
          <strong>Generate serial numbers</strong>.
        </p>
      </div>
    ) : null;
  }
  const label = beforeRelease
    ? "Unit to hand over"
    : ["returned", "completed"].includes(stage.key)
      ? "Unit returned"
      : stage.key === "pending"
        ? "Unit"
        : "Unit with the renter";
  return (
    <div className={`lp-unit ${booking.RETURN_CONDITION === "damaged" ? "lp-unit--damaged" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="lp-unit__label">{label}</span>
          <div className="lp-unit__serial">{booking.UNIT_SERIAL || "Not assigned yet"}</div>
          <span className="lp-unit__camera">{booking.PREFERRED_CAMERA}</span>
        </div>
        {booking.RETURN_CONDITION && (
          <span className={`lp-unit__cond ${booking.RETURN_CONDITION === "damaged" ? "is-bad" : ""}`}>
            {booking.RETURN_CONDITION === "damaged" ? "Damaged" : "Good condition"}
          </span>
        )}
        {beforeRelease && serials.length > 0 && (
          <button type="button" className="lp-unit__change" onClick={() => setChanging((c) => !c)}>
            {changing ? "Done" : booking.UNIT_SERIAL ? "Change unit" : "Pick a unit"}
          </button>
        )}
      </div>
      {stage.key === "pending" && serials.length > 0 && (
        <p className="lp-unit__hint">A free unit is assigned automatically when you approve.</p>
      )}
      {beforeRelease && booking.UNIT_SERIAL && !changing && (
        <p className="lp-unit__hint">Picked automatically for these dates. Write this serial on the contract.</p>
      )}
      {beforeRelease && serials.length > 0 && !booking.UNIT_SERIAL && !changing && (
        <button type="button" disabled={busy} onClick={() => onPick("auto")} className="ui-btn ui-btn--sm mt-2 w-full">
          Assign a unit automatically
        </button>
      )}
      {beforeRelease && changing && (
        <select
          value={serial}
          disabled={busy}
          onChange={(e) => {
            onPick(e.target.value || "auto");
            setChanging(false);
          }}
          className="ui-input ui-input--sm mt-2"
        >
          <option value="">— let the system pick —</option>
          {serials.map((u) => (
            <option key={u.serial} value={u.serial}>
              {u.serial}
              {u.note ? ` · ${u.note}` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function LifecyclePanel({ booking, cameras, onPatch, onReplace }) {
  const stage = getStage(booking);
  const delivery = isDelivery(booking);
  const camera = findCamera(cameras, booking.PREFERRED_CAMERA);
  const serials = (camera?.serials || []).filter((u) => u.active !== false);
  const [serial, setSerial] = useState(booking.UNIT_SERIAL || "");
  // The server assigns a unit on approval (and may move it when dates change).
  useEffect(() => setSerial(booking.UNIT_SERIAL || ""), [booking.UNIT_SERIAL]);
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [deliveryLink, setDeliveryLink] = useState(booking.LALAMOVE_DELIVERY_LINK || "");
  const [returnLink, setReturnLink] = useState(booking.LALAMOVE_RETURN_LINK || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Lalamove API when the backend has a key + shop location, unless staff
  // choose to book by hand this time.
  const llm = useLalamoveStatus();
  const [manual, setManual] = useState(false);
  const apiMode = delivery && llm.ready && !manual;
  const deliveryOrderActive = ["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"].includes(booking.LALAMOVE_DELIVERY_ORDER?.status);
  const manualToggle = llm.ready && delivery && (
    <button
      type="button"
      onClick={() => setManual((m) => !m)}
      className="font-mono text-[10px] font-bold underline text-[color:var(--color-dark-gray)]"
    >
      {manual ? "Use the Lalamove API instead" : "Book manually instead"}
    </button>
  );

  async function run(patch, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await onPatch(patch);
    } catch (e) {
      setError(e.message || "Could not update the booking.");
    } finally {
      setBusy(false);
    }
  }

  const releaseLabel = delivery ? "Out for delivery" : "Release to renter";
  const released = OUT_STAGES.has(stage.key);
  const canCancel = !released && !["completed", "cancelled", "rejected", "returned"].includes(stage.key);

  return (
    <section className="ui-surface space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="lp-title">Rental status</span>
        <StageBadge booking={booking} />
      </div>

      <Stepper booking={booking} stage={stage} />

      {nextStep(stage, booking, delivery) && (
        <div className="lp-next">
          <span className="lp-next__label">Next step</span>
          <p>{nextStep(stage, booking, delivery)}</p>
        </div>
      )}

      <UnitCard
        stage={stage}
        booking={booking}
        serials={serials}
        serial={serial}
        busy={busy}
        onPick={(value) => {
          setSerial(value === "auto" ? "" : value);
          // Saved straight away so the Today page shows the right unit.
          run({ UNIT_SERIAL: value });
        }}
      />
      {booking.RETURN_NOTES && (
        <p className="text-xs text-[color:var(--color-dark-gray)]">Return notes: {booking.RETURN_NOTES}</p>
      )}

      {/* The next step */}
      {stage.key === "pending" && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run({ status: "approved" })} className="ui-btn ui-btn--sm ui-btn--solid flex-1">
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ status: "rejected" }, "Reject this booking request?")}
            className="ui-btn ui-btn--sm ui-btn--danger flex-1"
          >
            Reject
          </button>
        </div>
      )}

      {["reserved", "release_today", "release_late"].includes(stage.key) && (
        <div className="space-y-2">
          {apiMode ? (
            <LalamoveApiPanel
              booking={booking}
              kind="delivery"
              serial={serial || null}
              needsSerial={serials.length > 0 && !serial}
              env={llm.env}
              onBooking={onReplace}
            />
          ) : (
            delivery && <LalamoveBox booking={booking} kind="delivery" link={deliveryLink} onLinkChange={setDeliveryLink} busy={busy} />
          )}
          {manualToggle}
          {!apiMode && (
            <button
              type="button"
              disabled={busy || (serials.length > 0 && !serial)}
              onClick={() =>
                run({
                  FULFILLMENT_STATUS: delivery ? "out_for_delivery" : "out",
                  UNIT_SERIAL: serial || null,
                  ...(delivery && deliveryLink.trim() ? { LALAMOVE_DELIVERY_LINK: deliveryLink.trim() } : {}),
                })
              }
              className="ui-btn ui-btn--sm ui-btn--solid w-full disabled:opacity-50"
            >
              {releaseLabel}
            </button>
          )}
        </div>
      )}

      {stage.key === "out_for_delivery" &&
        (booking.LALAMOVE_DELIVERY_ORDER?.orderId ? (
          <LalamoveApiPanel booking={booking} kind="delivery" env={llm.env} onBooking={onReplace} />
        ) : (
          <LalamoveBox
            booking={booking}
            kind="delivery"
            link={deliveryLink}
            onLinkChange={setDeliveryLink}
            onSaveLink={() => run({ LALAMOVE_DELIVERY_LINK: deliveryLink.trim() })}
            busy={busy}
          />
        ))}

      {stage.key === "out_for_delivery" && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run({ FULFILLMENT_STATUS: "out" })} className="ui-btn ui-btn--sm ui-btn--solid flex-1">
            Mark delivered
          </button>
          {/* With a live Lalamove order, cancel the order instead (it undoes the release). */}
          {!deliveryOrderActive && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ FULFILLMENT_STATUS: null }, "Undo the release? The unit goes back to the shop.")}
              className="ui-btn ui-btn--sm"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {["with_renter", "for_return", "overdue"].includes(stage.key) && delivery && (apiMode || booking.LALAMOVE_RETURN_ORDER?.orderId) && !manual && (
        <LalamoveApiPanel booking={booking} kind="return" env={llm.env} onBooking={onReplace} />
      )}
      {["with_renter", "for_return", "overdue"].includes(stage.key) && delivery && (
        <div>{manualToggle}</div>
      )}

      {["with_renter", "for_return", "overdue"].includes(stage.key) && delivery && !(apiMode || booking.LALAMOVE_RETURN_ORDER?.orderId) && (
        <LalamoveBox
          booking={booking}
          kind="return"
          link={returnLink}
          onLinkChange={setReturnLink}
          onSaveLink={() => run({ LALAMOVE_RETURN_LINK: returnLink.trim() })}
          busy={busy}
        />
      )}

      {["with_renter", "for_return", "overdue"].includes(stage.key) && (
        <div className="space-y-2">
          <div className="ui-label">Check the unit on return</div>
          <div className="flex gap-2">
            {[
              ["good", "Good condition"],
              ["damaged", "Damaged"],
            ].map(([value, label]) => (
              <label
                key={value}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  condition === value
                    ? value === "damaged"
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-green-600 bg-green-600 text-white"
                    : "border-[color:var(--color-border)]"
                }`}
              >
                <input type="radio" className="sr-only" checked={condition === value} onChange={() => setCondition(value)} />
                {label}
              </label>
            ))}
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={condition === "damaged" ? "What's damaged? (required)" : "Notes (optional)"}
            className="ui-input text-xs"
          />
          <button
            type="button"
            disabled={busy || (condition === "damaged" && !notes.trim())}
            onClick={() => run({ FULFILLMENT_STATUS: "returned", RETURN_CONDITION: condition, RETURN_NOTES: notes })}
            className="ui-btn ui-btn--sm ui-btn--solid w-full disabled:opacity-50"
          >
            Mark returned
          </button>
        </div>
      )}

      {stage.key === "returned" && (
        <button type="button" disabled={busy} onClick={() => run({ status: "completed" })} className="ui-btn ui-btn--sm ui-btn--solid w-full">
          Complete rental
        </button>
      )}

      {error && <p className="font-mono text-xs font-bold text-rose-600">{error}</p>}

      {canCancel && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ status: "cancelled" }, "Cancel this booking? This can't be undone.")}
          className="text-xs font-bold text-rose-600 hover:underline"
        >
          Cancel booking
        </button>
      )}

      <Timeline entries={booking.TIMELINE} />
    </section>
  );
}
