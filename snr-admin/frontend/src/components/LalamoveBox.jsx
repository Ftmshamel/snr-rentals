import { useState } from "react";
import { SHOP } from "../data/shop.js";

// Everything staff need to book a Lalamove by hand, laid out in the order the
// Lalamove app asks for it: pick-up, drop-off, then the contact and note.
// Every value has its own Copy button, because the app takes each one in a
// separate field — one tap here, one paste there. The order's tracking link
// is pasted back and shown to the renter on their Track page.
// `kind` is "delivery" (shop → renter) or "return" (renter → shop).

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

function riderNote(booking, stop, kind) {
  return [
    stop.landmark && `Landmark: ${stop.landmark}`,
    stop.notes,
    kind === "return"
      ? `Camera return: ${booking.PREFERRED_CAMERA}${booking.UNIT_SERIAL ? ` (${booking.UNIT_SERIAL})` : ""}`
      : `Camera rental: ${booking.PREFERRED_CAMERA}`,
    `Ref ${booking.responseId}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function useCopy() {
  const [copied, setCopied] = useState(null);
  async function copy(key, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard blocked — the value is on screen to copy by hand */
    }
  }
  return { copied, copy };
}

function CopyRow({ label, value, href, copyKey, copier }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 border-t border-[rgba(58,58,58,0.12)] py-1.5 first:border-t-0">
      <div className="min-w-0">
        <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-dark-gray)]">{label}</div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold underline">
            {value}
          </a>
        ) : (
          <div className="break-words text-xs font-semibold text-[color:var(--color-ink)]">{value}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => copier.copy(copyKey, value)}
        className="shrink-0 rounded-full border-2 border-[color:var(--color-ink)] px-2 py-0.5 font-mono text-[10px] font-bold"
      >
        {copier.copied === copyKey ? "✓" : "Copy"}
      </button>
    </div>
  );
}

function StopCard({ title, rows, copier, prefix }) {
  return (
    <div className="rounded-[10px] border border-[rgba(58,58,58,0.2)] bg-white/80 px-2.5 py-1">
      <div className="pt-1 font-mono text-[10px] font-bold uppercase tracking-wider">{title}</div>
      {rows.map((r) => (
        <CopyRow key={r.label} {...r} copyKey={`${prefix}-${r.label}`} copier={copier} />
      ))}
    </div>
  );
}

export default function LalamoveBox({ booking, kind, link, onLinkChange, onSaveLink, busy }) {
  const stop = stopFor(booking, kind);
  const copier = useCopy();
  const hasPin = Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
  const savedLink = kind === "delivery" ? booking.LALAMOVE_DELIVERY_LINK : booking.LALAMOVE_RETURN_LINK;

  const shop = {
    title: "🏠 S&R Rentals (shop)",
    rows: [
      { label: "Shop location", value: SHOP.mapsLink, href: SHOP.mapsLink },
      { label: "Contact", value: SHOP.name },
      { label: "Mobile", value: SHOP.phone },
    ],
  };
  const renter = {
    title: kind === "delivery" ? "📍 Renter (drop-off)" : "📍 Renter (pick-up)",
    rows: [
      { label: "Address", value: stop.address },
      hasPin && { label: "Pin (lat, lng)", value: `${stop.lat}, ${stop.lng}` },
      hasPin && { label: "Pin on Google Maps", value: mapsLink(stop.lat, stop.lng), href: mapsLink(stop.lat, stop.lng) },
      { label: kind === "delivery" ? "Receiver" : "Contact person", value: stop.recipientName },
      { label: "Mobile", value: stop.recipientPhone },
      { label: "Note to rider", value: riderNote(booking, stop, kind) },
    ].filter(Boolean),
  };
  const [first, second] = kind === "delivery" ? [shop, renter] : [renter, shop];

  return (
    <div className="space-y-2 rounded-[14px] border-2 border-[rgba(58,58,58,0.25)] bg-white/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-kicker text-[0.6rem]">🛵 Lalamove {kind === "delivery" ? "delivery" : "return pickup"}</span>
        {savedLink ? (
          <span className="rounded-full bg-green-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">Booked</span>
        ) : (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">To book</span>
        )}
      </div>

      <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
        In the Lalamove app: <strong>1</strong> pick-up → <strong>2</strong> drop-off → contact &amp; note. Tap Copy, paste in the matching field.
      </p>

      <div className="font-mono text-[10px] font-bold">1 · Pick-up</div>
      <StopCard {...first} copier={copier} prefix="a" />
      <div className="font-mono text-[10px] font-bold">2 · Drop-off</div>
      <StopCard {...second} copier={copier} prefix="b" />

      {kind === "return" && booking.RETURN_DETAILS?.sameAsDelivery === false && (
        <div className="font-mono text-[10px] font-bold text-orange-700">Return pickup is different from the delivery address.</div>
      )}
      {!hasPin && (
        <div className="font-mono text-[10px] font-bold text-rose-600">
          {stop.legacy ? "Booked before the delivery form — confirm the exact pin with the renter." : "No map pin — confirm with the renter."}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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
        <span className="ui-label">3 · Paste the order's share / tracking link</span>
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
