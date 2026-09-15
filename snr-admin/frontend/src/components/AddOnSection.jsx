import { useMemo, useState } from "react";
import MonthCalendar from "./MonthCalendar.jsx";
import BookingDetail from "./BookingDetail.jsx";
import { useBookings } from "../hooks/useBookings.js";
import { distributeToUnits, todayISOLocal } from "../utils/dateHelpers.js";

export default function AddOnSection({ addonName, units = 1 }) {
  const [expanded, setExpanded] = useState(false);

  // Only fetch when expanded
  const path = expanded
    ? `/api/bookings/by?type=addon&name=${encodeURIComponent(addonName)}`
    : null;

  const { bookings, loading } = useBookings(path);

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
    <div className="ui-card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.6)]"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold text-[color:var(--color-black)]">
            {addonName}
          </span>
          <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
            ×{units} unit{units > 1 ? "s" : ""}
          </span>
        </div>
        <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t-2 border-[rgba(58,58,58,0.2)] px-4 pb-4 pt-3">
          {loading ? (
            <div className="ui-skeleton h-40" />
          ) : (
            <>
              {units > 1 && (
                <div className="mb-3 flex items-center gap-2">
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
              <div className="mt-4">
                <BookingDetail
                  bookings={activeBookings}
                  selectedDate={selectedDate}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
