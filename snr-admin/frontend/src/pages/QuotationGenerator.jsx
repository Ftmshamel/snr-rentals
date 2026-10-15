import { useState, useMemo, useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import DateRangeCalendar from "../components/DateRangeCalendar.jsx";
import { useCameras } from "../hooks/useCameras.js";
import { apiGetJson } from "../utils/api.js";
import {
  isPartialBooking,
  withDocuments,
} from "../utils/bookingDocuments.js";
import {
  documentOpenLabel,
  documentThumb,
  documentView,
} from "../utils/documentRefs.js";
import { todayISOLocal } from "../utils/dateHelpers.js";

const DEFAULT_SECURITY_DEPOSIT = "1000";
const RUSH_FEE = 300;

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

function formatDateRange(pickUp, ret) {
  if (!pickUp || !ret) return "";
  const p = new Date(pickUp + "T00:00:00");
  const r = new Date(ret + "T00:00:00");
  if (p.getFullYear() === r.getFullYear() && p.getMonth() === r.getMonth()) {
    return `${MONTHS[p.getMonth()]} ${p.getDate()}-${r.getDate()}, ${p.getFullYear()}`;
  }
  if (p.getFullYear() === r.getFullYear()) {
    return `${MONTHS[p.getMonth()]} ${p.getDate()} - ${MONTHS[r.getMonth()]} ${r.getDate()}, ${p.getFullYear()}`;
  }
  return `${MONTHS[p.getMonth()]} ${p.getDate()}, ${p.getFullYear()} - ${MONTHS[r.getMonth()]} ${r.getDate()}, ${r.getFullYear()}`;
}

/** "Sep 3" — used for the half-picked range readout. */
function fmtDayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function countDays(pickUp, ret) {
  if (!pickUp || !ret) return 0;
  const diff = Math.round(
    (new Date(ret + "T00:00:00") - new Date(pickUp + "T00:00:00")) / 86400000,
  );
  return diff > 0 ? diff : 0;
}

function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(todayISOLocal() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

function getAutoRate(pricing, days) {
  if (!pricing || !days) return null;
  const tier = pricing.find(
    (t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays),
  );
  return tier ? tier.pricePerDay : null;
}

const checkboxClass =
  "flex cursor-pointer items-center gap-2 text-sm font-semibold text-[color:var(--color-ink)]";
const inputClass = "ui-input";
const labelClass = "ui-label";

export default function QuotationGenerator() {
  const [tab, setTab] = useState("reservation");

  return (
    <div>
      <Header titleExtra="Quotation" />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <div className="ui-kicker">Generator</div>
          <h1 className="ui-title font-display text-3xl">Quotation</h1>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          <TabButton
            active={tab === "reservation"}
            onClick={() => setTab("reservation")}
          >
            Reservation
          </TabButton>
          <TabButton
            active={tab === "balance"}
            onClick={() => setTab("balance")}
          >
            Remaining Balance
          </TabButton>
        </div>

        {tab === "reservation" ? <ReservationQuote /> : <BalanceQuote />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-btn ui-btn--sm ${active ? "ui-btn--solid" : ""}`}
    >
      {children}
    </button>
  );
}

function OutputBlock({ output, placeholder }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!output) {
    return (
      <p className="mt-4 font-mono text-xs font-medium text-[color:var(--color-dark-gray)]">
        {placeholder}
      </p>
    );
  }

  return (
    <div className="ui-card mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b-2 border-dashed border-[rgba(58,58,58,0.28)] px-4 py-2.5">
        <span className="ui-kicker">Output</span>
        <button
          type="button"
          onClick={handleCopy}
          className="ui-btn ui-btn--sm"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap bg-[rgba(255,255,255,0.7)] px-4 py-4 font-mono text-sm leading-relaxed text-[color:var(--color-black)]">
        {output}
      </pre>
    </div>
  );
}

function ReservationQuote() {
  const { cameras, loading } = useCameras();
  const [cameraName, setCameraName] = useState("");
  const [pickUp, setPickUp] = useState("");
  const [ret, setRet] = useState("");
  const [manualRate, setManualRate] = useState(false);
  const [rate, setRate] = useState("");
  const [halfDayLate, setHalfDayLate] = useState(false);
  const [halfDayEarly, setHalfDayEarly] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [securityDeposit, setSecurityDeposit] = useState(
    DEFAULT_SECURITY_DEPOSIT,
  );

  useEffect(() => {
    if (cameras.length > 0 && !cameraName) {
      setCameraName(cameras[0].name);
    }
  }, [cameras, cameraName]);

  const currentCamera = cameras.find((c) => c.name === cameraName);
  const availableAddOns = currentCamera?.addOns ?? [];

  function handleCameraChange(name) {
    setCameraName(name);
    setSelectedAddOns([]);
    setRate("");
    setManualRate(false);
  }

  function toggleAddOn(addOnName) {
    setSelectedAddOns((prev) =>
      prev.includes(addOnName)
        ? prev.filter((n) => n !== addOnName)
        : [...prev, addOnName],
    );
  }

  const days = useMemo(() => countDays(pickUp, ret), [pickUp, ret]);
  // Quotes always use the current rate, regardless of the picked date —
  // unlike BookingModal/RentalsReport, which price existing bookings at the
  // rate they were actually made under.
  const autoRate = getAutoRate(currentCamera?.pricing, days);
  const effectiveRate = manualRate && rate ? Number(rate) : (autoRate ?? 0);

  const halfDayFee = effectiveRate ? Math.round(effectiveRate * 0.5) : 0;
  const effectiveDays =
    days + (halfDayLate ? 0.5 : 0) - (halfDayEarly ? 0.5 : 0);
  const cameraTotal = effectiveRate && days ? effectiveRate * effectiveDays : 0;

  const selectedAddOnItems = availableAddOns.filter((a) =>
    selectedAddOns.includes(a.name),
  );
  const addOnDailyTotal = selectedAddOnItems.reduce(
    (s, a) => s + a.pricePerDay,
    0,
  );
  const addOnTotal = addOnDailyTotal * effectiveDays;
  const daysBeforePickup = daysUntil(pickUp);
  const rushFee = daysBeforePickup === 0 ? RUSH_FEE : 0;
  const rentalTotal = cameraTotal + addOnTotal + rushFee;
  const deposit = Number(securityDeposit) || 0;
  const packageTotal = rentalTotal + deposit;
  const downpayment = rentalTotal ? Math.ceil(rentalTotal * 0.2) : 0;

  const output = useMemo(() => {
    if (!cameraName || !pickUp || !ret || !effectiveRate || days === 0)
      return "";
    const dateRange = formatDateRange(pickUp, ret);

    const displayDays = `${effectiveDays} day${effectiveDays !== 1 ? "s" : ""}`;
    const rentalFeeLine = `Rental Fee: ₱${effectiveRate.toLocaleString()} x ${displayDays} = ₱${cameraTotal.toLocaleString()}`;

    let addOnsLine;
    if (selectedAddOnItems.length === 0) {
      addOnsLine = "None";
    } else {
      const names = selectedAddOnItems.map((a) => a.name).join(" + ");
      addOnsLine = `${names} (₱${addOnDailyTotal.toLocaleString()}/day x ${effectiveDays} day${effectiveDays !== 1 ? "s" : ""} = ₱${addOnTotal.toLocaleString()})`;
    }

    const lines = [
      `Rental Dates: ${dateRange}`,
      `Unit: ${cameraName}`,
      ``,
      rentalFeeLine,
      `Add-Ons: ${addOnsLine}`,
      ...(rushFee > 0 ? [`Rush Fee: ₱${rushFee.toLocaleString()}`] : []),
    ];

    lines.push(`Total Rental Fee: ₱${rentalTotal.toLocaleString()}`);
    if (deposit > 0) {
      lines.push(
        `Security Deposit (Refundable): ₱${deposit.toLocaleString()}`,
      );
    }
    lines.push(`Total Package Amount: ₱${packageTotal.toLocaleString()}`);

    lines.push(`Downpayment (20%): ₱${downpayment.toLocaleString()}`);
    lines.push(``);
    lines.push(
      `please take note po that the downpayment is deductible from your total rent fee 😊`,
    );

    return lines.join("\n");
  }, [
    cameraName,
    pickUp,
    ret,
    effectiveRate,
    halfDayLate,
    halfDayEarly,
    halfDayFee,
    days,
    effectiveDays,
    selectedAddOnItems,
    addOnDailyTotal,
    addOnTotal,
    rushFee,
    cameraTotal,
    rentalTotal,
    deposit,
    packageTotal,
    downpayment,
  ]);

  return (
    <>
      <div className="ui-panel space-y-4 p-5">
        {/* Camera */}
        <div>
          <label className={labelClass}>Camera Unit</label>
          {loading ? (
            <div className="ui-skeleton h-9" />
          ) : (
            <select
              value={cameraName}
              onChange={(e) => handleCameraChange(e.target.value)}
              className={inputClass}
            >
              {cameras.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Dates — one calendar, first click is pick-up, second is return */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label className={labelClass}>Rental Dates</label>
            <span className="font-mono text-[11px] text-[color:var(--color-dark-gray)]">
              {pickUp && ret
                ? formatDateRange(pickUp, ret)
                : pickUp
                  ? `${fmtDayLabel(pickUp)} → …`
                  : "—"}
            </span>
          </div>
          <DateRangeCalendar
            start={pickUp}
            end={ret}
            onChange={(nextStart, nextEnd) => {
              setPickUp(nextStart);
              setRet(nextEnd);
            }}
          />
        </div>
        {days > 0 && (
          <p className="font-mono text-xs text-[color:var(--color-dark-gray)]">
            {effectiveDays} day{effectiveDays !== 1 ? "s" : ""}
            {autoRate && !manualRate && (
              <span className="ml-2 text-[color:var(--color-dark-gray)]">
                · {days <= 2 ? "1–2 day" : days <= 4 ? "3–4 day" : "5+ day"}{" "}
                rate: ₱{autoRate}/day
              </span>
            )}
          </p>
        )}

        {/* Half day checkboxes */}
        {days > 0 && effectiveRate > 0 && (
          <div className="space-y-2">
            <label className={checkboxClass}>
              <input
                type="checkbox"
                checked={halfDayLate}
                onChange={(e) => setHalfDayLate(e.target.checked)}
                className="accent-[color:var(--color-ink)]"
              />
              Add half day for late return
              {halfDayLate && (
                <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                  +₱{halfDayFee.toLocaleString()}
                </span>
              )}
            </label>
            <label className={checkboxClass}>
              <input
                type="checkbox"
                checked={halfDayEarly}
                onChange={(e) => setHalfDayEarly(e.target.checked)}
                className="accent-[color:var(--color-ink)]"
              />
              Subtract half day for early return
              {halfDayEarly && (
                <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                  −₱{halfDayFee.toLocaleString()}
                </span>
              )}
            </label>
          </div>
        )}

        {/* Manual rate */}
        <div>
          <label className={checkboxClass}>
            <input
              type="checkbox"
              checked={manualRate}
              onChange={(e) => {
                setManualRate(e.target.checked);
                if (!e.target.checked) setRate("");
              }}
              className="accent-[color:var(--color-ink)]"
            />
            Manual daily rate
            {!manualRate && autoRate && (
              <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                (currently ₱{autoRate}/day)
              </span>
            )}
          </label>
          {manualRate && (
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Enter custom rate"
              className={`mt-2 ${inputClass}`}
            />
          )}
        </div>

        {/* Add-ons */}
        {availableAddOns.length > 0 && (
          <div>
            <label className={labelClass}>Add-Ons</label>
            <div className="ui-surface space-y-1 p-3">
              {availableAddOns.map((a) => (
                <label
                  key={a.name}
                  className="flex cursor-pointer items-center justify-between gap-2 py-0.5"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAddOns.includes(a.name)}
                      onChange={() => toggleAddOn(a.name)}
                      className="accent-[color:var(--color-ink)]"
                    />
                    <span className="font-mono text-sm text-[color:var(--color-ink)]">
                      {a.name}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
                    ₱{a.pricePerDay}/day
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Security Deposit (Refundable)</label>
          <input
            type="number"
            min="0"
            value={securityDeposit}
            onChange={(e) => setSecurityDeposit(e.target.value)}
            placeholder="e.g. 1000"
            className={inputClass}
          />
        </div>

        {rentalTotal > 0 && (
          <p className="font-mono text-xs text-[color:var(--color-dark-gray)]">
            Rental ₱{rentalTotal.toLocaleString()} + Deposit ₱
            {deposit.toLocaleString()} = Package ₱{packageTotal.toLocaleString()}
          </p>
        )}
      </div>

      <OutputBlock
        output={output}
        placeholder="Fill in all fields to generate the quotation."
      />
    </>
  );
}

function BalanceQuote() {
  const [rentalFee, setRentalFee] = useState("");
  const [rushFee, setRushFee] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState(DEFAULT_SECURITY_DEPOSIT);
  const [manualDp, setManualDp] = useState(false);
  const [downpaymentPaid, setDownpaymentPaid] = useState("");

  // Renter search / auto-fill
  const [bookings, setBookings] = useState([]);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const pendingProofRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    apiGetJson("/api/bookings")
      .then((data) => setBookings(data.bookings || []))
      .catch(() => {});
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return bookings
      .filter((b) => {
        const hay = [
          b.FACEBOOK_ACCOUNT_NAME,
          b.FULL_NAME,
          b.CONTACT_NUMBER,
          b.PREFERRED_CAMERA,
        ]
          .map((v) => (v || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [bookings, query]);

  function selectRenter(b) {
    setSelected(b);
    setQuery(b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "");
    setShowResults(false);
    setRentalFee(b.RENTAL_FEE != null ? String(b.RENTAL_FEE) : "");
    setRushFee(b.RUSH_FEE != null ? String(b.RUSH_FEE) : "");
    setSecurityDeposit(DEFAULT_SECURITY_DEPOSIT);
    if (b.DOWNPAYMENT_PAID != null) {
      setManualDp(true);
      setDownpaymentPaid(String(b.DOWNPAYMENT_PAID));
    } else {
      setManualDp(false);
      setDownpaymentPaid("");
    }

    // The proof of downpayment isn't in the list payload — pull it for this
    // booking alone. Everything above is already correct, so the thumbnail just
    // appears when it arrives. The ref keeps a slower earlier request from
    // overwriting a renter picked since.
    if (isPartialBooking(b)) {
      pendingProofRef.current = b.responseId;
      setProofLoading(true);
      withDocuments(b)
        .then((full) => {
          if (pendingProofRef.current !== full.responseId) return;
          setSelected(full);
        })
        .catch(() => {
          /* the quotation text does not depend on the proof image */
        })
        .finally(() => {
          if (pendingProofRef.current === b.responseId) setProofLoading(false);
        });
    }
  }

  function clearRenter() {
    pendingProofRef.current = null;
    setProofLoading(false);
    setSelected(null);
    setQuery("");
    setShowResults(false);
  }

  const proofIds = Array.isArray(selected?.PROOF_OF_DOWNPAYMENT)
    ? selected.PROOF_OF_DOWNPAYMENT
    : [];

  const fee = Number(rentalFee) || 0;
  const rush = Number(rushFee) || 0;
  const deposit = Number(securityDeposit) || 0;
  const autoDp = fee ? Math.ceil(fee * 0.2) : 0;
  const dp = manualDp && downpaymentPaid !== "" ? Number(downpaymentPaid) : autoDp;

  const packageTotal = fee + rush + deposit;
  const remaining = packageTotal - dp;

  const output = useMemo(() => {
    if (!fee) return "";

    const isPct = dp === autoDp;
    const dpLabel = isPct
      ? "Minus 20% Downpayment (Paid)"
      : "Minus Downpayment (Paid)";

    const lines = [];
    lines.push("📊 Rental Summary");
    lines.push(`Total Rental Fee: ₱${fee.toLocaleString()}`);
    lines.push("");
    if (rush > 0) {
      lines.push(`Rush Fee: ₱${rush.toLocaleString()}`);
      lines.push("");
    }
    if (deposit > 0) {
      lines.push(`Security Deposit (Refundable): ₱${deposit.toLocaleString()}`);
      lines.push("");
    }
    lines.push(`Total Package Amount: ₱${packageTotal.toLocaleString()}`);
    lines.push("");
    lines.push("💰 Payment Breakdown");
    lines.push(`${dpLabel}: -₱${dp.toLocaleString()}`);
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push(`TOTAL REMAINING BALANCE: 🟩 ₱${remaining.toLocaleString()}`);

    return lines.join("\n");
  }, [fee, rush, deposit, dp, autoDp, packageTotal, remaining]);

  return (
    <>
      {lightbox && (
        <div
          className="ui-overlay z-[60] flex-col"
          onClick={() => setLightbox(null)}
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Proof of Downpayment · tap anywhere to close
          </p>
          <img
            src={documentThumb(lightbox, 1600)}
            alt="Proof of downpayment"
            className="max-h-[75vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={documentView(lightbox)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 font-mono text-xs text-[color:var(--color-dark-gray)] underline"
            onClick={(e) => e.stopPropagation()}
          >
            {documentOpenLabel(lightbox)}
          </a>
        </div>
      )}

      <div className="ui-panel space-y-4 p-5">
        {/* Renter search */}
        <div className="relative">
          <label className={labelClass}>Search Renter</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Name, contact, or camera…"
              className={inputClass}
            />
            {selected && (
              <button
                type="button"
                onClick={clearRenter}
                className="shrink-0 ui-btn ui-btn--sm text-[color:var(--color-dark-gray)] hover:bg-[rgba(255,255,255,0.6)]"
              >
                Clear
              </button>
            )}
          </div>
          {showResults && matches.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto ui-card bg-[rgba(255,255,255,0.72)] shadow-lg">
              {matches.map((b) => (
                <button
                  key={b.responseId}
                  type="button"
                  onClick={() => selectRenter(b)}
                  className="flex w-full items-center justify-between gap-2 border-b border-[rgba(58,58,58,0.16)] px-3 py-2 text-left last:border-0 hover:bg-[rgba(255,255,255,0.6)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-[color:var(--color-black)]">
                      {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                      {b.PREFERRED_CAMERA || "—"} · {b.PICK_UP_DATE || "—"}
                    </span>
                  </span>
                  {b.RENTAL_FEE != null && (
                    <span className="shrink-0 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                      ₱{Number(b.RENTAL_FEE).toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Proof of downpayment */}
        {selected && (
          <div>
            <label className={labelClass}>Proof of Downpayment</label>
            {proofLoading ? (
              <div className="ui-skeleton h-40 w-56" />
            ) : proofIds.length === 0 ? (
              <p className="font-mono text-xs font-medium text-[color:var(--color-dark-gray)]">
                No proof of downpayment uploaded.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {proofIds.map((id, index) => (
                  <button
                    key={`proof-${index}`}
                    type="button"
                    onClick={() => setLightbox(id)}
                    className="rounded-row border border-[color:var(--color-border)]"
                  >
                    <img
                      src={documentThumb(id, 400)}
                      alt="Proof of downpayment"
                      className="h-40 w-auto object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelClass}>Total Rental Fee</label>
          <input
            type="number"
            value={rentalFee}
            onChange={(e) => setRentalFee(e.target.value)}
            placeholder="e.g. 1500"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 overflow-hidden">
            <label className={labelClass}>Rush Fee</label>
            <input
              type="number"
              value={rushFee}
              onChange={(e) => setRushFee(e.target.value)}
              placeholder={`₱${RUSH_FEE}`}
              className={inputClass}
            />
          </div>
          <div className="min-w-0 overflow-hidden">
            <label className={labelClass}>Security Deposit</label>
            <input
              type="number"
              value={securityDeposit}
              onChange={(e) => setSecurityDeposit(e.target.value)}
              placeholder="Refundable"
              className={inputClass}
            />
          </div>
        </div>

        {/* Downpayment */}
        <div>
          <label className={checkboxClass}>
            <input
              type="checkbox"
              checked={manualDp}
              onChange={(e) => {
                setManualDp(e.target.checked);
                if (!e.target.checked) setDownpaymentPaid("");
              }}
              className="accent-[color:var(--color-ink)]"
            />
            Manual downpayment amount
            {!manualDp && fee > 0 && (
              <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                (20% = ₱{autoDp.toLocaleString()})
              </span>
            )}
          </label>
          {manualDp && (
            <input
              type="number"
              value={downpaymentPaid}
              onChange={(e) => setDownpaymentPaid(e.target.value)}
              placeholder="Enter amount paid"
              className={`mt-2 ${inputClass}`}
            />
          )}
        </div>

        {fee > 0 && (
          <p className="font-mono text-xs text-[color:var(--color-dark-gray)]">
            Package ₱{packageTotal.toLocaleString()} − DP ₱{dp.toLocaleString()}{" "}
            = Balance ₱{remaining.toLocaleString()}
          </p>
        )}
      </div>

      <OutputBlock
        output={output}
        placeholder="Enter the total rental fee to generate the balance quote."
      />
    </>
  );
}
