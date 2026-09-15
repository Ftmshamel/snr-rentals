import { Link } from "react-router-dom";
import { availabilityOn, nextFreeDate } from "../utils/availability.js";

function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * One camera or add-on in the inventory list, with how many units are free on
 * `dateIso`. Bookings are passed in rather than fetched per row — the list
 * pulls /api/bookings once, so a 16-row add-on list is one request, not 16.
 *
 * @param {{name: string, units: number}} item
 * @param {"camera"|"addon"} kind
 */
export default function InventoryRow({ item, bookings, dateIso, kind, to }) {
  const { units, inUse, available } = availabilityOn(bookings, item, dateIso, kind);
  const soldOut = available === 0 && units > 0;
  // More units out than exist — a genuine double-booking. `available` clamps to
  // zero, so without this the problem would be invisible on this page.
  const overbooked = inUse > units;
  const freesUp =
    soldOut && !overbooked ? nextFreeDate(bookings, item, dateIso, kind) : null;

  return (
    <Link
      to={to}
      className="ui-card flex flex-col gap-3 px-4 py-3.5 shadow-sm2 transition-all duration-200 ease-pop hover:-translate-y-1 hover:shadow-panel sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="ui-title font-display text-xl">{item.name}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="ui-chip">
            ×{units} unit{units === 1 ? "" : "s"}
          </span>
          {inUse > 0 && (
            <span className="ui-chip ui-chip--solid">{inUse} out</span>
          )}
          {overbooked && (
            <span className="ui-chip border-[color:var(--color-danger)] bg-[color:var(--color-danger)] text-white">
              ⚠ Overbooked by {inUse - units}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-0.5">
        <div
          className={`font-display text-2xl font-black leading-none ${
            soldOut
              ? "text-[color:var(--color-danger)]"
              : "text-[color:var(--color-black)]"
          }`}
        >
          {available}
          <span className="text-base font-bold text-[color:var(--color-dark-gray)]">
            /{units}
          </span>
        </div>
        <div className="ui-kicker text-[0.6rem]">
          {overbooked
            ? "Over capacity"
            : soldOut
              ? freesUp
                ? `Free ${shortDate(freesUp)}`
                : "Fully booked"
              : "Available"}
        </div>
      </div>
    </Link>
  );
}
