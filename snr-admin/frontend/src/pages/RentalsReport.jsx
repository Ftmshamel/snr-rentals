import { useEffect, useState, useMemo } from "react";
import Header from "../components/Header.jsx";
import BookingModal from "../components/BookingModal.jsx";
import { apiGetJson } from "../utils/api.js";
import { getPricingForDate } from "../data/cameras.js";
import { useCameras, findCamera } from "../hooks/useCameras.js";

const PAGE_SIZE = 20;

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
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
  if (!pickUp || !ret) return 0;
  const diff = Math.round(
    (new Date(ret + "T00:00:00") - new Date(pickUp + "T00:00:00")) / 86400000,
  );
  return diff > 0 ? diff : 0;
}

function toAmPm(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function parseGFormTimestamp(ts) {
  if (!ts || typeof ts !== "string") return null;
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function getReservedAt(b) {
  if (b.Timestamp) {
    const d = parseGFormTimestamp(b.Timestamp);
    if (d && !isNaN(d)) return d;
  }
  if (b._lastUpdatedAt) return new Date(b._lastUpdatedAt);
  return null;
}

function computeExpectedFee(b, cameras) {
  const days = countDays(b.PICK_UP_DATE, b.RETURN_DATE);
  if (!days) return null;
  const cam = findCamera(cameras, b.PREFERRED_CAMERA);
  if (!cam) return null;
  // Rate this booking was actually made under, not today's — otherwise a
  // price change would flag every past booking's stored fee as "wrong".
  const pricing = getPricingForDate(cam, b.PICK_UP_DATE);
  const tier = pricing.find(
    (p) => days >= p.minDays && (p.maxDays === null || days <= p.maxDays),
  );
  if (!tier) return null;
  const effectiveDays = days + (b.HALF_DAY_LATE ? 0.5 : 0) - (b.HALF_DAY_EARLY ? 0.5 : 0);
  const addons = b["Please_choose_your_add-ons"] || b.Please_choose_your_add_ons || b.ADDONS || [];
  const addonFee = Array.isArray(addons) ? addons.reduce((sum, name) => {
    const addon = cam.addOns?.find((a) => a.name === name);
    return sum + (addon ? addon.pricePerDay * effectiveDays : 0);
  }, 0) : 0;
  return Math.round(tier.pricePerDay * effectiveDays + addonFee);
}

function hasCorrectFee(b, cameras) {
  if (b.RENTAL_FEE == null) return false;
  const expected = computeExpectedFee(b, cameras);
  if (expected === null) return false;
  return Number(b.RENTAL_FEE) === expected;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_STYLE = {
  approved: "bg-[rgba(238,238,234,0.9)] text-[color:var(--color-ink)]",
  pending:"bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-rose-100 text-rose-700",
};

const selCls =
  "ui-input ui-input--sm";

export default function RentalsReport() {
  const { cameras } = useCameras();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);

  const [search, setSearch] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [page, setPage] = useState(1);

  function load(silent = false) {
    if (!silent) setLoading(true);
    apiGetJson("/api/bookings")
      .then((data) => setBookings(data.bookings || []))
      .catch((e) => { if (!silent) setError(e.message); })
      .finally(() => { if (!silent) setLoading(false); });
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, cameraFilter, monthFilter, upcomingOnly]);

  // Only real Google Form submissions with correct fee computation
  const verified = useMemo(
    () => bookings.filter((b) => b._source === "google_form" && hasCorrectFee(b, cameras)),
    [bookings, cameras],
  );

  const cameraOptions = useMemo(() => {
    const set = new Set();
    verified.forEach((b) => { if (b.PREFERRED_CAMERA) set.add(b.PREFERRED_CAMERA); });
    return [...set].sort();
  }, [verified]);

  const monthOptions = useMemo(() => {
    const set = new Set();
    verified.forEach((b) => { if (b.PICK_UP_DATE) set.add(b.PICK_UP_DATE.slice(0, 7)); });
    return [...set].sort().reverse();
  }, [verified]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayIso();

    return verified.filter((b) => {
      if (cameraFilter &&
        (b.PREFERRED_CAMERA || "").toLowerCase() !== cameraFilter.toLowerCase()
      ) return false;
      if (monthFilter && !(b.PICK_UP_DATE || "").startsWith(monthFilter)) return false;
      if (upcomingOnly && b.RETURN_DATE && b.RETURN_DATE < today) return false;
      if (q) {
        const hay = [
          b.FULL_NAME, b.FACEBOOK_ACCOUNT_NAME, b.CONTACT_NUMBER,
          b.PREFERRED_CAMERA, b.COMPLETE_ADDRESS, b.SPECIFIC_DESTINATION,
        ].map((v) => (v || "").toLowerCase()).join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [verified, search, cameraFilter, monthFilter, upcomingOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = search || cameraFilter || monthFilter || upcomingOnly;

  return (
    <div className="min-h-screen">
      {activeBooking && (
        <BookingModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onSaved={() => { setActiveBooking(null); load(true); }}
          onDeleted={() => { setBookings((prev) => prev.filter((b) => b.responseId !== activeBooking.responseId)); setActiveBooking(null); }}
        />
      )}

      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div>
              <div className="ui-kicker">Verified</div>
              <h1 className="ui-title font-display text-3xl">Rentals Report</h1>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              Google Form submissions · correct fee computation only
            </p>
          </div>
          {!loading && (
            <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
              {filtered.length} of {verified.length}
              {bookings.length !== verified.length && (
                <span className="ml-1 text-[color:var(--color-dark-gray)]">
                  ({bookings.length - verified.length} excluded)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="mb-3 space-y-2">
          <input
            type="text"
            placeholder="Search name, contact, camera…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ui-input ui-input--sm"
          />
          <div className="flex flex-wrap gap-2">
            <select value={cameraFilter} onChange={(e) => setCameraFilter(e.target.value)} className={selCls}>
              <option value="">All cameras</option>
              {cameraOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selCls}>
              <option value="">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
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
                  setSearch(""); setCameraFilter(""); setMonthFilter(""); setUpcomingOnly(false);
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
            <div className="ui-table-wrap overflow-x-auto">
<table className="ui-table w-full border-collapse">
                <thead>
                  <tr>
                    {["Name","Camera","Pick-up","Return","Days","Mode","Fee","Status","Reserved"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-4 text-center font-mono text-xs text-[color:var(--color-dark-gray)]"
                      >
                        No rentals found.
                      </td>
                    </tr>
                  )}
                  {paginated.map((b, i) => {
                    const days = countDays(b.PICK_UP_DATE, b.RETURN_DATE);
                    const effectiveDays = days
                      ? days + (b.HALF_DAY_LATE ? 0.5 : 0) - (b.HALF_DAY_EARLY ? 0.5 : 0)
                      : null;
                    const displayDays = effectiveDays != null ? `${effectiveDays}d` : "—";
                    const status = (b.status || "").toLowerCase();
                    const fs = (b.FULFILLMENT_STATUS || "").toLowerCase();
                    const isOverdue = fs === "out" && b.RETURN_DATE && b.RETURN_DATE < todayIso();
                    const reservedAt = getReservedAt(b);
                    return (
                      <tr
                        key={b.responseId || i}
                        onClick={() => setActiveBooking(b)}
                        className="cursor-pointer bg-white hover:bg-[rgba(255,255,255,0.7)]"
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-semibold text-[color:var(--color-black)]">
                            {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
                          </div>
                          {b.CONTACT_NUMBER && (
                            <div className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                              {b.CONTACT_NUMBER}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-t-2 border-[rgba(58,58,58,0.16)] px-3 py-2 font-mono text-xs text-[color:var(--color-ink)]">
                          {b.PREFERRED_CAMERA || "—"}
                        </td>
                        <td className="whitespace-nowrap border-t-2 border-[rgba(58,58,58,0.16)] px-3 py-2 font-mono text-xs text-[color:var(--color-ink)]">
                          <div>{formatDate(b.PICK_UP_DATE)}</div>
                          {b.PICK_UP_TIME && (
                            <div className="text-[10px] text-[color:var(--color-dark-gray)]">{toAmPm(b.PICK_UP_TIME)}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-t-2 border-[rgba(58,58,58,0.16)] px-3 py-2 font-mono text-xs text-[color:var(--color-ink)]">
                          <div>{formatDate(b.RETURN_DATE)}</div>
                          {b.RETURN_TIME && (
                            <div className="text-[10px] text-[color:var(--color-dark-gray)]">{toAmPm(b.RETURN_TIME)}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center font-mono text-xs text-[color:var(--color-ink)]">
                          {displayDays}
                        </td>
                        <td className="whitespace-nowrap border-t-2 border-[rgba(58,58,58,0.16)] px-3 py-2 font-mono text-xs text-[color:var(--color-ink)]">
                          {b.PREFERRED_MODE || "—"}
                        </td>
                        <td className="whitespace-nowrap border-t-2 border-[rgba(58,58,58,0.16)] px-3 py-2 font-mono text-xs text-[color:var(--color-ink)]">
                          {b.RENTAL_FEE != null ? `₱${Number(b.RENTAL_FEE).toLocaleString()}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex flex-col items-start gap-1">
                            {status ? (
                              <span className={`px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${STATUS_STYLE[status] ?? STATUS_STYLE.approved}`}>
                                {status}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">—</span>
                            )}
                            {fs === "out" && (
                              <span className={`px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white ${isOverdue ? "bg-rose-600" : "bg-amber-500"}`}>
                                {isOverdue ? "overdue" : "out"}
                              </span>
                            )}
                            {fs === "returned" && (
                              <span className="bg-green-600 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                                returned
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                          {reservedAt ? formatDate(reservedAt.toISOString().slice(0, 10)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="ui-btn ui-btn--sm"
                >
                  ← Prev
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
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
