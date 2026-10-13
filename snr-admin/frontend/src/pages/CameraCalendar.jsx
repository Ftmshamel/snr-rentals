import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Header from "../components/Header.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import BookingDetail from "../components/BookingDetail.jsx";
import AddOnSection from "../components/AddOnSection.jsx";
import UnitHistory from "../components/UnitHistory.jsx";
import BookingModal from "../components/BookingModal.jsx";
import { useBookings } from "../hooks/useBookings.js";
import { useCameras } from "../hooks/useCameras.js";
import { ADDONS } from "../data/addons.js";
import { distributeToUnits, todayISOLocal } from "../utils/dateHelpers.js";

export default function CameraCalendar() {
  const { cameraName: cameraNameParam } = useParams();
  const decoded = decodeURIComponent(cameraNameParam || "");
  const path = decoded
    ? `/api/bookings/by?type=camera&name=${encodeURIComponent(decoded)}`
    : null;
  const { bookings, loading, error, silentRefetch } = useBookings(path);
  const [openBooking, setOpenBooking] = useState(null);
  const { cameras } = useCameras();

  const cameraData = cameras.find(
    (c) => c.name.toLowerCase() === decoded.toLowerCase(),
  );
  const units = cameraData?.units ?? 1;
  const cameraAddOns = cameraData?.addOns ?? [];

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => todayISOLocal());
  const [activeUnit, setActiveUnit] = useState(0);

  const unitSlots = useMemo(
    () => distributeToUnits(bookings, units),
    [bookings, units],
  );

  const activeBookings = unitSlots[activeUnit] ?? [];

  const shiftMonth = (delta) => {
    setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + delta, 1));
  };

  return (
    <div>
      <Header backTo="/cameras" />
      {openBooking && (
        <BookingModal
          booking={openBooking}
          onClose={() => setOpenBooking(null)}
          onSaved={() => {
            setOpenBooking(null);
            silentRefetch();
          }}
          onChanged={silentRefetch}
          onDeleted={() => {
            setOpenBooking(null);
            silentRefetch();
          }}
        />
      )}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {error ? (
          <p className="mb-4 font-mono text-sm text-[color:var(--color-dark-gray)]">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="ui-skeleton h-64" />
        ) : (
          <>
            <div className="mb-4 truncate text-lg font-bold text-[color:var(--color-black)]">
              {decoded || "Camera"}
            </div>
            <UnitHistory camera={cameraData} bookings={bookings} onOpen={setOpenBooking} />
            {units > 1 && (
              <div className="mb-4 flex items-center gap-2">
                {unitSlots.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setActiveUnit(i);
                      setSelectedDate(todayISOLocal());
                    }}
                    className={`border px-4 py-1.5 font-mono text-xs transition-colors ${
                      activeUnit === i
                        ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-bg-light)]"
                        : "border-[color:var(--color-border)] text-[color:var(--color-dark-gray)] hover:border-[color:var(--color-ink)] hover:text-[color:var(--color-ink)]"
                    }`}
                  >
                    {i < units ? `Unit ${i + 1}` : "Overflow"}
                  </button>
                ))}
              </div>
            )}
            <MonthCalendar
              viewMonth={viewMonth}
              bookings={activeBookings}
              selectedDate={selectedDate}
              onSelectDate={(iso) => setSelectedDate(iso)}
              onPrevMonth={() => shiftMonth(-1)}
              onNextMonth={() => shiftMonth(1)}
              highlightRange
            />
            <div className="mt-6">
              <BookingDetail
                bookings={activeBookings}
                selectedDate={selectedDate}
              />
            </div>

            {cameraAddOns.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                  Add-ons
                </div>
                <div className="space-y-2">
                  {cameraAddOns.map((addon) => {
                    const addonData = ADDONS.find(
                      (a) => a.name.toLowerCase() === addon.name.toLowerCase(),
                    );
                    return (
                      <AddOnSection
                        key={addon.name}
                        addonName={addon.name}
                        units={addonData?.units ?? 1}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
