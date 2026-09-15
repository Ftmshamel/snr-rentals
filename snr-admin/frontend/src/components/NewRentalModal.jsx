import { useEffect, useMemo, useState } from "react";
import { CAMERAS } from "../data/cameras.js";
import { apiPostJson } from "../utils/api.js";
import { fetchBookingDocuments } from "../utils/bookingDocuments.js";
import {
  bookingsOverlap,
  compareBookingStart,
  distributeToUnits,
  formatISODateLocal,
  parseISODate,
} from "../utils/dateHelpers.js";

const MODES = ["Meet Up", "Deliver"];
const REQUIREMENT_DOC_FIELDS = [
  "1st_ID",
  "2nd_ID",
  "PROOF_OF_BILLING",
  "SELFIE_HOLDING_YOUR_ID's",
];
const TIME_START_HOUR = 7;
const TIME_END_HOUR = 22;
const TIME_OPTIONS = Array.from(
  { length: (TIME_END_HOUR - TIME_START_HOUR) * 2 + 1 },
  (_, i) => {
    const totalMinutes = TIME_START_HOUR * 60 + i * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60 === 0 ? "00" : "30";
    const value = `${String(h).padStart(2, "0")}:${m}`;
    const hour12 = h % 12 || 12;
    return {
      value,
      label: `${hour12}:${m} ${h >= 12 ? "PM" : "AM"}`,
    };
  },
);

const REPEAT_EXCLUDED_STATUSES = ["rejected"];

function fmtDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getRenterName(booking) {
  return (booking?.FULL_NAME || booking?.FACEBOOK_ACCOUNT_NAME || "").trim();
}

function getRenterKey(booking) {
  return (
    normalizeName(getRenterName(booking)) ||
    normalizeName(booking?.CONTACT_NUMBER)
  );
}

function buildRenterProfile(booking) {
  const fullName = booking.FULL_NAME || booking.FACEBOOK_ACCOUNT_NAME || "";
  const facebookName = booking.FACEBOOK_ACCOUNT_NAME || booking.FULL_NAME || "";
  const contactNumber = booking.CONTACT_NUMBER || "";
  return {
    key: getRenterKey(booking),
    // The renter's ID documents are not in the list payload — they're fetched
    // from this booking on submit. See handleSubmit.
    responseId: booking.responseId || "",
    fullName,
    facebookName,
    contactNumber,
    facebookKey: normalizeName(facebookName),
    contactKey: normalizeName(contactNumber),
    searchText: [fullName, facebookName, contactNumber]
      .map(normalizeName)
      .filter(Boolean)
      .join(" "),
    completeAddress: booking.COMPLETE_ADDRESS || "",
    destination: booking.SPECIFIC_DESTINATION || "",
    typeOfTrip: booking.TYPE_OF_TRIP || "",
    preferredMode: booking.PREFERRED_MODE || "Meet Up",
    preferredCamera: booking.PREFERRED_CAMERA || "",
    addonsText: Array.isArray(booking["Please_choose_your_add-ons"])
      ? booking["Please_choose_your_add-ons"].join(", ")
      : Array.isArray(booking.Please_choose_your_add_ons)
        ? booking.Please_choose_your_add_ons.join(", ")
        : Array.isArray(booking.ADDONS)
          ? booking.ADDONS.join(", ")
          : "",
  };
}

function applyRenterToForm(renter) {
  return {
    FULL_NAME: renter.fullName,
    FACEBOOK_ACCOUNT_NAME: renter.facebookName,
    CONTACT_NUMBER: renter.contactNumber,
    COMPLETE_ADDRESS: renter.completeAddress,
    SPECIFIC_DESTINATION: renter.destination,
    TYPE_OF_TRIP: renter.typeOfTrip,
    PREFERRED_MODE: renter.preferredMode,
    PREFERRED_CAMERA: renter.preferredCamera,
    addonsText: renter.addonsText,
  };
}

/** Returns placement info for the chosen camera/date range. */
function findAvailability(form, existingBookings) {
  if (!form.PREFERRED_CAMERA || !form.PICK_UP_DATE || !form.RETURN_DATE)
    return null;
  if (form.RETURN_DATE < form.PICK_UP_DATE) return null;
  const cam = CAMERAS.find(
    (c) => c.name.toLowerCase() === form.PREFERRED_CAMERA.toLowerCase(),
  );
  const units = cam?.units ?? 1;
  const target = form.PREFERRED_CAMERA.trim().toLowerCase();
  const cameraBookings = getRelevantCameraBookings(existingBookings, target);
  const unitIndex = findAvailableUnitIndex(form, cameraBookings, units);
  if (unitIndex !== null) return { available: true, unitIndex, units };
  return {
    available: false,
    units,
    nextStart: findNextAvailableStart(form, cameraBookings, units),
  };
}

function getRelevantCameraBookings(bookings, targetCameraName) {
  return bookings
    .filter(
      (b) =>
        (b.status || "").toLowerCase() !== "rejected" &&
        (b.status || "").toLowerCase() !== "cancelled" &&
        (b.PREFERRED_CAMERA || "").trim().toLowerCase() === targetCameraName &&
        b.PICK_UP_DATE &&
        b.RETURN_DATE,
    )
    .sort(compareBookingStart);
}

function addDaysIso(iso, days) {
  const date = parseISODate(iso);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatISODateLocal(date);
}

function rentalLengthDays(form) {
  const pickUp = parseISODate(form.PICK_UP_DATE);
  const ret = parseISODate(form.RETURN_DATE);
  if (!pickUp || !ret) return 0;
  return Math.max(Math.round((ret - pickUp) / 86400000), 0);
}

function findAvailableUnitIndex(rental, cameraBookings, units) {
  const slots = distributeToUnits(cameraBookings, units).slice(0, units);
  const availableIndex = slots.findIndex(
    (slot) => !slot.some((booking) => bookingsOverlap(rental, booking)),
  );
  return availableIndex === -1 ? null : availableIndex;
}

function rangeIsAvailable(startIso, form, bookings, units) {
  const lengthDays = rentalLengthDays(form);
  const endIso = addDaysIso(startIso, lengthDays);
  const rental = {
    ...form,
    PICK_UP_DATE: startIso,
    RETURN_DATE: endIso,
  };
  return findAvailableUnitIndex(rental, bookings, units) !== null;
}

function findNextAvailableStart(form, cameraBookings, units) {
  for (let offset = 1; offset <= 370; offset++) {
    const startIso = addDaysIso(form.PICK_UP_DATE, offset);
    if (rangeIsAvailable(startIso, form, cameraBookings, units)) {
      return startIso;
    }
  }
  return null;
}

const EMPTY_FORM = {
  FULL_NAME: "",
  CONTACT_NUMBER: "",
  FACEBOOK_ACCOUNT_NAME: "",
  COMPLETE_ADDRESS: "",
  TYPE_OF_TRIP: "",
  SPECIFIC_DESTINATION: "",
  PICK_UP_DATE: "",
  PICK_UP_TIME: "",
  RETURN_DATE: "",
  RETURN_TIME: "",
  PREFERRED_MODE: "Meet Up",
  PREFERRED_CAMERA: "",
  addonsText: "",
};

function generateResponseId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `manual_${Date.now()}_${rand}`;
}

export default function NewRentalModal({
  onClose,
  onCreated,
  existingBookings = [],
  repeatBookings = existingBookings,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRenterKey, setSelectedRenterKey] = useState("");

  const availability = findAvailability(form, existingBookings);
  const conflict =
    availability && !availability.available ? availability : null;

  const repeatRenters = useMemo(() => {
    const latestByKey = new Map();
    [...repeatBookings]
      .sort(compareBookingStart)
      .reverse()
      .filter((b) => {
        const status = (b.status || "").toLowerCase();
        return !REPEAT_EXCLUDED_STATUSES.includes(status);
      })
      .forEach((booking) => {
        const key = getRenterKey(booking);
        if (!key) return;
        if (!latestByKey.has(key)) {
          latestByKey.set(key, buildRenterProfile(booking));
        }
      });
    return [...latestByKey.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }, [repeatBookings]);

  const repeatMatches = useMemo(() => {
    const query = normalizeName(form.FULL_NAME);
    if (!query) return [];
    return repeatRenters.filter(
      (r) =>
        r.searchText.includes(query) ||
        r.key.includes(query) ||
        query.includes(r.key),
    );
  }, [form.FULL_NAME, repeatRenters]);

  const matchedRepeatRenter = useMemo(() => {
    const query = normalizeName(form.FULL_NAME);
    if (!query) return null;
    return (
      repeatRenters.find(
        (r) =>
          r.key === query || r.facebookKey === query || r.contactKey === query,
      ) || null
    );
  }, [form.FULL_NAME, repeatRenters]);

  const recognizedRepeatRenter = useMemo(() => {
    if (matchedRepeatRenter) return matchedRepeatRenter;
    if (!selectedRenterKey) return null;
    return repeatRenters.find((r) => r.key === selectedRenterKey) || null;
  }, [matchedRepeatRenter, repeatRenters, selectedRenterKey]);

  useEffect(() => {
    if (!matchedRepeatRenter) return;
    if (selectedRenterKey === matchedRepeatRenter.key) return;
    setForm((f) => ({
      ...f,
      ...applyRenterToForm(matchedRepeatRenter),
    }));
    setSelectedRenterKey(matchedRepeatRenter.key);
  }, [matchedRepeatRenter, selectedRenterKey]);

  function handleField(e) {
    const { name, value } = e.target;
    if (name === "FULL_NAME") {
      setSelectedRenterKey("");
    }
    setForm((f) => ({ ...f, [name]: value }));
  }

  function applyRepeatRenter(renter) {
    setSelectedRenterKey(renter.key);
    setForm((f) => ({
      ...f,
      ...applyRenterToForm(renter),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.FULL_NAME.trim()) return setError("Full name is required.");
    if (!form.PREFERRED_CAMERA) return setError("Camera is required.");
    if (!form.PICK_UP_DATE) return setError("Pickup date is required.");
    if (!form.RETURN_DATE) return setError("Return date is required.");
    if (form.RETURN_DATE < form.PICK_UP_DATE)
      return setError("Return date must be on or after pickup date.");
    if (conflict) {
      const nextStart = conflict.nextStart
        ? ` Next available start: ${fmtDay(conflict.nextStart)}.`
        : "";
      return setError(
        `No single ${form.PREFERRED_CAMERA} unit is available for the full selected range.${nextStart}`,
      );
    }

    setSaving(true);
    setError(null);
    try {
      const addons = form.addonsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { addonsText, ...rest } = form;
      const repeatApproved = !!recognizedRepeatRenter;

      // A repeat renter reuses the ID documents from their previous booking.
      // Those aren't in the list payload, so fetch them from that booking now —
      // and let a failure surface instead of silently saving a record with no
      // documents. The fresh proof of downpayment is collected separately, so it
      // is deliberately not carried over.
      let requirements = {};
      if (recognizedRepeatRenter) {
        if (!recognizedRepeatRenter.responseId) {
          throw new Error(
            "Could not locate the previous booking for this repeat renter. Create the booking without auto-fill and attach the IDs manually.",
          );
        }
        const documents = await fetchBookingDocuments(
          recognizedRepeatRenter.responseId,
        );
        requirements = Object.fromEntries(
          REQUIREMENT_DOC_FIELDS.map((key) => [key, documents[key] ?? []]),
        );
      }

      await apiPostJson("/api/submit", {
        ...rest,
        ...requirements,
        status: repeatApproved ? "approved" : "pending",
        "Please_choose_your_add-ons": addons,
        responseId: generateResponseId(),
        _source: "manual",
        Timestamp: new Date().toLocaleString(),
      });
      onCreated();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div
      className="ui-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="ui-modal max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[rgba(58,58,58,0.2)] px-5 py-4">
          <div className="text-lg font-bold text-[color:var(--color-black)]">
            New Rental
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Renter info */}
            <div className="ui-kicker">
              Renter
            </div>
            <Field
              label="Full Name *"
              name="FULL_NAME"
              value={form.FULL_NAME}
              onChange={handleField}
            />
            {repeatMatches.length > 0 && (
              <div className="ui-surface -mt-2 p-2">
                <div className="mb-1 ui-kicker text-[0.6rem]">
                  Repeat renter found
                </div>
                <div className="flex flex-wrap gap-2">
                  {repeatMatches.slice(0, 5).map((renter) => (
                    <button
                      key={renter.key}
                      type="button"
                      onClick={() => applyRepeatRenter(renter)}
                      className={`border px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-widest ${
                        selectedRenterKey === renter.key
                          ? "border-[color:var(--color-border)] bg-[color:var(--color-ink)] text-white"
                          : "border-[color:var(--color-border)] text-[color:var(--color-ink)] hover:bg-[rgba(255,255,255,0.6)]"
                      }`}
                    >
                      {renter.fullName}
                    </button>
                  ))}
                </div>
                {recognizedRepeatRenter && (
                  <p className="mt-2 text-xs text-green-700">
                    Repeat renter recognized. This booking will be
                    auto-approved.
                  </p>
                )}
              </div>
            )}
            <Field
              label="Contact Number"
              name="CONTACT_NUMBER"
              value={form.CONTACT_NUMBER}
              onChange={handleField}
            />
            <Field
              label="Facebook Name"
              name="FACEBOOK_ACCOUNT_NAME"
              value={form.FACEBOOK_ACCOUNT_NAME}
              onChange={handleField}
            />

            {/* Location */}
            <div className="pt-1 ui-kicker">
              Location
            </div>
            <Field
              label="Complete Address"
              name="COMPLETE_ADDRESS"
              value={form.COMPLETE_ADDRESS}
              onChange={handleField}
            />
            <Field
              label="Destination"
              name="SPECIFIC_DESTINATION"
              value={form.SPECIFIC_DESTINATION}
              onChange={handleField}
            />
            <Field
              label="Type of Trip"
              name="TYPE_OF_TRIP"
              value={form.TYPE_OF_TRIP}
              onChange={handleField}
              placeholder="e.g. Local (Within the Philippines)"
            />

            {/* Schedule */}
            <div className="pt-1 ui-kicker">
              Schedule
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Pickup Date *"
                name="PICK_UP_DATE"
                type="date"
                value={form.PICK_UP_DATE}
                onChange={handleField}
              />
              <TimeSelect
                label="Pickup Time"
                name="PICK_UP_TIME"
                value={form.PICK_UP_TIME}
                onChange={handleField}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Return Date *"
                name="RETURN_DATE"
                type="date"
                value={form.RETURN_DATE}
                onChange={handleField}
              />
              <TimeSelect
                label="Return Time"
                name="RETURN_TIME"
                value={form.RETURN_TIME}
                onChange={handleField}
              />
            </div>

            {/* Camera & mode */}
            <div className="pt-1 ui-kicker">
              Equipment
            </div>
            <div>
              <label className="ui-label">
                Camera *
              </label>
              <select
                name="PREFERRED_CAMERA"
                value={form.PREFERRED_CAMERA}
                onChange={handleField}
                className="ui-input"
              >
                <option value="">— select —</option>
                {CAMERAS.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label">
                Mode
              </label>
              <select
                name="PREFERRED_MODE"
                value={form.PREFERRED_MODE}
                onChange={handleField}
                className="ui-input"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Add-ons (comma-separated)"
              name="addonsText"
              value={form.addonsText}
              onChange={handleField}
              placeholder="e.g. 512GB SD Card, Double Crab Clamp"
            />
          </div>

          {conflict && (
            <div className="mt-4 border border-amber-400 bg-amber-50 px-3 py-2">
              <p className="font-mono text-xs font-bold text-amber-700">
                Camera unavailable
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                No single {form.PREFERRED_CAMERA} unit is available for the full
                selected range.
                {conflict.nextStart
                  ? ` Next available start: ${fmtDay(conflict.nextStart)}.`
                  : ""}
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-[rgba(58,58,58,0.2)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="ui-btn ui-btn--solid"
          >
            {saving ? "Saving…" : "Add Rental"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="ui-label">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="ui-input w-full text-sm text-[color:var(--color-black)] placeholder-[color:var(--color-dark-gray)] focus:outline-none"
      />
    </div>
  );
}

function TimeSelect({ label, name, value, onChange }) {
  return (
    <div>
      <label className="ui-label">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="ui-input"
      >
        <option value="">Select time</option>
        {TIME_OPTIONS.map((time) => (
          <option key={time.value} value={time.value}>
            {time.label}
          </option>
        ))}
      </select>
    </div>
  );
}
