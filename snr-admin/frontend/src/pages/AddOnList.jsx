import { useState } from "react";
import Header from "../components/Header.jsx";
import InventoryRow from "../components/InventoryRow.jsx";
import { useAddOns } from "../hooks/useAddOns.js";
import { useBookings } from "../hooks/useBookings.js";
import { todayISOLocal } from "../utils/dateHelpers.js";

export default function AddOnList() {
  const { addons, loading: addonsLoading } = useAddOns();
  // One request for all 16 rows — each row used to fetch its own.
  const { bookings, loading, error } = useBookings("/api/bookings");
  const [dateIso, setDateIso] = useState(() => todayISOLocal());

  const isToday = dateIso === todayISOLocal();
  const busy = addonsLoading || loading;

  return (
    <div>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-kicker mb-1">Inventory</div>
            <h1 className="ui-title font-display text-4xl">Add-ons</h1>
          </div>
          <div>
            <label className="ui-label" htmlFor="addon-availability-date">
              Availability on
            </label>
            <div className="flex items-center gap-2">
              <input
                id="addon-availability-date"
                type="date"
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value || todayISOLocal())}
                className="ui-input ui-input--sm"
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setDateIso(todayISOLocal())}
                  className="ui-btn ui-btn--sm"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="ui-card mb-3 px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-danger)]">
            {error}
          </p>
        )}

        {busy ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-skeleton h-20" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {addons.map((a) => (
              <InventoryRow
                key={a.name}
                item={a}
                bookings={bookings}
                dateIso={dateIso}
                kind="addon"
                to={`/addons/${encodeURIComponent(a.name)}`}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
