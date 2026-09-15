import { useState, useMemo } from "react";
import { todayISOLocal } from "../utils/dateHelpers.js";
import Header from "../components/Header.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import BookingDetail from "../components/BookingDetail.jsx";
import BookingModal from "../components/BookingModal.jsx";
import NewRentalModal from "../components/NewRentalModal.jsx";
import DateNoteEditor from "../components/DateNoteEditor.jsx";
import { useBookings } from "../hooks/useBookings.js";
import StoryCalendar from "./StoryCalendar.jsx";

export default function MonthlySchedule() {
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => todayISOLocal());
  const [showNewRental, setShowNewRental] = useState(false);
  const [showStoryCalendar, setShowStoryCalendar] = useState(false);
  const [activeBooking, setActiveBooking] = useState(null);

  // Use the aggregated bookings endpoint (all cameras)
  const { bookings, loading, error, refetch, silentRefetch } =
    useBookings("/api/bookings");

  const activeBookings = useMemo(
    () =>
      bookings.filter((b) => (b.status || "").toLowerCase() !== "cancelled"),
    [bookings],
  );

  const markedDates = useMemo(() => {
    const s = new Set();
    for (const b of activeBookings) {
      if (b.PICK_UP_DATE) s.add(b.PICK_UP_DATE);
      if (b.RETURN_DATE) s.add(b.RETURN_DATE);
    }
    return s;
  }, [activeBookings]);

  const dateIsMarked = selectedDate ? markedDates.has(selectedDate) : false;

  const {
    bookings: dayBookings,
    loading: dayLoading,
    error: dayError,
    silentRefetch: silentRefetchDay,
  } = useBookings(
    selectedDate && dateIsMarked
      ? `/api/bookings/day?date=${encodeURIComponent(selectedDate)}`
      : null,
  );

  function handleBookingChange() {
    silentRefetch();
    silentRefetchDay();
  }

  const overdueBookings = useMemo(() => {
    const today = todayISOLocal();
    return activeBookings
      .filter(
        (b) =>
          (b.FULFILLMENT_STATUS || "").toLowerCase() === "out" &&
          b.RETURN_DATE &&
          b.RETURN_DATE < today,
      )
      .sort((a, b) => (a.RETURN_DATE < b.RETURN_DATE ? -1 : 1));
  }, [activeBookings]);

  const shiftMonth = (delta) => {
    setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + delta, 1));
  };

  return (
    <div>
      {showStoryCalendar && (
        <StoryCalendar
          viewMonth={viewMonth}
          bookings={activeBookings}
          loading={loading}
          onClose={() => setShowStoryCalendar(false)}
        />
      )}
      {showNewRental && (
        <NewRentalModal
          existingBookings={activeBookings}
          repeatBookings={bookings}
          onClose={() => setShowNewRental(false)}
          onCreated={() => {
            setShowNewRental(false);
            refetch();
            silentRefetchDay();
          }}
        />
      )}
      {activeBooking && (
        <BookingModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onSaved={() => {
            setActiveBooking(null);
            handleBookingChange();
          }}
          onChanged={handleBookingChange}
          onDeleted={() => {
            setActiveBooking(null);
            handleBookingChange();
          }}
        />
      )}
      <Header titleExtra="All Cameras" backTo={undefined} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error ? (
          <p className="mb-4 font-mono text-sm text-[color:var(--color-dark-gray)]">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="ui-skeleton h-64" />
        ) : (
          <>
            {overdueBookings.length > 0 && (
              <div className="mb-5 rounded-card border-[3px] border-rose-700 bg-[rgba(255,241,240,0.75)] p-4 shadow-panel">
                <div className="ui-kicker mb-2.5 text-rose-800">
                  ⚠ Overdue Returns ({overdueBookings.length})
                </div>
                <div className="space-y-1.5">
                  {overdueBookings.map((b) => {
                    const daysLate = Math.round(
                      (new Date(todayISOLocal() + "T00:00:00") -
                        new Date(b.RETURN_DATE + "T00:00:00")) /
                        86400000,
                    );
                    return (
                      <button
                        key={b.responseId}
                        type="button"
                        onClick={() => setActiveBooking(b)}
                        className="flex w-full items-center justify-between gap-3 rounded-row border-2 border-rose-300 bg-[rgba(255,255,255,0.8)] px-3 py-2.5 text-left transition-all duration-200 ease-pop hover:-translate-y-0.5 hover:border-rose-700 hover:shadow-sm2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[color:var(--color-black)]">
                            {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
                          </div>
                          <div className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                            {b.PREFERRED_CAMERA || "—"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                            due {b.RETURN_DATE}
                          </div>
                          <div className="font-mono text-xs font-bold text-rose-600">
                            {daysLate}d late
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="ui-kicker">All Cameras</div>
                <h1 className="ui-title font-display text-3xl">Schedule</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowStoryCalendar(true)}
                  className="ui-btn"
                >
                  Download Calendar
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewRental(true)}
                  className="ui-btn ui-btn--solid"
                >
                  + New Rental
                </button>
              </div>
            </div>
            <MonthCalendar
              viewMonth={viewMonth}
              bookings={activeBookings}
              selectedDate={selectedDate}
              onSelectDate={(iso) => setSelectedDate(iso)}
              onPrevMonth={() => shiftMonth(-1)}
              onNextMonth={() => shiftMonth(1)}
            />
            <div className="mt-6">
              <DateNoteEditor selectedDate={selectedDate} />
              {selectedDate && !dateIsMarked ? (
                <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                  No returns, pickups, or deliveries for this date.
                </p>
              ) : (
                <>
                  <BookingDetail
                    bookings={dayBookings.length ? dayBookings : activeBookings}
                    selectedDate={selectedDate}
                    onBookingChange={handleBookingChange}
                  />
                  {dayLoading ? (
                    <p className="mt-2 font-mono text-xs text-[color:var(--color-dark-gray)]">
                      Loading bookings...
                    </p>
                  ) : dayError ? (
                    <p className="mt-2 font-mono text-xs text-rose-500">
                      {dayError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
