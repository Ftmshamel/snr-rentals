import { formatISODateLocal, todayISOLocal } from "../utils/dateHelpers.js";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function buildTagMap(bookings) {
  const map = new Map();
  for (const b of bookings) {
    if (b.PICK_UP_DATE) {
      const entry = map.get(b.PICK_UP_DATE) || {
        pickup: 0,
        delivery: 0,
        return: 0,
      };
      const isDelivery = (b.PREFERRED_MODE || "")
        .trim()
        .toLowerCase()
        .startsWith("deliver");
      if (isDelivery) entry.delivery += 1;
      else entry.pickup += 1;
      map.set(b.PICK_UP_DATE, entry);
    }
    if (b.RETURN_DATE) {
      const entry = map.get(b.RETURN_DATE) || {
        pickup: 0,
        delivery: 0,
        return: 0,
      };
      entry.return += 1;
      map.set(b.RETURN_DATE, entry);
    }
  }
  return map;
}

function buildRangeSet(bookings) {
  const set = new Set();
  for (const b of bookings) {
    if (!b.PICK_UP_DATE || !b.RETURN_DATE) continue;
    const start = new Date(b.PICK_UP_DATE);
    const end = new Date(b.RETURN_DATE);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const current = new Date(start);
    while (current <= end) {
      set.add(formatISODateLocal(current));
      current.setDate(current.getDate() + 1);
    }
  }
  return set;
}

export default function MonthCalendar({
  viewMonth,
  bookings,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  highlightRange = false,
}) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const taggedDates = buildTagMap(bookings);
  const rangeDates = highlightRange ? buildRangeSet(bookings) : null;
  const today = todayISOLocal();

  const cells = [];
  for (let i = 0; i < startPad; i++) {
    cells.push({ key: `pad-${i}`, day: null });
  }
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    cells.push({ key: `d-${d}`, day: d, iso: formatISODateLocal(date) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `trail-${cells.length}`, day: null });
  }

  const title = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="ui-card overflow-hidden p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={onPrevMonth}
          className="ui-btn ui-btn--icon"
          aria-label="Previous month"
        >
          ←
        </button>
        <h2 className="ui-title font-display text-lg">{title}</h2>
        <button
          type="button"
          onClick={onNextMonth}
          className="ui-btn ui-btn--icon"
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-[0.6rem] font-extrabold uppercase tracking-[0.06em] text-[color:var(--color-dark-gray)]"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.day == null) {
            return <div key={c.key} className="min-h-[3rem]" />;
          }
          const iso = c.iso;
          const tags = taggedDates.get(iso);
          const hasPickup = Boolean(tags?.pickup);
          const hasDelivery = Boolean(tags?.delivery);
          const hasReturn = Boolean(tags?.return);
          const isInRange = highlightRange && rangeDates?.has(iso);
          const isToday = iso === today;
          const isSelected = selectedDate && iso === selectedDate;

          const cellClasses = [
            "min-h-[3rem] rounded-cell border-2 flex items-center justify-center font-mono text-sm cursor-pointer transition-colors",
          ];
          if (isInRange) {
            cellClasses.push(
              "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-white",
            );
          } else if (isSelected) {
            cellClasses.push(
              "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-white",
            );
          } else {
            cellClasses.push(
              "border-transparent bg-[rgba(255,255,255,0.75)] font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]",
            );
          }
          if (isToday && !isSelected && !isInRange) {
            cellClasses.push("border-dashed border-[color:var(--color-ink)]");
          }
          const cellClass = cellClasses.join(" ");

          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelectDate(iso)}
              className={cellClass}
            >
              <span className="flex flex-col items-center leading-none">
                <span>{c.day}</span>
                {hasPickup || hasDelivery || hasReturn ? (
                  <span className="mt-1 flex flex-wrap justify-center gap-0.5 text-[8px] font-black tracking-wide">
                    {[
                      hasPickup && "P",
                      hasDelivery && "D",
                      hasReturn && "R",
                    ]
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full px-1 py-px ${
                            isSelected || isInRange
                              ? "bg-[color:var(--color-bg-light)] text-[color:var(--color-ink)]"
                              : "bg-[color:var(--color-ink)] text-[color:var(--color-bg-light)]"
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
