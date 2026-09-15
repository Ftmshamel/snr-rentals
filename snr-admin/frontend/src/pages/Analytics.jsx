import { useEffect, useState, useMemo } from "react";
import Header from "../components/Header.jsx";
import { apiGetJson } from "../utils/api.js";
import { todayISOLocal } from "../utils/dateHelpers.js";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

function formatMonth(yyyyMm) {
  const [y, m] = yyyyMm.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}
function formatMonthShort(yyyyMm) {
  const [y, m] = yyyyMm.split("-");
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

function formatPeso(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}₱${Math.abs(v).toLocaleString()}`;
}
// Compact peso for tight chart labels: 12500 → ₱12.5k, 700 → ₱700
function formatPesoCompact(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1000) {
    const k = v / 1000;
    return `₱${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `₱${v.toLocaleString()}`;
}
// Percent change vs a baseline; null when not meaningfully comparable.
function pctDelta(curr, prev) {
  if (prev == null || prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

// S&R no longer works with delivery riders, so the rider's share is no longer
// derived from the booking here. The ₱13,600 that was actually paid out over
// May–June 2026 now lives in the expenses table as one row per delivery — see
// backend/scripts/migrate-delivery-cuts-to-expenses.js — so it still reduces
// net income, just through the normal expense path like every other cost.

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "cameras",  label: "Cameras" },
  { id: "months",   label: "Months" },
];

const selCls =
  "ui-input ui-input--sm";

export default function Analytics() {
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState("");
  // "recent" = current + previous month (default), "all" = full history.
  const [monthScope, setMonthScope] = useState("recent");

  useEffect(() => {
    apiGetJson("/api/bookings")
      .then((data) => setBookings(data.bookings || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    apiGetJson("/api/expenses")
      .then((data) => setExpenses(data.expenses || []))
      .catch(() => {}); // expenses are optional — don't crash analytics if endpoint fails
  }, []);

  // Approved/legacy bookings with a fee
  const eligible = useMemo(() => bookings.filter((b) => {
    const s = (b.status || "").toLowerCase();
    if (s === "pending" || s === "rejected" || s === "cancelled") return false;
    return b.RENTAL_FEE != null;
  }), [bookings]);

  // ── All-time totals ───────────────────────────────────────────────────────────
  const totalRevenue  = useMemo(() => eligible.reduce((s, b) => s + Number(b.RENTAL_FEE), 0), [eligible]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const netIncome     = totalRevenue - totalExpenses;

  const deliveryCount = useMemo(
    () => eligible.filter((b) => (b.PREFERRED_MODE || "").trim().toLowerCase().startsWith("deliver")).length,
    [eligible],
  );
  const pickupCount = eligible.length - deliveryCount;
  const avgPerRental = eligible.length ? Math.round(totalRevenue / eligible.length) : 0;

  // ── By Camera ───────────────────────────────────────────────────────────────
  const byCamera = useMemo(() => {
    const map = {};
    eligible.forEach((b) => {
      const cam = b.PREFERRED_CAMERA || "Unknown";
      if (!map[cam]) map[cam] = { count: 0, total: 0 };
      map[cam].count++;
      map[cam].total += Number(b.RENTAL_FEE);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [eligible]);

  // ── By Month (descending: latest first) ───────────────────────────────────────
  const byMonth = useMemo(() => {
    const map = {};
    eligible.forEach((b) => {
      const mo = (b.PICK_UP_DATE || "").slice(0, 7);
      if (!mo) return;
      if (!map[mo]) map[mo] = { count: 0, total: 0, expenses: 0 };
      map[mo].count++;
      map[mo].total += Number(b.RENTAL_FEE);
    });
    expenses.forEach((e) => {
      const mo = (e.date || "").slice(0, 7);
      if (!mo) return;
      if (!map[mo]) map[mo] = { count: 0, total: 0, expenses: 0 };
      map[mo].expenses += Number(e.amount);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [eligible, expenses]);

  // The month views default to the current month and the one before it, which
  // is what you want day to day. But most of the history sits outside that
  // window — with the expenses all dated to earlier months, a hard 2-month cut
  // makes the Months tab disagree with the all-time Overview and read as
  // broken. So the window is a filter the user can widen, not a hard limit.
  // Either way `byMonth` keeps the full history: the snapshot deltas and the
  // month-over-month growth column still compare against real prior months.
  const visibleMonths = useMemo(() => {
    if (monthScope === "all") return byMonth;
    const cur = todayISOLocal().slice(0, 7);
    const [cy, cm] = cur.split("-").map(Number);
    const prevDate = new Date(cy, cm - 2, 1); // cm is 1-indexed → previous month
    const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const window = byMonth.filter(([mo]) => mo === cur || mo === prev);
    // A quiet start to the month shouldn't blank the page out.
    return window.length > 0 ? window : byMonth.slice(0, 2);
  }, [byMonth, monthScope]);

  const monthsAsc = useMemo(() => [...visibleMonths].reverse(), [visibleMonths]);

  const monthsHint =
    monthScope === "all"
      ? "Full history"
      : visibleMonths.length && byMonth.length > visibleMonths.length
        ? "Current and previous month"
        : "Most recent months";

  // Current calendar month vs previous calendar month (KPI deltas).
  // Anchored on today's date — NOT the latest month in the data, so future
  // reservations (e.g. July bookings made in June) don't hijack "this month".
  const snapshot = useMemo(() => {
    if (byMonth.length === 0) return null;
    const map = Object.fromEntries(byMonth);
    const curKey = todayISOLocal().slice(0, 7);
    const [cy, cm] = curKey.split("-").map(Number);
    const prevDate = new Date(cy, cm - 2, 1); // cm is 1-indexed → previous month
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const empty = { count: 0, total: 0, expenses: 0 };
    const cur = map[curKey] || empty;
    const prior = map[prevKey] || null;
    const net = (m) => m.total - m.expenses;
    return {
      label: formatMonth(curKey),
      revenue: cur.total,
      net: net(cur),
      rentals: cur.count,
      empty: cur === empty,
      dRevenue: pctDelta(cur.total, prior?.total),
      dNet:     prior ? pctDelta(net(cur), net(prior)) : null,
      dRentals: pctDelta(cur.count, prior?.count),
    };
  }, [byMonth]);

  const maxCameraTotal = byCamera.length ? Math.max(...byCamera.map(([, v]) => v.total)) : 1;
  const maxMonthTotal  = visibleMonths.length ? Math.max(...visibleMonths.map(([, v]) => v.total)) : 1;

  // Footer for the month table — scoped to the months on screen, so the column
  // sums actually add up to what's listed.
  const visibleTotals = useMemo(() => {
    const t = { count: 0, revenue: 0, expenses: 0 };
    visibleMonths.forEach(([, v]) => {
      t.count += v.count;
      t.revenue += v.total;
      t.expenses += v.expenses;
    });
    return { ...t, net: t.revenue - t.expenses };
  }, [visibleMonths]);

  // ── Month picker (Months tab) — defaults to current month, else latest ────────
  const monthMap = useMemo(() => Object.fromEntries(visibleMonths), [visibleMonths]);
  const monthKeys = visibleMonths.map(([k]) => k); // descending (current first)
  const currentMonthKey = todayISOLocal().slice(0, 7);
  const activeMonth =
    selectedMonth && monthMap[selectedMonth]
      ? selectedMonth
      : monthMap[currentMonthKey]
        ? currentMonthKey
        : monthKeys[0];
  const activeData = activeMonth ? monthMap[activeMonth] : null;

  const hasData = eligible.length > 0 || expenses.length > 0;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
              <div className="ui-kicker">Overview</div>
              <h1 className="ui-title font-display text-3xl">Analytics</h1>
            </div>
          {!loading && hasData && (
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              {eligible.length} rental{eligible.length !== 1 ? "s" : ""} recorded
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`ui-btn ui-btn--sm ${tab === t.id ? "ui-btn--solid" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Loading…
          </p>
        )}
        {error && <p className="font-mono text-xs text-rose-500">{error}</p>}

        {!loading && !error && !hasData && (
          <EmptyNote>No analytics data yet.</EmptyNote>
        )}

        {!loading && !error && hasData && (
          <>
            {tab === "overview" && (
              <div className="space-y-5">
                {/* KPI cards — latest month with MoM deltas */}
                {snapshot ? (
                  <div>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="ui-kicker text-[0.6rem]">
                        This month — {snapshot.label}
                      </span>
                      {snapshot.empty && (
                        <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                          no rentals yet
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <KpiCard label="Revenue"    value={formatPeso(snapshot.revenue)} delta={snapshot.dRevenue} />
                      <KpiCard label="Net Income" value={formatPeso(snapshot.net)} delta={snapshot.dNet} negative={snapshot.net < 0} />
                      <KpiCard label="Rentals"    value={String(snapshot.rentals)} delta={snapshot.dRentals} />
                    </div>
                  </div>
                ) : (
                  <div className="ui-card bg-[rgba(255,255,255,0.72)] px-6 py-5">
                    <div className="ui-kicker text-[0.6rem]">
                      Net Income · All time
                    </div>
                    <div className={`mt-1 font-mono text-4xl font-bold tracking-tight ${netIncome < 0 ? "text-rose-500" : "text-[color:var(--color-black)]"}`}>
                      {formatPeso(netIncome)}
                    </div>
                  </div>
                )}

                {/* Money flow — composition + ledger */}
                <Section title="Money Flow · All time">
                  {totalRevenue > 0 && netIncome >= 0 && (
                    <div className="mb-4">
                      <CompositionBar
                        total={totalRevenue}
                        segments={[
                          { label: "Net income", value: netIncome,     className: "bg-[color:var(--color-ink)]" },
                          { label: "Expenses",   value: totalExpenses, className: "bg-rose-400" },
                        ]}
                      />
                    </div>
                  )}
                  <div className="divide-y divide-[rgba(58,58,58,0.18)]">
                    <LedgerRow label="Total Revenue" value={totalRevenue} />
                    <LedgerRow label="Expenses" sub={`${expenses.length} item${expenses.length !== 1 ? "s" : ""}`} value={-totalExpenses} muted />
                    <LedgerRow label="Net Income" value={netIncome} strong highlight={netIncome < 0} />
                  </div>
                </Section>

                {/* Net income trend */}
                {monthsAsc.length >= 2 && (
                  <Section title="Net Income Trend" hint={monthsHint}>
                    <LineChart
                      points={monthsAsc.map(([mo, v]) => ({
                        label: formatMonthShort(mo),
                        value: v.total - v.expenses,
                      }))}
                    />
                  </Section>
                )}

                {/* Operations strip */}
                <div className="ui-surface grid grid-cols-2 gap-px overflow-hidden bg-[rgba(238,238,234,0.85)] sm:grid-cols-4">
                  <MiniStat label="Rentals"      value={String(eligible.length)} />
                  <MiniStat label="Deliveries"   value={String(deliveryCount)} />
                  <MiniStat label="Pick-ups"     value={String(pickupCount)} />
                  <MiniStat label="Avg / Rental" value={avgPerRental ? formatPeso(avgPerRental) : "—"} />
                </div>
              </div>
            )}

            {tab === "cameras" && (
              <div className="space-y-5">
                {byCamera.length === 0 ? (
                  <EmptyNote>No camera income recorded.</EmptyNote>
                ) : (
                  <>
                    <Section title="Income by Camera">
                      <BarChart
                        max={maxCameraTotal}
                        data={byCamera.map(([cam, v]) => ({ key: cam, label: cam, ...v }))}
                      />
                    </Section>
                    <Section title="Camera Breakdown">
                      <BreakdownTable
                        head={["Camera", "Rentals", "Revenue", "Share"]}
                        rows={byCamera.map(([cam, v]) => ({
                          key: cam,
                          cells: [
                            { v: cam, label: true },
                            { v: v.count },
                            { v: formatPeso(v.total), strong: true },
                            { v: totalRevenue ? `${Math.round((v.total / totalRevenue) * 100)}%` : "—", muted: true },
                          ],
                        }))}
                        totals={["Total", eligible.length, formatPeso(totalRevenue), "100%"]}
                      />
                    </Section>
                  </>
                )}
              </div>
            )}

            {tab === "months" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "recent", label: "Recent" },
                      { id: "all", label: "All months" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setMonthScope(s.id);
                          setSelectedMonth("");
                        }}
                        className={`ui-btn ui-btn--sm ${monthScope === s.id ? "ui-btn--solid" : ""}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                    {monthScope === "recent"
                      ? `Showing ${visibleMonths.length} of ${byMonth.length} months`
                      : `All ${byMonth.length} months`}
                  </span>
                </div>

                {visibleMonths.length === 0 ? (
                  <EmptyNote>No monthly income recorded.</EmptyNote>
                ) : (
                  <>
                    <Section title="Monthly Overview">
                      <div className="mb-4">
                        <select
                          value={activeMonth}
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className={selCls}
                        >
                          {monthKeys.map((k) => (
                            <option key={k} value={k}>
                              {formatMonth(k)}{k > currentMonthKey ? " (upcoming)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      {activeData && (() => {
                        const rev = activeData.total;
                        const exp = activeData.expenses;
                        const net = rev - exp;
                        const rentals = activeData.count;
                        const avg = rentals ? Math.round(rev / rentals) : 0;
                        return (
                          <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
                            <div>
                              <div className="mb-2 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                                {rentals} rental{rentals !== 1 ? "s" : ""}{avg ? ` · avg ${formatPeso(avg)}` : ""}
                              </div>
                              <div className="divide-y divide-[rgba(58,58,58,0.18)]">
                                <LedgerRow label="Revenue" value={rev} strong />
                                <LedgerRow label="Expenses" value={-exp} muted />
                                <LedgerRow label="Net Income" value={net} strong highlight={net < 0} />
                              </div>
                            </div>
                            <DonutChart
                              centerLabel="Net"
                              centerValue={formatPesoCompact(net)}
                              centerNegative={net < 0}
                              segments={[
                                { label: "Net income", value: net, arc: "stroke-[color:var(--color-ink)]", dot: "bg-[color:var(--color-ink)]" },
                                { label: "Expenses",   value: exp, arc: "stroke-rose-400",                  dot: "bg-rose-400" },
                              ]}
                            />
                          </div>
                        );
                      })()}
                    </Section>
                    <Section title="Income by Month" hint={monthsHint}>
                      <BarChart
                        max={maxMonthTotal}
                        data={visibleMonths.map(([mo, v]) => ({ key: mo, label: formatMonthShort(mo), ...v }))}
                      />
                    </Section>
                    <Section title="Month Breakdown">
                      <BreakdownTable
                        head={["Month", "Rentals", "Revenue", "Growth", "Expenses", "Net"]}
                        rows={visibleMonths.map(([mo, v]) => {
                          const net = v.total - v.expenses;
                          // byMonth is the full descending history, so the next
                          // entry after this month is the one before it.
                          const idx = byMonth.findIndex(([k]) => k === mo);
                          const prior = byMonth[idx + 1]?.[1];
                          const growth = pctDelta(v.total, prior?.total);
                          return {
                            key: mo,
                            cells: [
                              { v: formatMonth(mo), label: true },
                              { v: v.count },
                              { v: formatPeso(v.total), strong: true },
                              { v: <DeltaText delta={growth} />, raw: true },
                              { v: formatPeso(v.expenses), muted: true },
                              { v: formatPeso(net), strong: true, highlight: net < 0 },
                            ],
                          };
                        })}
                        totals={[monthScope === "all" ? "Total" : "Shown", visibleTotals.count, formatPeso(visibleTotals.revenue), "", formatPeso(visibleTotals.expenses), formatPeso(visibleTotals.net)]}
                      />
                    </Section>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Presentational components ───────────────────────────────────────────────────

function Section({ title, hint, children }) {
  return (
    <div className="ui-card bg-[rgba(255,255,255,0.72)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--color-border)] px-5 py-2.5">
        <span className="ui-kicker text-[0.6rem]">{title}</span>
        {hint && (
          <span className="font-mono text-[0.6rem] text-[color:var(--color-dark-gray)]">
            {hint}
          </span>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
      {children}
    </p>
  );
}

function DeltaText({ delta }) {
  if (delta == null) return <span className="text-[color:var(--color-dark-gray)]">—</span>;
  const up = delta > 0, down = delta < 0;
  const color = up ? "text-green-600" : down ? "text-rose-500" : "text-[color:var(--color-dark-gray)]";
  return <span className={color}>{up ? "▲" : down ? "▼" : "—"} {Math.abs(delta).toFixed(0)}%</span>;
}

function KpiCard({ label, value, delta, negative }) {
  return (
    <div className="ui-card bg-[rgba(255,255,255,0.72)] px-4 py-3">
      <div className="ui-kicker text-[0.6rem]">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${negative ? "text-rose-500" : "text-[color:var(--color-black)]"}`}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px]">
        <DeltaText delta={delta} />
        <span className="ml-1.5 text-[color:var(--color-dark-gray)]">vs prev month</span>
      </div>
    </div>
  );
}

function LedgerRow({ label, sub, value, muted, strong, highlight }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className={`font-mono text-xs ${strong ? "font-bold text-[color:var(--color-black)]" : "text-[color:var(--color-ink)]"}`}>
          {label}
        </span>
        {sub && <span className="ml-2 font-mono text-[10px] text-[color:var(--color-dark-gray)]">{sub}</span>}
      </span>
      <span
        className={`shrink-0 font-mono text-sm tabular-nums ${
          highlight
            ? "font-bold text-rose-500"
            : strong
              ? "font-bold text-[color:var(--color-black)]"
              : muted
                ? "text-[color:var(--color-dark-gray)]"
                : "text-[color:var(--color-ink)]"
        }`}
      >
        {formatPeso(value)}
      </span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="ui-kicker text-[0.6rem]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg font-bold text-[color:var(--color-black)]">
        {value}
      </div>
    </div>
  );
}

function CompositionBar({ segments, total }) {
  const base = total || segments.reduce((s, x) => s + Math.max(x.value, 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border-2 border-[color:var(--color-border)]">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className={s.className}
              style={{ width: `${(s.value / base) * 100}%` }}
              title={`${s.label}: ${formatPeso(s.value)} (${Math.round((s.value / base) * 100)}%)`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 ${s.className}`} />
            {s.label} {Math.round((Math.max(s.value, 0) / base) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerValue, centerNegative }) {
  const total = segments.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const size = 140, stroke = 26, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-36 w-36">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          {total > 0 ? (
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {segments.map((s) => {
                const val = Math.max(s.value, 0);
                if (val <= 0) return null;
                const len = (val / total) * C;
                const el = (
                  <circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    className={s.arc}
                    strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                    strokeDashoffset={(-offset).toFixed(2)}
                  />
                );
                offset += len;
                return el;
              })}
            </g>
          ) : (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-[rgba(58,58,58,0.25)]" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
              {centerLabel}
            </span>
          )}
          <span className={`font-mono text-sm font-bold ${centerNegative ? "text-rose-500" : "text-[color:var(--color-black)]"}`}>
            {centerValue}
          </span>
        </div>
      </div>
      <div className="w-full max-w-[220px] space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 font-mono text-[10px]">
            <span className={`inline-block h-2.5 w-2.5 shrink-0 ${s.dot}`} />
            <span className="text-[color:var(--color-dark-gray)]">{s.label}</span>
            <span className="ml-auto tabular-nums text-[color:var(--color-ink)]">{formatPeso(s.value)}</span>
            <span className="w-9 text-right tabular-nums text-[color:var(--color-dark-gray)]">
              {total > 0 ? Math.round((Math.max(s.value, 0) / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ points }) {
  if (points.length < 2) return null;
  const W = 320, H = 96, pad = 8;
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - min) / range);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const zeroY = y(0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
        <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} className="stroke-[rgba(58,58,58,0.25)]" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={area} className="fill-[rgba(58,58,58,0.14)]" />
        <path d={line} className="fill-none stroke-[color:var(--color-ink)]" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="2.5" className="fill-[color:var(--color-ink)]" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-[color:var(--color-dark-gray)]">
        {points.map((p, i) => <span key={i}>{p.label}</span>)}
      </div>
    </div>
  );
}

function BreakdownTable({ head, rows, totals }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 font-bold ${i === 0 ? "pr-3" : "px-3 text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[rgba(58,58,58,0.16)] last:border-0">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={`py-2 ${i === 0 ? "pr-3" : "px-3 text-right tabular-nums"} ${
                    c.highlight
                      ? "font-bold text-rose-500"
                      : c.strong
                        ? "font-bold text-[color:var(--color-black)]"
                        : c.muted
                          ? "text-[color:var(--color-dark-gray)]"
                          : c.label
                            ? "text-[color:var(--color-ink)]"
                            : "text-[color:var(--color-dark-gray)]"
                  }`}
                >
                  {c.v}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className="border-t-2 border-[color:var(--color-border)]">
              {totals.map((t, i) => (
                <td
                  key={i}
                  className={`py-2 font-bold text-[color:var(--color-black)] ${i === 0 ? "pr-3 text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]" : "px-3 text-right tabular-nums"}`}
                >
                  {t}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ data, max }) {
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex h-52 items-stretch gap-2 sm:gap-3">
          {data.map((d) => {
            const pct = max ? Math.max((d.total / max) * 100, 1.5) : 0;
            const net = d.total - (d.expenses || 0);
            const title =
              `${d.label} — revenue ${formatPeso(d.total)}` +
              (d.expenses ? ` · exp ${formatPeso(d.expenses)}` : "") +
              ` · net ${formatPeso(net)}`;
            return (
              <div key={d.key} title={title} className="flex min-w-[46px] flex-1 flex-col items-center">
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div className="mb-1 text-center font-mono text-[9px] font-bold text-[color:var(--color-ink)]">
                    {formatPesoCompact(d.total)}
                  </div>
                  <div
                    className="mx-auto w-8 overflow-hidden rounded-t-[4px] bg-[color:var(--color-ink)] sm:w-10"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 w-full px-0.5 text-center">
                  <div className="break-words font-mono text-[9px] leading-tight text-[color:var(--color-ink)]">
                    {d.label}
                  </div>
                  <div className="font-mono text-[9px] text-[color:var(--color-dark-gray)]">
                    {d.count} rental{d.count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
