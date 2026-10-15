import { useMemo, useState } from "react";
import { formatISODateLocal, parseISODate, todayISOLocal } from "../utils/dateHelpers.js";
import Icon from "./Icon.jsx";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * Airline-style range picker: the first click sets the start, the second sets
 * the end. Clicking again (or clicking before the current start) begins a new
 * range from that day. While only the start is set, hovering previews the span.
 *
 * Dates are YYYY-MM-DD strings throughout, matching the rest of the app.
 *
 * @param {string} start     selected start, "" when unset
 * @param {string} end       selected end, "" when unset
 * @param {(start: string, end: string) => void} onChange
 *        Fired on every click. Mid-selection the end comes back as "".
 */
export default function DateRangeCalendar({ start, end, onChange }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const anchor = parseISODate(start) || new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const [hovered, setHovered] = useState(null);

  const today = todayISOLocal();
  // Mid-selection the hovered day stands in for the end, so the span the click
  // would produce is visible before committing to it.
  const previewEnd = end || (start && hovered && hovered >= start ? hovered : "");

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startPad = (new Date(year, month, 1).getDay() + 6) % 7;

    const out = [];
    for (let i = 0; i < startPad; i++) out.push({ key: `pad-${i}`, day: null });
    for (let d = 1; d <= lastDay; d++) {
      out.push({
        key: `d-${d}`,
        day: d,
        iso: formatISODateLocal(new Date(year, month, d)),
      });
    }
    while (out.length % 7 !== 0) out.push({ key: `trail-${out.length}`, day: null });
    return out;
  }, [viewMonth]);

  function handlePick(iso) {
    // No start yet, or a completed range, or a click before the start:
    // begin a fresh range on this day.
    if (!start || end || iso < start) {
      onChange(iso, "");
      setHovered(null);
      return;
    }
    onChange(start, iso);
    setHovered(null);
  }

  const shiftMonth = (delta) =>
    setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + delta, 1));

  const title = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="ui-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="ui-btn ui-btn--icon"
        >
          <Icon name="arrow-left" size={16} />
        </button>
        <h2 className="ui-title font-display text-base">{title}</h2>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="ui-btn ui-btn--icon"
        >
          <Icon name="arrow-right" size={16} />
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

      <div
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {cells.map((c) => {
          if (c.day == null) {
            return <div key={c.key} className="min-h-[2.5rem]" />;
          }
          const iso = c.iso;
          const isStart = start && iso === start;
          const isEnd = previewEnd && iso === previewEnd;
          const inRange =
            start && previewEnd && iso > start && iso < previewEnd;
          const isEdge = isStart || isEnd;

          const classes = [
            "min-h-[2.5rem] rounded-cell border flex items-center justify-center",
            "font-mono text-sm cursor-pointer transition-colors",
          ];
          if (isEdge) {
            classes.push(
              "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-white",
            );
          } else if (inRange) {
            classes.push(
              "border-transparent bg-[rgba(58,58,58,0.16)] font-semibold text-[color:var(--color-ink)]",
            );
          } else {
            classes.push(
              "border-transparent bg-[rgba(255,255,255,0.75)] font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-ink)]",
            );
          }
          if (iso === today && !isEdge) {
            classes.push("border-dashed border-[color:var(--color-ink)]");
          }

          return (
            <button
              key={c.key}
              type="button"
              onClick={() => handlePick(iso)}
              onMouseEnter={() => setHovered(iso)}
              aria-label={iso}
              aria-pressed={Boolean(isEdge)}
              className={classes.join(" ")}
            >
              {c.day}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t-2 border-dashed border-[rgba(58,58,58,0.28)] pt-2.5">
        <span className="ui-kicker text-[0.6rem]">
          {!start
            ? "Select pick-up date"
            : !end
              ? "Now select return date"
              : "Click any date to start over"}
        </span>
        {start && (
          <button
            type="button"
            onClick={() => {
              onChange("", "");
              setHovered(null);
            }}
            className="ui-btn ui-btn--sm shrink-0"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
