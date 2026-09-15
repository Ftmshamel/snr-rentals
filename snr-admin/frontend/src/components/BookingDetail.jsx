import { useState } from "react";
import BookingModal from "./BookingModal.jsx";
import { todayISOLocal } from "../utils/dateHelpers.js";

export default function BookingDetail({
  bookings,
  selectedDate,
  onBookingChange,
}) {
  const [activeBooking, setActiveBooking] = useState(null);

  if (!selectedDate) {
    return (
      <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
        Select a date on the calendar.
      </p>
    );
  }

  const list = bookings
    .filter(
      (b) => selectedDate === b.PICK_UP_DATE || selectedDate === b.RETURN_DATE,
    )
    .sort((a, b) => {
      const timeA =
        selectedDate === a.PICK_UP_DATE
          ? a.PICK_UP_TIME || "99:99"
          : a.RETURN_TIME || "99:99";
      const timeB =
        selectedDate === b.PICK_UP_DATE
          ? b.PICK_UP_TIME || "99:99"
          : b.RETURN_TIME || "99:99";
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
    });

  if (list.length === 0) {
    return (
      <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
        No bookings on {selectedDate}.
      </p>
    );
  }

  return (
    <>
      {activeBooking && (
        <BookingModal
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onSaved={() => {
            setActiveBooking(null);
            onBookingChange?.();
          }}
          onChanged={onBookingChange}
          onDeleted={() => {
            setActiveBooking(null);
            onBookingChange?.();
          }}
        />
      )}
      <div className="space-y-3">
        <div className="ui-panel space-y-4 p-5">
          {list.map((b) => (
          <article
            key={b.responseId}
            onClick={() => setActiveBooking(b)}
            className="-mx-2 cursor-pointer rounded-row border-b-2 border-dashed border-[rgba(58,58,58,0.25)] px-3 pb-4 pt-1 transition-colors last:border-0 last:pb-0 hover:bg-[rgba(255,255,255,0.55)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-base font-black text-[color:var(--color-black)]">
                  {b.FACEBOOK_ACCOUNT_NAME || b.FULL_NAME || "—"}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[color:var(--color-dark-gray)]">
                  {b.PREFERRED_CAMERA || "—"}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {renderPickupReturnTag(selectedDate, b)}
                {renderFulfillmentBadge(b)}
              </div>
            </div>

            <div className="ui-num mt-3 text-sm">
              {formatTime12h(selectedDate, b)}
            </div>

            <div className="mt-1 text-sm font-medium text-[color:var(--color-dark-gray)]">
              {b.CONTACT_NUMBER || "—"}
            </div>

            <div className="mt-1 text-sm font-medium text-[color:var(--color-ink)]">
              {b.COMPLETE_ADDRESS || b.SPECIFIC_DESTINATION || "—"}
            </div>

            {renderAddOns(b)}
            {b.RENTAL_FEE != null && (() => {
              const fee = Number(b.RENTAL_FEE);
              const paid = b.DOWNPAYMENT_PAID != null ? Number(b.DOWNPAYMENT_PAID) : Math.ceil(fee * 0.2);
              const balance = fee - paid;
              return (
                <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs text-[color:var(--color-dark-gray)]">
                  <span>Fee ₱{fee.toLocaleString()}</span>
                  <span>· DP ₱{paid.toLocaleString()}</span>
                  <span>· <span className={`font-bold ${balance <= 0 ? "text-green-700" : "text-[color:var(--color-ink)]"}`}>
                    {balance <= 0 ? "Paid" : `Balance ₱${balance.toLocaleString()}`}
                  </span></span>
                </div>
              );
            })()}
          </article>
          ))}
        </div>
      </div>
    </>
  );
}

function isDeliveryMode(b) {
  return (b.PREFERRED_MODE || "").trim().toLowerCase().startsWith("deliver");
}

function toAmPm(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTime12h(selectedDate, b) {
  if (selectedDate === b.PICK_UP_DATE) return toAmPm(b.PICK_UP_TIME);
  if (selectedDate === b.RETURN_DATE) return toAmPm(b.RETURN_TIME);
  return "—";
}

function renderFulfillmentBadge(b) {
  const fs = (b.FULFILLMENT_STATUS || "").toLowerCase();
  if (fs !== "out" && fs !== "returned") return null;
  if (fs === "returned") {
    return (
      <span className="ui-chip border-green-700 bg-green-700 text-white">Returned</span>
    );
  }
  const overdue = b.RETURN_DATE && b.RETURN_DATE < todayISOLocal();
  return (
    <span className={`ui-chip text-white ${overdue ? "border-rose-700 bg-rose-700" : "border-amber-600 bg-amber-600"}`}>
      {overdue ? "Out · Overdue" : "Out"}
    </span>
  );
}

function renderPickupReturnTag(selectedDate, b) {
  if (selectedDate === b.PICK_UP_DATE) {
    return isDeliveryMode(b) ? (
      <span className="ui-chip ui-chip--solid">Delivery</span>
    ) : (
      <span className="ui-chip ui-chip--solid">Pickup</span>
    );
  }
  if (selectedDate === b.RETURN_DATE) {
    return (
      <span className="ui-chip ui-chip--solid">Return</span>
    );
  }
  return null;
}

function renderAddOns(b) {
  const addons =
    b["Please_choose_your_add-ons"] ||
    b.Please_choose_your_add_ons ||
    b.ADDONS ||
    [];
  if (!Array.isArray(addons) || addons.length === 0) return null;
  return (
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
  );
}
