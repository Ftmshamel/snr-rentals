import { useState } from "react";
import { Link } from "react-router-dom";
import { StageBadge, getStage, OUT_STAGES } from "../utils/lifecycle.jsx";

// Each physical unit (serial number) of one camera: where it is now, who had
// it last and in what state it came back — the panel's "if something breaks,
// who rented it last?" question, answered per unit.

function shortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const sameSerial = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

function ConditionChip({ booking }) {
  if (!booking.RETURN_CONDITION) return null;
  return booking.RETURN_CONDITION === "damaged" ? (
    <span className="rounded-full bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">Damaged</span>
  ) : (
    <span className="rounded-full border border-green-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-green-700">Good</span>
  );
}

function UnitCard({ unit, rentals, onOpen }) {
  const [open, setOpen] = useState(false);
  const current = rentals.find((b) => OUT_STAGES.has(getStage(b).key));
  // The last rental that came BACK — the one to ask about if the unit is found damaged.
  const last = rentals.find((b) => b.FULFILLMENT_STATUS === "returned" || String(b.status).toLowerCase() === "completed");
  const damaged = rentals.filter((b) => b.RETURN_CONDITION === "damaged").length;
  // Approved rentals the system has assigned this unit to, not yet released.
  const isReserved = (b) => String(b.status).toLowerCase() === "approved" && !b.FULFILLMENT_STATUS;
  const next = rentals.filter(isReserved).at(-1);

  return (
    <div className={`ui-card px-4 py-3 ${unit.active === false ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-[color:var(--color-black)]">{unit.serial}</span>
          {unit.note && <span className="text-xs text-[color:var(--color-dark-gray)]">{unit.note}</span>}
          {unit.active === false && <span className="ui-chip">Retired</span>}
          {damaged > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-700">
              {damaged} damage report{damaged === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {current ? (
          <button type="button" onClick={() => onOpen?.(current)} className="flex items-center gap-2 text-left">
            <span className="text-xs font-semibold">with {current.FULL_NAME}</span>
            <StageBadge booking={current} />
          </button>
        ) : (
          <span className="rounded-full border border-green-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-green-700">
            In shop
          </span>
        )}
      </div>

      <div className="mt-1.5 text-xs text-[color:var(--color-dark-gray)]">
        {last ? (
          <>
            {current ? "Previous renter" : "Last renter"}: <strong className="text-[color:var(--color-ink)]">{last.FULL_NAME}</strong> ·{" "}
            {shortDate(last.PICK_UP_DATE)} → {shortDate(last.RETURN_DATE)} · {last.CONTACT_NUMBER || "no contact"}{" "}
            <ConditionChip booking={last} />
            {last.RETURN_NOTES && <span className="ml-1 italic">“{last.RETURN_NOTES}”</span>}
          </>
        ) : rentals.some((b) => !isReserved(b)) ? (
          "No returned rentals yet."
        ) : (
          "Not rented out yet."
        )}
      </div>

      {next && (
        <div className="mt-1 text-xs text-[color:var(--color-dark-gray)]">
          Next: <strong className="text-[color:var(--color-ink)]">{next.FULL_NAME}</strong> · {shortDate(next.PICK_UP_DATE)} →{" "}
          {shortDate(next.RETURN_DATE)} <span className="ui-chip">Reserved</span>
        </div>
      )}

      {rentals.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider underline">
          {open ? "Hide" : "Show"} rental history ({rentals.length})
        </button>
      )}
      {open && (
        <ol className="mt-2 space-y-1.5 border-l-2 border-[rgba(58,58,58,0.2)] pl-3">
          {rentals.map((b) => (
            <li key={b.responseId} className="text-xs">
              <button type="button" onClick={() => onOpen?.(b)} className="text-left hover:underline">
                <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                  {shortDate(b.PICK_UP_DATE)} → {shortDate(b.RETURN_DATE)}
                </span>{" "}
                <strong>{b.FULL_NAME}</strong> <ConditionChip booking={b} />
                {isReserved(b) && <span className="ml-1 font-mono text-[10px]">(reserved)</span>}
                {b.RETURN_NOTES && <span className="ml-1 italic text-[color:var(--color-dark-gray)]">“{b.RETURN_NOTES}”</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function UnitHistory({ camera, bookings, onOpen }) {
  const units = camera?.serials || [];
  if (units.length === 0) {
    return (
      <section className="ui-panel mb-5 p-4">
        <div className="ui-kicker mb-1">Units</div>
        <p className="text-sm text-[color:var(--color-dark-gray)]">
          No serial numbers listed for this camera.{" "}
          <Link to="/catalog" className="font-bold underline">
            Add them in the Catalog
          </Link>{" "}
          to track who rented each unit and its condition on return.
        </p>
      </section>
    );
  }
  const newestFirst = [...bookings].sort((a, b) => String(b.PICK_UP_DATE).localeCompare(String(a.PICK_UP_DATE)));
  return (
    <section className="mb-5 space-y-2">
      <div className="ui-kicker">Units · serial numbers</div>
      {units.map((u) => (
        <UnitCard
          key={u.serial}
          unit={u}
          rentals={newestFirst.filter((b) => sameSerial(b.UNIT_SERIAL, u.serial))}
          onOpen={onOpen}
        />
      ))}
    </section>
  );
}
