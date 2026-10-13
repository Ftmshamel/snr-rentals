import { useState } from "react";

// Everything staff need to book a Lalamove by hand, in one place: the
// renter's delivery form (receiver, number, address, landmark, exact pin),
// a "Copy details" button that pastes cleanly into the Lalamove app, and a
// field for the order's tracking link — which the renter then sees on their
// Track page. `kind` is "delivery" (shop → renter) or "return" (renter → shop).

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Where the rider goes: the renter's form, or their booking details for older bookings. */
export function stopFor(booking, kind) {
  const delivery = booking.DELIVERY_DETAILS || {
    recipientName: booking.FULL_NAME || "",
    recipientPhone: booking.CONTACT_NUMBER || "",
    address: booking.COMPLETE_ADDRESS || "",
    landmark: "",
    notes: "",
    lat: null,
    lng: null,
    legacy: true,
  };
  if (kind === "return") {
    const ret = booking.RETURN_DETAILS;
    if (ret && ret.sameAsDelivery === false) return ret;
  }
  return delivery;
}

function copyText(booking, kind, stop) {
  const pin = Number.isFinite(stop.lat) ? mapsLink(stop.lat, stop.lng) : "no pin — confirm with renter";
  const lines =
    kind === "delivery"
      ? [
          `DROP-OFF: ${stop.address}`,
          stop.landmark && `Landmark: ${stop.landmark}`,
          `Pin: ${pin}`,
          `Receiver: ${stop.recipientName} · ${stop.recipientPhone}`,
          stop.notes && `Note to rider: ${stop.notes}`,
          `Item: ${booking.PREFERRED_CAMERA} (camera) · Ref ${booking.responseId}`,
        ]
      : [
          `PICK-UP (return): ${stop.address}`,
          stop.landmark && `Landmark: ${stop.landmark}`,
          `Pin: ${pin}`,
          `Contact: ${stop.recipientName} · ${stop.recipientPhone}`,
          stop.notes && `Note to rider: ${stop.notes}`,
          `DROP-OFF: S&R Rentals`,
          `Item: ${booking.PREFERRED_CAMERA}${booking.UNIT_SERIAL ? ` (${booking.UNIT_SERIAL})` : ""} · Ref ${booking.responseId}`,
        ];
  return lines.filter(Boolean).join("\n");
}

export default function LalamoveBox({ booking, kind, link, onLinkChange, onSaveLink, busy }) {
  const stop = stopFor(booking, kind);
  const [copied, setCopied] = useState(false);
  const hasPin = Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
  const savedLink = kind === "delivery" ? booking.LALAMOVE_DELIVERY_LINK : booking.LALAMOVE_RETURN_LINK;

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText(booking, kind, stop));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the details are on screen */
    }
  }

  return (
    <div className="space-y-2 rounded-[14px] border-2 border-[rgba(58,58,58,0.25)] bg-white/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-kicker text-[0.6rem]">
          🛵 Lalamove — {kind === "delivery" ? "deliver to" : "collect return from"}
        </span>
        {savedLink ? (
          <span className="rounded-full bg-green-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">Booked</span>
        ) : (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">To book</span>
        )}
      </div>
      <div className="text-xs leading-relaxed text-[color:var(--color-ink)]">
        <div className="font-bold">
          {stop.recipientName || "—"} · {stop.recipientPhone || "no number"}
        </div>
        <div>{stop.address || "No address"}</div>
        {stop.landmark && <div className="text-[color:var(--color-dark-gray)]">Landmark: {stop.landmark}</div>}
        {stop.notes && <div className="text-[color:var(--color-dark-gray)]">Note: {stop.notes}</div>}
        {kind === "return" && booking.RETURN_DETAILS?.sameAsDelivery === false && (
          <div className="font-mono text-[10px] font-bold text-orange-700">Different from the delivery address</div>
        )}
        {hasPin ? (
          <a href={mapsLink(stop.lat, stop.lng)} target="_blank" rel="noreferrer" className="font-mono text-[10px] font-bold underline">
            📍 Open pin in Google Maps ({stop.lat.toFixed(5)}, {stop.lng.toFixed(5)})
          </a>
        ) : (
          <div className="font-mono text-[10px] font-bold text-rose-600">
            {stop.legacy ? "Booked before the delivery form — confirm the exact pin with the renter." : "No map pin."}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="ui-btn ui-btn--sm">
          {copied ? "Copied ✓" : "Copy details"}
        </button>
        <a href="https://web.lalamove.com/" target="_blank" rel="noreferrer" className="ui-btn ui-btn--sm">
          Open Lalamove ↗
        </a>
        {savedLink && (
          <a href={savedLink} target="_blank" rel="noreferrer" className="ui-btn ui-btn--sm">
            Tracking ↗
          </a>
        )}
      </div>
      <label className="block">
        <span className="ui-label">Lalamove tracking link (share link from the order)</span>
        <input
          value={link}
          onChange={(e) => onLinkChange(e.target.value)}
          placeholder="https://…"
          className="ui-input ui-input--sm font-mono text-xs"
        />
      </label>
      {onSaveLink && (
        <button
          type="button"
          disabled={busy || !link.trim() || link.trim() === savedLink}
          onClick={onSaveLink}
          className="ui-btn ui-btn--sm w-full disabled:opacity-50"
        >
          {kind === "delivery" ? "Save delivery link" : "Return rider booked — save link"}
        </button>
      )}
      <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
        The renter sees this link on their Track my booking page.
      </p>
    </div>
  );
}
