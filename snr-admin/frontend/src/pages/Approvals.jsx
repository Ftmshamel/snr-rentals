import { useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import { apiGetJson, apiPatchJson } from "../utils/api.js";
import { MemberBadge } from "../utils/loyalty.jsx";
import {
  documentOpenLabel,
  documentThumb,
  documentView,
} from "../utils/documentRefs.js";

const DOC_FIELDS = [
  { label: "1st ID", key: "1st_ID" },
  { label: "2nd ID", key: "2nd_ID" },
  { label: "Proof of Billing", key: "PROOF_OF_BILLING" },
  { label: "Selfie with ID", key: "SELFIE_HOLDING_YOUR_ID's" },
  { label: "Proof of Downpayment", key: "PROOF_OF_DOWNPAYMENT" },
];

function formatDate(iso) {
  if (!iso) return "—";
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toAmPm(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function Approvals() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetJson("/api/bookings/pending");
      // Priority members (Platinum by default) are reviewed first.
      const list = data.bookings || [];
      setBookings([...list.filter((b) => b.MEMBER?.priority), ...list.filter((b) => !b.MEMBER?.priority)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(booking, status) {
    try {
      await apiPatchJson(
        `/api/bookings/${encodeURIComponent(booking.responseId)}`,
        { status },
      );
      setBookings((prev) =>
        prev.filter((b) => b.responseId !== booking.responseId),
      );
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="min-h-screen">
      {lightbox && (
        <div
          className="ui-overlay z-[60] flex-col"
          onClick={() => setLightbox(null)}
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            {lightbox.label} · tap anywhere to close
          </p>
          <img
            src={documentThumb(lightbox.id, 1600)}
            alt={lightbox.label}
            className="max-h-[75vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={documentView(lightbox.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 font-mono text-xs text-[color:var(--color-dark-gray)] underline"
            onClick={(e) => e.stopPropagation()}
          >
            {documentOpenLabel(lightbox.id)}
          </a>
        </div>
      )}

      <Header />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="ui-kicker">Queue</div>
            <h1 className="ui-title font-display text-3xl">Approvals</h1>
          </div>
          {!loading && (
            <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
              {bookings.length} pending
            </span>
          )}
        </div>

        {loading && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Loading…
          </p>
        )}
        {error && <p className="font-mono text-xs text-rose-400">{error}</p>}
        {!loading && !error && bookings.length === 0 && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            No pending approvals.
          </p>
        )}

        <div className="space-y-4">
          {bookings.map((b) => (
            <BookingCard
              key={b.responseId}
              booking={b}
              onApprove={() => setStatus(b, "approved")}
              onReject={() => setStatus(b, "rejected")}
              onCancel={() => setStatus(b, "cancelled")}
              onLightbox={setLightbox}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function BookingCard({
  booking: b,
  onApprove,
  onReject,
  onCancel,
  onLightbox,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(null); // "approve" | "reject" | "cancel"

  const docs = DOC_FIELDS.flatMap(({ label, key }) => {
    const ids = b[key];
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return ids.map((id) => ({ label, id }));
  });

  function handleAction(action) {
    if (confirming === action) {
      if (action === "approve") onApprove();
      else if (action === "reject") onReject();
      else onCancel();
      setConfirming(null);
    } else {
      setConfirming(action);
    }
  }

  return (
    <div className="ui-card">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-bold text-[color:var(--color-black)]">
                {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
              </span>
              <MemberBadge member={b.MEMBER} />
            </div>
            <div className="mt-0.5 text-sm text-[color:var(--color-dark-gray)]">
              {b.PREFERRED_CAMERA || "—"}
            </div>
            <div className="mt-1 font-mono text-xs text-[color:var(--color-dark-gray)]">
              {formatDate(b.PICK_UP_DATE)} {toAmPm(b.PICK_UP_TIME)} →{" "}
              {formatDate(b.RETURN_DATE)} {toAmPm(b.RETURN_TIME)}
            </div>
          </div>
          <span className="shrink-0 font-mono text-xs text-[color:var(--color-dark-gray)]">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t-2 border-[rgba(58,58,58,0.2)] px-5 pb-4 pt-4">
          <div className="space-y-3 text-sm text-[color:var(--color-ink)]">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                Contact
              </span>
              <div className="mt-0.5">{b.CONTACT_NUMBER || "—"}</div>
              {b.FACEBOOK_PROFILE_LINK && (
                <a
                  href={b.FACEBOOK_PROFILE_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[color:var(--color-dark-gray)] underline"
                >
                  Facebook profile
                </a>
              )}
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                Address
              </span>
              <div className="mt-0.5">{b.COMPLETE_ADDRESS || "—"}</div>
            </div>
            {b.SPECIFIC_DESTINATION && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                  Destination
                </span>
                <div className="mt-0.5">{b.SPECIFIC_DESTINATION}</div>
              </div>
            )}
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                Mode
              </span>
              <div className="mt-0.5">{b.PREFERRED_MODE || "—"}</div>
            </div>
          </div>

          {docs.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                Documents
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {docs.map(({ label, id }, index) => (
                  <button
                    key={`${label}-${index}`}
                    type="button"
                    onClick={() => onLightbox({ label, id })}
                    className="flex flex-col items-start gap-1 text-left"
                  >
                    <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                      {label}
                    </span>
                    <img
                      src={documentThumb(id, 400)}
                      alt={label}
                      className="w-full rounded-row border-2 border-[color:var(--color-border)] object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[rgba(58,58,58,0.2)] px-4 py-3">
        {confirming && (
          <span className="mr-auto font-mono text-xs text-[color:var(--color-dark-gray)]">
            {confirming === "approve"
              ? "Confirm approve?"
              : confirming === "reject"
                ? "Confirm reject?"
                : "Confirm cancel?"}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setConfirming(null);
          }}
          className={`font-mono text-xs text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)] ${!confirming ? "invisible" : ""}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleAction("reject")}
          className={`border px-4 py-1.5 font-mono text-xs ${
            confirming === "reject"
              ? "border-rose-600 text-rose-500 hover:bg-rose-100"
              : "border-[color:var(--color-border)] text-[color:var(--color-dark-gray)] hover:bg-[rgba(255,255,255,0.6)]"
          }`}
        >
          {confirming === "reject" ? "Confirm Reject" : "Reject"}
        </button>
        <button
          type="button"
          onClick={() => handleAction("cancel")}
          className={`border px-4 py-1.5 font-mono text-xs ${
            confirming === "cancel"
              ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-500"
              : "border-rose-300 text-rose-700 hover:bg-rose-50"
          }`}
        >
          {confirming === "cancel" ? "Confirm Cancel" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={() => handleAction("approve")}
          className={`border px-4 py-1.5 font-mono text-xs ${
            confirming === "approve"
              ? "border-[color:var(--color-border)] bg-[color:var(--color-ink)] text-white hover:bg-[color:var(--color-ink)]"
              : "border-[color:var(--color-border)] text-[color:var(--color-dark-gray)] hover:bg-[rgba(255,255,255,0.6)]"
          }`}
        >
          {confirming === "approve" ? "Confirm Approve" : "Approve"}
        </button>
      </div>
    </div>
  );
}
