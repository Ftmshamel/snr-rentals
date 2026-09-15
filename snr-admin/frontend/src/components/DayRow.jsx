import { useState } from "react";
import { formatDayRowLabel, formatISODateLocal } from "../utils/dateHelpers.js";
import EventCard from "./EventCard.jsx";

function buildEventsForDay(dayDate, bookings) {
  const dayIso = formatISODateLocal(dayDate);
  const events = [];

  for (const b of bookings) {
    const pick = b.PICK_UP_DATE;
    const ret = b.RETURN_DATE;
    if (pick === dayIso) {
      events.push({
        key: `${b.responseId}-pick`,
        time: b.PICK_UP_TIME || "00:00",
        eventTag: "PICKUP",
        sortKey: `${b.PICK_UP_TIME || "00:00"}-a`,
        booking: b,
      });
    }
    if (ret === dayIso) {
      events.push({
        key: `${b.responseId}-ret`,
        time: b.RETURN_TIME || "00:00",
        eventTag: "RETURN",
        sortKey: `${b.RETURN_TIME || "00:00"}-b`,
        booking: b,
      });
    }
  }

  events.sort((x, y) =>
    x.sortKey < y.sortKey ? -1 : x.sortKey > y.sortKey ? 1 : 0,
  );
  return events;
}

export default function DayRow({ dayDate, bookings }) {
  const [open, setOpen] = useState(false);
  const events = buildEventsForDay(dayDate, bookings);
  const label = formatDayRowLabel(dayDate);

  return (
    <div className="ui-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.6)] sm:px-4"
      >
        <div className="flex items-baseline gap-3">
          <span className="ui-chip">{events.length}</span>
          <span className="ui-title font-display text-lg">{label}</span>
        </div>
        <span className="ui-num text-base">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t-2 border-dashed border-[rgba(58,58,58,0.28)] px-3 pb-3 pt-2.5 sm:px-4">
          {events.length === 0 ? (
            <p className="ui-kicker">No events</p>
          ) : (
            events.map((ev) => (
              <EventCard
                key={ev.key}
                time={ev.time}
                eventTag={ev.eventTag}
                cameraName={ev.booking.PREFERRED_CAMERA || "—"}
                renterName={ev.booking.FACEBOOK_ACCOUNT_NAME || ev.booking.FULL_NAME || "—"}
                address={ev.booking.COMPLETE_ADDRESS || ""}
                preferredMode={ev.booking.PREFERRED_MODE}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
