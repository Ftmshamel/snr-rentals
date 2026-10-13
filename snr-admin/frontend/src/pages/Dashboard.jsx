import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import BookingModal from "../components/BookingModal.jsx";
import { useBookings } from "../hooks/useBookings.js";
import { addDaysLocal, formatISODateLocal, todayISOLocal } from "../utils/dateHelpers.js";
import { StageBadge, getStage, isDelivery } from "../utils/lifecycle.jsx";

// "What do we do today?" — the admin's home page. Every rental that needs a
// hand on it today is listed under the step it is waiting for, and clicking
// one opens it with that step's button ready (see LifecyclePanel).

function toAmPm(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function shortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Delivery rentals whose Lalamove still has to be booked by hand.
function lalamoveTag(booking, kind) {
  if (!isDelivery(booking)) return null;
  const booked = kind === "delivery" ? booking.LALAMOVE_DELIVERY_LINK : booking.LALAMOVE_RETURN_LINK;
  return booked ? (
    <span className="rounded-full border-2 border-green-600 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-green-700">
      Lalamove booked
    </span>
  ) : (
    <span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
      {kind === "delivery" ? "Book Lalamove" : "Book return rider"}
    </span>
  );
}

function Row({ booking, detail, onOpen, tag }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(booking)}
      className="flex w-full items-center justify-between gap-3 rounded-[14px] border-2 border-[rgba(58,58,58,0.18)] bg-[rgba(255,255,255,0.65)] px-3 py-2.5 text-left transition hover:border-[color:var(--color-ink)]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-[color:var(--color-black)]">
            {booking.FULL_NAME || booking.FACEBOOK_ACCOUNT_NAME || "—"}
          </span>
          <span className="ui-chip">{isDelivery(booking) ? "Delivery" : "Pickup"}</span>
          {tag}
        </div>
        <div className="truncate text-xs text-[color:var(--color-dark-gray)]">
          {booking.PREFERRED_CAMERA}
          {booking.UNIT_SERIAL ? ` · ${booking.UNIT_SERIAL}` : ""}
        </div>
        {detail && <div className="truncate font-mono text-[10px] text-[color:var(--color-dark-gray)]">{detail}</div>}
      </div>
      <StageBadge booking={booking} className="shrink-0" />
    </button>
  );
}

function Section({ id, title, hint, items, empty, render }) {
  return (
    // min-w-0: a grid item otherwise grows to its longest line and pushes the
    // page wider than a phone screen.
    <section id={id} className="ui-panel min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h2 className="font-display text-lg font-extrabold text-[color:var(--color-black)]">
          {title} <span className="font-mono text-sm text-[color:var(--color-dark-gray)]">({items.length})</span>
        </h2>
        {hint}
      </div>
      {items.length === 0 ? (
        <p className="font-mono text-xs text-[color:var(--color-dark-gray)]">{empty}</p>
      ) : (
        <div className="space-y-2">{items.map(render)}</div>
      )}
    </section>
  );
}

const TILE_TONES = {
  neutral: "",
  blue: "border-blue-600",
  indigo: "border-indigo-600",
  orange: "border-orange-500",
  red: "border-rose-600 bg-rose-50",
  amber: "border-amber-500",
};

function Tile({ label, value, href, tone = "neutral" }) {
  return (
    <a href={href} className={`ui-card block px-4 py-3 transition hover:-translate-y-0.5 ${TILE_TONES[tone]}`}>
      <div className="ui-kicker text-[0.6rem]">{label}</div>
      <div className="ui-num mt-1 text-3xl font-bold text-[color:var(--color-black)]">{value}</div>
    </a>
  );
}

export default function Dashboard() {
  const { bookings, loading, error, silentRefetch } = useBookings("/api/bookings");
  const [active, setActive] = useState(null);
  const today = todayISOLocal();
  const weekAhead = formatISODateLocal(addDaysLocal(new Date(), 7));

  const groups = useMemo(() => {
    const g = { pending: [], release: [], transit: [], due: [], withRenter: [], upcoming: [] };
    for (const b of bookings) {
      const key = getStage(b, today).key;
      if (key === "pending") g.pending.push(b);
      else if (key === "release_today" || key === "release_late") g.release.push(b);
      else if (key === "out_for_delivery") g.transit.push(b);
      else if (key === "for_return" || key === "overdue") g.due.push(b);
      else if (key === "with_renter") g.withRenter.push(b);
      else if (key === "reserved" && b.PICK_UP_DATE <= weekAhead) g.upcoming.push(b);
    }
    const byTime = (a, b) => `${a.PICK_UP_DATE}${a.PICK_UP_TIME}`.localeCompare(`${b.PICK_UP_DATE}${b.PICK_UP_TIME}`);
    g.release.sort(byTime);
    g.upcoming.sort(byTime);
    g.due.sort((a, b) => `${a.RETURN_DATE}${a.RETURN_TIME}`.localeCompare(`${b.RETURN_DATE}${b.RETURN_TIME}`));
    g.withRenter.sort((a, b) => String(a.RETURN_DATE).localeCompare(String(b.RETURN_DATE)));
    return g;
  }, [bookings, today, weekAhead]);

  const overdue = groups.due.filter((b) => b.RETURN_DATE < today).length;
  const unitsOut = groups.transit.length + groups.due.length + groups.withRenter.length;
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen">
      <Header />
      {active && (
        <BookingModal
          booking={active}
          onClose={() => setActive(null)}
          onSaved={() => {
            setActive(null);
            silentRefetch();
          }}
          onChanged={silentRefetch}
          onDeleted={() => {
            setActive(null);
            silentRefetch();
          }}
        />
      )}
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-kicker">{dateLabel}</div>
            <h1 className="ui-title font-display text-3xl">Today</h1>
          </div>
          <Link to="/schedule" className="ui-btn ui-btn--sm">
            Open calendar →
          </Link>
        </div>

        {error && <p className="font-mono text-xs text-rose-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Need approval" value={loading ? "…" : groups.pending.length} href="#pending" tone={groups.pending.length ? "amber" : "neutral"} />
          <Tile label="Release today" value={loading ? "…" : groups.release.length} href="#release" tone={groups.release.length ? "blue" : "neutral"} />
          <Tile label="Out for delivery" value={loading ? "…" : groups.transit.length} href="#transit" tone={groups.transit.length ? "indigo" : "neutral"} />
          <Tile label="Due back today" value={loading ? "…" : groups.due.length - overdue} href="#due" tone={groups.due.length - overdue ? "orange" : "neutral"} />
          <Tile label="Overdue" value={loading ? "…" : overdue} href="#due" tone={overdue ? "red" : "neutral"} />
          <Tile label="Units out now" value={loading ? "…" : unitsOut} href="#with-renter" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section
            id="release"
            title="Release today"
            hint={<span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">deliver or hand over</span>}
            items={groups.release}
            empty="Nothing to deliver or hand over today."
            render={(b) => (
              <Row
                key={b.responseId}
                booking={b}
                onOpen={setActive}
                tag={lalamoveTag(b, "delivery")}
                detail={`${b.PICK_UP_DATE < today ? `Was due ${shortDate(b.PICK_UP_DATE)}` : toAmPm(b.PICK_UP_TIME)} · ${b.DELIVERY_DETAILS?.address || b.COMPLETE_ADDRESS || ""}`}
              />
            )}
          />
          <Section
            id="due"
            title="For return"
            hint={<span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">check the unit when it comes back</span>}
            items={groups.due}
            empty="No returns due today."
            render={(b) => (
              <Row
                key={b.responseId}
                booking={b}
                onOpen={setActive}
                tag={lalamoveTag(b, "return")}
                detail={
                  b.RETURN_DATE < today
                    ? `${daysBetween(b.RETURN_DATE, today)} day(s) late · due ${shortDate(b.RETURN_DATE)} ${toAmPm(b.RETURN_TIME)} · ${b.CONTACT_NUMBER || ""}`
                    : `Due ${toAmPm(b.RETURN_TIME)} · ${b.CONTACT_NUMBER || ""}`
                }
              />
            )}
          />
          <Section
            id="transit"
            title="Out for delivery"
            hint={<span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">mark delivered on hand-over</span>}
            items={groups.transit}
            empty="No deliveries on the road."
            render={(b) => (
              <Row
                key={b.responseId}
                booking={b}
                onOpen={setActive}
                tag={lalamoveTag(b, "delivery")}
                detail={b.DELIVERY_DETAILS?.address || b.COMPLETE_ADDRESS}
              />
            )}
          />
          <Section
            id="pending"
            title="Need approval"
            hint={
              <Link to="/approvals" className="font-mono text-[10px] font-bold underline">
                Open approvals →
              </Link>
            }
            items={groups.pending}
            empty="No requests waiting."
            render={(b) => (
              <Row key={b.responseId} booking={b} onOpen={setActive} detail={`${shortDate(b.PICK_UP_DATE)} → ${shortDate(b.RETURN_DATE)}`} />
            )}
          />
          <Section
            id="with-renter"
            title="With renters"
            items={groups.withRenter}
            empty="No units out right now."
            render={(b) => (
              <Row key={b.responseId} booking={b} onOpen={setActive} detail={`Back ${shortDate(b.RETURN_DATE)} ${toAmPm(b.RETURN_TIME)}`} />
            )}
          />
          <Section
            id="upcoming"
            title="Coming up · next 7 days"
            items={groups.upcoming}
            empty="No reservations in the next 7 days."
            render={(b) => (
              <Row key={b.responseId} booking={b} onOpen={setActive} detail={`${shortDate(b.PICK_UP_DATE)} ${toAmPm(b.PICK_UP_TIME)} → ${shortDate(b.RETURN_DATE)}`} />
            )}
          />
        </div>
      </main>
    </div>
  );
}
