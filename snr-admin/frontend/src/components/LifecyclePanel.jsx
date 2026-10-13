import { useState } from "react";
import { findCamera } from "../hooks/useCameras.js";
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
              className={`truncate text-center font-mono text-[9px] uppercase tracking-wider ${
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
    <div>
      <div className="ui-kicker mb-1.5 text-[0.6rem]">History</div>
      <ol className="space-y-1.5 border-l-2 border-[rgba(58,58,58,0.2)] pl-3">
        {[...entries].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="text-xs">
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">{formatStamp(e.at)}</span>
            <span className="ml-2 font-semibold text-[color:var(--color-black)]">
              {e.note || TIMELINE_LABELS[e.event] || e.event}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function LifecyclePanel({ booking, cameras, onPatch }) {
  const stage = getStage(booking);
  const delivery = isDelivery(booking);
  const camera = findCamera(cameras, booking.PREFERRED_CAMERA);
  const serials = (camera?.serials || []).filter((u) => u.active !== false);
  const [serial, setSerial] = useState(booking.UNIT_SERIAL || "");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
        <span className="ui-kicker">Rental status</span>
        <StageBadge booking={booking} />
      </div>

      <Stepper booking={booking} stage={stage} />

      {booking.UNIT_SERIAL && (
        <p className="font-mono text-[11px] text-[color:var(--color-ink)]">
          Unit: <strong>{booking.UNIT_SERIAL}</strong>
          {booking.RETURN_CONDITION && (
            <span className={booking.RETURN_CONDITION === "damaged" ? "ml-2 font-bold text-rose-600" : "ml-2 text-green-700"}>
              · returned {booking.RETURN_CONDITION === "damaged" ? "DAMAGED" : "in good condition"}
            </span>
          )}
        </p>
      )}
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
          {serials.length > 0 ? (
            <label className="block">
              <span className="ui-label">Unit being handed over (serial no.)</span>
              <select value={serial} onChange={(e) => setSerial(e.target.value)} className="ui-input ui-input--sm">
                <option value="">— pick a unit —</option>
                {serials.map((u) => (
                  <option key={u.serial} value={u.serial}>
                    {u.serial}
                    {u.note ? ` · ${u.note}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              No serial numbers listed for this camera yet — add them on the Catalog page to track each unit.
            </p>
          )}
          <button
            type="button"
            disabled={busy || (serials.length > 0 && !serial)}
            onClick={() => run({ FULFILLMENT_STATUS: delivery ? "out_for_delivery" : "out", UNIT_SERIAL: serial || null })}
            className="ui-btn ui-btn--sm ui-btn--solid w-full disabled:opacity-50"
          >
            {releaseLabel}
          </button>
        </div>
      )}

      {stage.key === "out_for_delivery" && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => run({ FULFILLMENT_STATUS: "out" })} className="ui-btn ui-btn--sm ui-btn--solid flex-1">
            Mark delivered
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ FULFILLMENT_STATUS: null }, "Undo the release? The unit goes back to the shop.")}
            className="ui-btn ui-btn--sm"
          >
            Undo
          </button>
        </div>
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
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-bold ${
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
          className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:underline"
        >
          Cancel booking
        </button>
      )}

      <Timeline entries={booking.TIMELINE} />
    </section>
  );
}
