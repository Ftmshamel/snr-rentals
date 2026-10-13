import LocationPicker from "./LocationPicker.jsx";

// The Lalamove delivery form: everything S&R needs to book the rider without
// messaging the renter back — who receives it, a number the rider can call,
// the full address, a landmark, and an exact map pin. Used for the delivery
// and, when it differs, for collecting the camera back.

export const EMPTY_DELIVERY = {
  recipientName: "",
  recipientPhone: "",
  address: "",
  landmark: "",
  notes: "",
  lat: null,
  lng: null,
};

/** First thing still missing, as a sentence — or null when complete. */
export function deliveryMissing(d, label = "Delivery") {
  if (!d?.recipientName?.trim()) {
    return label === "Delivery"
      ? `${label}: who will receive the camera?`
      : `${label}: who will hand the camera back to the rider?`;
  }
  if (!d?.recipientPhone?.trim()) return `${label}: add a contact number for the rider.`;
  if (!d?.address?.trim()) return `${label}: the complete address is required.`;
  if (!Number.isFinite(d?.lat) || !Number.isFinite(d?.lng)) {
    return `${label}: drop a pin on the map so the rider finds the exact spot.`;
  }
  return null;
}

export default function DeliveryDetailsForm({ value, onChange, showErrors = false, idPrefix = "delivery" }) {
  const d = value || EMPTY_DELIVERY;
  const set = (key) => (event) => onChange({ ...d, [key]: event.target.value });
  const err = (ok) => showErrors && !ok;
  const isReturn = idPrefix === "return";

  return (
    <div className="bk-deliv">
      <div className="bk-grid-2">
        <label className={`bk-field ${err(d.recipientName?.trim()) ? "is-invalid" : ""}`}>
          <span className="bk-label">{isReturn ? "Contact person (hands it back)" : "Receiver's name"}</span>
          <input id={`${idPrefix}-name`} className="bk-input" value={d.recipientName} onChange={set("recipientName")} />
        </label>
        <label className={`bk-field ${err(d.recipientPhone?.trim()) ? "is-invalid" : ""}`}>
          <span className="bk-label">{isReturn ? "Contact person's mobile number" : "Receiver's mobile number"}</span>
          <input
            id={`${idPrefix}-phone`}
            className="bk-input"
            inputMode="tel"
            value={d.recipientPhone}
            onChange={set("recipientPhone")}
            placeholder="09XX XXX XXXX"
          />
        </label>
        <label className={`bk-field bk-grid-wide ${err(d.address?.trim()) ? "is-invalid" : ""}`}>
          <span className="bk-label">Complete address (house no., street, barangay, city)</span>
          <input id={`${idPrefix}-address`} className="bk-input" value={d.address} onChange={set("address")} />
        </label>
        <label className="bk-field">
          <span className="bk-label">Landmark (optional)</span>
          <input
            id={`${idPrefix}-landmark`}
            className="bk-input"
            value={d.landmark}
            onChange={set("landmark")}
            placeholder="e.g. beside the blue gate, near 7-Eleven"
          />
        </label>
        <label className="bk-field">
          <span className="bk-label">Note to rider (optional)</span>
          <input
            id={`${idPrefix}-notes`}
            className="bk-input"
            value={d.notes}
            onChange={set("notes")}
            placeholder="e.g. call when outside, unit 3B"
          />
        </label>
      </div>
      <div className="bk-panel-label bk-deliv__pin-label">Pin the exact location</div>
      <LocationPicker
        lat={d.lat}
        lng={d.lng}
        onChange={(pin) => onChange({ ...d, ...pin })}
        invalid={err(Number.isFinite(d.lat))}
      />
    </div>
  );
}
