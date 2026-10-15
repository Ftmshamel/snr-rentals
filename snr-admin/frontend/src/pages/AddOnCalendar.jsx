import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import BookingDetail from "../components/BookingDetail.jsx";
import { useBookings } from "../hooks/useBookings.js";
import { useAddOns } from "../hooks/useAddOns.js";
import { distributeToUnits, todayISOLocal } from "../utils/dateHelpers.js";
import Icon from "../components/Icon.jsx";

export default function AddOnCalendar() {
  const { addonName: addonNameParam } = useParams();
  const decoded = decodeURIComponent(addonNameParam || "");
  const path = decoded
    ? `/api/bookings/by?type=addon&name=${encodeURIComponent(decoded)}`
    : null;
  const { bookings, loading, error } = useBookings(path);
  const { addons } = useAddOns();

  const addonData = addons.find(
    (a) => a.name.toLowerCase() === decoded.toLowerCase(),
  );
  const units = addonData?.units ?? 1;

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
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {error ? (
          <p className="mb-4 font-mono text-sm text-[color:var(--color-dark-gray)]">{error}</p>
        ) : null}
        {loading ? (
          <div className="ui-skeleton h-64" />
        ) : (
          <>
            <Link
              to="/addons"
              className="mb-2 inline-block ui-btn ui-btn--sm text-[color:var(--color-ink)] hover:bg-[rgba(255,255,255,0.6)] hover:text-[color:var(--color-black)]"
            >
              <Icon name="arrow-left" size={14} /> BACK
            </Link>
            <div className="mb-3 truncate text-lg font-bold text-[color:var(--color-black)]">
              {decoded || "Add-on"}
            </div>
            <div className="mb-4 flex items-center gap-2">
              {units > 1 && unitSlots.map((_, i) => (
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
          </>
        )}
      </main>
    </div>
  );
}
