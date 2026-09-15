import { useState } from "react";
import Header from "../components/Header.jsx";
import InventoryRow from "../components/InventoryRow.jsx";
import { useCameras } from "../hooks/useCameras.js";
import { useBookings } from "../hooks/useBookings.js";
import { todayISOLocal } from "../utils/dateHelpers.js";

export default function CameraList() {
  const { cameras, loading: camerasLoading } = useCameras();
  // One request for the whole page — each row used to fetch its own.
  const { bookings, loading, error } = useBookings("/api/bookings");
  const [dateIso, setDateIso] = useState(() => todayISOLocal());

  const isToday = dateIso === todayISOLocal();
  const busy = camerasLoading || loading;

  return (
    <div>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-kicker mb-1">Inventory</div>
            <h1 className="ui-title font-display text-4xl">Cameras</h1>
          </div>
          <div>
            <label className="ui-label" htmlFor="camera-availability-date">
              Availability on
            </label>
            <div className="flex items-center gap-2">
              <input
                id="camera-availability-date"
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
            {cameras.map((c) => (
              <InventoryRow
                key={c.name}
                item={c}
                bookings={bookings}
                dateIso={dateIso}
                kind="camera"
                to={`/cameras/${encodeURIComponent(c.name)}`}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
