import { useEffect, useState, useMemo } from "react";
import Header from "../components/Header.jsx";
import BookingModal from "../components/BookingModal.jsx";
import { apiGetJson } from "../utils/api.js";
import { StageBadge } from "../utils/lifecycle.jsx";
import Icon from "../components/Icon.jsx";

const PAGE_SIZE = 20;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonth(yyyyMm) {
  const [y, m] = yyyyMm.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, mo, d] = iso.split("-").map(Number);
  return `${MONTHS[mo - 1].slice(0, 3)} ${d}, ${y}`;
}

function countDays(pickUp, ret) {
  if (!pickUp || !ret) return null;
  const diff = Math.round(
    (new Date(ret + "T00:00:00") - new Date(pickUp + "T00:00:00")) / 86400000,
  );
  return diff > 0 ? diff : null;
}

function toAmPm(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function parseGFormTimestamp(ts) {
  // Format: "M/D/YYYY HH:MM:SS"
  if (!ts || typeof ts !== "string") return null;
  const m = ts.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/,
  );
  if (!m) return null;
  return new Date(
    Number(m[3]),
    Number(m[1]) - 1,
    Number(m[2]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

function getReservedAt(b) {
  // Form submission time is the true reservation date and never changes.
  if (b.Timestamp) {
    const d = parseGFormTimestamp(b.Timestamp);
    if (d && !isNaN(d)) return d;
  }
  // Fall back to row creation time (set once on insert) — NOT updated_at, which
  // changes on every edit / status change.
  if (b._createdAt) {
    const d = new Date(b._createdAt);
    if (!isNaN(d)) return d;
  }
  return null;
}

function formatReserved(date) {
  if (!date) return "—";
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)} · ${toAmPm(`${hh}:${mm}`)}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDeliveryMode(b) {
  return (b.PREFERRED_MODE || "").trim().toLowerCase().startsWith("deliver");
}

function getAddons(b) {
  const a =
    b["Please_choose_your_add-ons"] ||
    b.Please_choose_your_add_ons ||
    b.ADDONS ||
    [];
  return Array.isArray(a) ? a : [];
}

const selCls =
  "ui-input ui-input--sm";

export default function RentalsTable() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);

  const [search, setSearch] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [reservedFilter, setReservedFilter] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [page, setPage] = useState(1);

  function load(silent = false) {
    if (!silent) setLoading(true);
    apiGetJson("/api/bookings")
      .then((data) => setBookings(data.bookings || []))
      .catch((e) => {
        if (!silent) setError(e.message);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  // Reset to page 1 on any filter change
  useEffect(() => {
    setPage(1);
  }, [search, cameraFilter, monthFilter, reservedFilter, upcomingOnly]);

  const cameraOptions = useMemo(() => {
    const set = new Set();
    bookings.forEach((b) => {
      if (b.PREFERRED_CAMERA) set.add(b.PREFERRED_CAMERA);
    });
    return [...set].sort();
  }, [bookings]);

  const monthOptions = useMemo(() => {
    const set = new Set();
    bookings.forEach((b) => {
      if (b.PICK_UP_DATE) set.add(b.PICK_UP_DATE.slice(0, 7));
    });
    return [...set].sort().reverse();
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayIso();
    const now = Date.now();

    const result = bookings.filter((b) => {
      // Camera filter — case-insensitive
      if (
        cameraFilter &&
        (b.PREFERRED_CAMERA || "").toLowerCase() !== cameraFilter.toLowerCase()
      )
        return false;

      // Month filter (pickup month)
      if (monthFilter && !(b.PICK_UP_DATE || "").startsWith(monthFilter))
        return false;

      // Upcoming only — return date is today or in the future
      if (upcomingOnly && b.RETURN_DATE && b.RETURN_DATE < today) return false;

      // Reserved filter (when they submitted the form)
      if (reservedFilter) {
        const reservedAt = getReservedAt(b);
        if (!reservedAt) return false;
        const ms = now - reservedAt.getTime();
        if (reservedFilter === "today") {
          const d = new Date(reservedAt);
          const t = new Date();
          if (
            d.getFullYear() !== t.getFullYear() ||
            d.getMonth() !== t.getMonth() ||
            d.getDate() !== t.getDate()
          )
            return false;
        } else if (reservedFilter === "week" && ms > 7 * 86400000) return false;
        else if (reservedFilter === "month") {
          const d = new Date(reservedAt);
          const t = new Date();
          if (
            d.getFullYear() !== t.getFullYear() ||
            d.getMonth() !== t.getMonth()
          )
            return false;
        }
      }

      // Text search
      if (q) {
        const hay = [
          b.FULL_NAME,
          b.FACEBOOK_ACCOUNT_NAME,
          b.CONTACT_NUMBER,
          b.PREFERRED_CAMERA,
          b.COMPLETE_ADDRESS,
          b.SPECIFIC_DESTINATION,
          b.UNIT_SERIAL,
          b.responseId,
        ]
          .map((v) => (v || "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    // Default sort: most recently reserved first
    result.sort((a, b) => {
      const ra = getReservedAt(a);
      const rb = getReservedAt(b);
      const ta = ra ? ra.getTime() : -Infinity;
      const tb = rb ? rb.getTime() : -Infinity;
      return tb - ta;
    });

    return result;
  }, [
    bookings,
    search,
    cameraFilter,
    monthFilter,
    reservedFilter,
    upcomingOnly,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasFilters =
    search || cameraFilter || monthFilter || reservedFilter || upcomingOnly;

  return (
    <div className="min-h-screen">
      {activeBooking && (
        <BookingModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onSaved={() => {
            setActiveBooking(null);
            load(true);
          }}
          onChanged={() => load(true)}
          onDeleted={() => {
            setBookings((prev) =>
              prev.filter((b) => b.responseId !== activeBooking.responseId),
            );
            setActiveBooking(null);
          }}
        />
      )}

      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
              <div className="ui-kicker">All records</div>
              <h1 className="ui-title font-display text-3xl">Rentals</h1>
            </div>
          {!loading && (
            <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
              {filtered.length} of {bookings.length}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-2">
          <input
            type="text"
            placeholder="Search name, contact, camera, serial no., reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ui-input ui-input--sm"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={cameraFilter}
              onChange={(e) => setCameraFilter(e.target.value)}
              className={selCls}
            >
              <option value="">All cameras</option>
              {cameraOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className={selCls}
            >
              <option value="">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <select
              value={reservedFilter}
              onChange={(e) => setReservedFilter(e.target.value)}
              className={selCls}
            >
              <option value="">Any reservation date</option>
              <option value="today">Reserved today</option>
              <option value="week">Reserved this week</option>
              <option value="month">Reserved this month</option>
            </select>
            <label className="ui-btn ui-btn--sm cursor-pointer">
              <input
                type="checkbox"
                checked={upcomingOnly}
                onChange={(e) => setUpcomingOnly(e.target.checked)}
                className="accent-[color:var(--color-ink)]"
              />
              Upcoming only
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCameraFilter("");
                  setMonthFilter("");
                  setReservedFilter("");
                  setUpcomingOnly(false);
                }}
                className="ui-btn ui-btn--sm"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {loading && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Loading…
          </p>
        )}
        {error && <p className="font-mono text-xs text-rose-400">{error}</p>}

        {!loading && !error && (
          <>
            {paginated.length === 0 ? (
              <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                No rentals found.
              </p>
            ) : (
              <div className="space-y-4 ui-panel p-5">
                {paginated.map((b, i) => (
                  <RentalCard
                    key={b.responseId || i}
                    booking={b}
                    onClick={() => setActiveBooking(b)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="ui-btn ui-btn--sm"
                >
                  <Icon name="arrow-left" size={14} /> Prev
                </button>
                <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="ui-btn ui-btn--sm"
                >
                  Next <Icon name="arrow-right" size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RentalCard({ booking: b, onClick }) {
  const delivery = isDeliveryMode(b);
  const days = countDays(b.PICK_UP_DATE, b.RETURN_DATE);
  const effectiveDays =
    days != null
      ? days + (b.HALF_DAY_LATE ? 0.5 : 0) - (b.HALF_DAY_EARLY ? 0.5 : 0)
      : null;
  const reservedAt = getReservedAt(b);
  const addons = getAddons(b);

  return (
    <article
      onClick={onClick}
      className="-mx-2 cursor-pointer border-b-2 border-[rgba(58,58,58,0.2)] px-2 pb-4 transition-colors last:border-0 last:pb-0 hover:bg-[rgba(255,255,255,0.6)]/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-bold text-[color:var(--color-black)]">
            {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
          </div>
          <div className="mt-0.5 text-sm text-[color:var(--color-dark-gray)]">
            {b.PREFERRED_CAMERA || "—"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StageBadge booking={b} />
          {b.UNIT_SERIAL && (
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">Unit {b.UNIT_SERIAL}</span>
          )}
          {b.RETURN_CONDITION === "damaged" && (
            <span className="rounded-full bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
              Returned damaged
            </span>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-ink)]">
          <span className="ui-chip ui-chip--solid w-[68px] shrink-0 justify-center">
            {delivery ? "DELIVERY" : "PICKUP"}
          </span>
          <span>
            {formatDate(b.PICK_UP_DATE)}
            {b.PICK_UP_TIME ? ` · ${toAmPm(b.PICK_UP_TIME)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-ink)]">
          <span className="ui-chip ui-chip--solid w-[68px] shrink-0 justify-center">
            RETURN
          </span>
          <span>
            {formatDate(b.RETURN_DATE)}
            {b.RETURN_TIME ? ` · ${toAmPm(b.RETURN_TIME)}` : ""}
            {effectiveDays != null && (
              <span className="ml-2 text-[color:var(--color-dark-gray)]">
                ({effectiveDays}d)
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-2 text-sm text-[color:var(--color-dark-gray)]">
        {b.CONTACT_NUMBER || "—"}
      </div>
      <div className="mt-1 text-sm text-[color:var(--color-ink)]">
        {b.COMPLETE_ADDRESS || b.SPECIFIC_DESTINATION || "—"}
      </div>

      {addons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {addons.map((a, i) => (
            <span
              key={i}
              className="ui-chip"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {b.RENTAL_FEE != null &&
        (() => {
          const fee = Number(b.RENTAL_FEE);
          const paid =
            b.DOWNPAYMENT_PAID != null
              ? Number(b.DOWNPAYMENT_PAID)
              : Math.ceil(fee * 0.2);
          const balance = fee - paid;
          return (
            <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs text-[color:var(--color-dark-gray)]">
              <span>Fee ₱{fee.toLocaleString()}</span>
              <span>· DP ₱{paid.toLocaleString()}</span>
              <span>
                ·{" "}
                <span
                  className={`font-bold ${balance <= 0 ? "text-green-600" : "text-[color:var(--color-ink)]"}`}
                >
                  {balance <= 0
                    ? "Paid"
                    : `Balance ₱${balance.toLocaleString()}`}
                </span>
              </span>
            </div>
          );
        })()}

      <div className="mt-2 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
        Reserved {formatReserved(reservedAt)}
      </div>
    </article>
  );
}
