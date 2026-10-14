import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findCamera, useCatalog } from "../data/catalog.js";
import { getCameraAssets } from "../data/assets.js";
import { getContractForCamera } from "../data/contracts.js";
import { getCameraDetailCopy } from "../data/detailCopy.js";
import { apiGetJson, apiPostJson } from "../utils/api.js";
import Logo from "../components/Logo.jsx";
import GearGrid, { GearImage } from "../components/GearGrid.jsx";
import useLockBodyScroll from "../hooks/useLockBodyScroll.js";
import { getIdToken, looksSignedIn, openSignIn, refreshMe, useMember, wasSignedIn } from "../hooks/useMember.js";
import { memberPerks } from "../utils/loyalty.js";
import DeliveryDetailsForm, {
  EMPTY_DELIVERY,
  deliveryMissing,
} from "../components/DeliveryDetailsForm.jsx";

const RUSH_FEE = 300;
const SECURITY_DEPOSIT = 1000;
// Several cameras can be booked together (one reference code). Each camera
// is its own rental on our side: its own fee, its own ₱1,000 deposit and
// its own contract unit; the rush fee is per order.
const MAX_ORDER_CAMERAS = 5;

/** Distinct add-ons a camera offers (the catalogue can repeat a name). */
function cameraAddOns(camera) {
  const seen = new Set();
  return (camera?.addOns || []).filter((addon) => {
    const key = addon.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * One camera's price for the rental, before and after member perks.
 * `freeLeft` = the tier's free add-ons not yet used by an earlier camera of
 * the same order (they're per rental, and an order is one rental).
 */
function priceCamera(camera, addOnNames, days, tier, freeLeft) {
  const rate = (camera?.pricing || []).find(
    (item) => days >= item.minDays && (item.maxDays === null || days <= item.maxDays),
  );
  const cameraSubtotal = (rate?.pricePerDay || 0) * days;
  const offered = cameraAddOns(camera);
  const addonLines = addOnNames
    .map((name) => offered.find((a) => a.name === name))
    .filter(Boolean)
    .map((a) => ({ name: a.name, amount: a.pricePerDay * days }));
  const addOnsSubtotal = addonLines.reduce((sum, a) => sum + a.amount, 0);
  const perks = memberPerks(tier ? { ...tier, freeAddons: freeLeft } : null, cameraSubtotal, addonLines);
  const gross = cameraSubtotal + addOnsSubtotal;
  return { cameraSubtotal, addonLines, addOnsSubtotal, perks, gross, net: Math.max(gross - perks.savings, 0) };
}
const COMPANY_NAME = "S&R Rentals";
const COMPANY_CONTACT = "0912 016 1865";
const COMPANY_LOGO = "/logo.png";
const REP_SIGNATURE_SRC = "/signature.jpg";
const REP_NAME = "Shamel Fatima Perono";
const REP_NAME_UPPER = "SHAMEL FATIMA PERONO";
// Fee lines that belong under the "Cosmetic Damage" point as lettered sub-items
// rather than as their own numbered clause.
const SUB_TERM_PATTERN =
  /^(Mild|Medium|Major|Lens Damage|Screen Damage|Other Damages)/i;
const TIME_START_HOUR = 8;
const TIME_END_HOUR = 23;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 900;
const IMAGE_QUALITY = 0.7;
const BOOKING_DRAFT_DB = "snr-rentals-booking";
const BOOKING_DRAFT_STORE = "drafts";
const BOOKING_DRAFT_KEY = "public-booking";
const PAYMENT_METHODS = [
  {
    id: "gcash",
    label: "GCash",
    accountName: "Rovick Dompor",
    accountNumber: "0939 797 1380",
    qr: "/payment/gcash-qr.png",
  },
  {
    id: "maribank",
    label: "MariBank",
    accountName: "Rovick Dompor",
    accountNumber: "0939 797 1380",
    qr: "/payment/maribank-qr.png",
  },
  {
    id: "bdo",
    label: "BDO",
    accountName: "Rovick Dompor",
    accountNumber: "0055 6014 1357",
    qr: "/payment/bdo-qr.png",
  },
];

const TIME_OPTIONS = Array.from(
  { length: (TIME_END_HOUR - TIME_START_HOUR) * 2 + 1 },
  (_, index) => {
    const totalMinutes = TIME_START_HOUR * 60 + index * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  },
);

const initialForm = {
  fullName: "",
  facebookName: "",
  facebookLink: "",
  contactNumber: "",
  address: "",
  tripType: "",
  destination: "",
  pickupDate: "",
  pickupTime: "",
  returnDate: "",
  returnTime: "",
  mode: "",
  privacy: false,
  termsAgree: false,
  signatureDataUrl: "",
  repeatRenter: "no",
  repeatRef: "",
  repeatVerifiedName: "",
  // Lalamove delivery form (delivery bookings only). S&R books the rider
  // from these, so they must be exactly what Lalamove needs.
  delivery: EMPTY_DELIVERY,
  returnSame: "yes",
  returnPickup: EMPTY_DELIVERY,
};

const initialFiles = {
  firstId: null,
  secondId: null,
  proofOfBilling: null,
  selfieWithId: null,
  proofOfDownpayment: null,
};

function openBookingDraftDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BOOKING_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOOKING_DRAFT_STORE)) {
        request.result.createObjectStore(BOOKING_DRAFT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBookingDraft() {
  const db = await openBookingDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BOOKING_DRAFT_STORE, "readonly");
    const request = transaction.objectStore(BOOKING_DRAFT_STORE).get(BOOKING_DRAFT_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeBookingDraft(draft) {
  const db = await openBookingDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BOOKING_DRAFT_STORE, "readwrite");
    transaction.objectStore(BOOKING_DRAFT_STORE).put(draft, BOOKING_DRAFT_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function clearBookingDraft() {
  const db = await openBookingDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BOOKING_DRAFT_STORE, "readwrite");
    transaction.objectStore(BOOKING_DRAFT_STORE).delete(BOOKING_DRAFT_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

const OPTION_CHOICES = [
  { value: "Pick Up", label: "SELF PICK-UP" },
  { value: "Deliver", label: "DELIVERY" },
];

const REQUIREMENT_FILES = [
  { stateKey: "firstId", payloadKey: "1st_ID", label: "1st Valid ID" },
  { stateKey: "secondId", payloadKey: "2nd_ID", label: "2nd Valid ID" },
  {
    stateKey: "proofOfBilling",
    payloadKey: "PROOF_OF_BILLING",
    label: "Proof of Billing",
  },
  {
    stateKey: "selfieWithId",
    payloadKey: "SELFIE_HOLDING_YOUR_ID's",
    label: "Selfie Holding ID",
  },
  {
    stateKey: "proofOfDownpayment",
    payloadKey: "PROOF_OF_DOWNPAYMENT",
    label: "Proof of Downpayment",
  },
];

const STEPS = [
  "Check Availability",
  "Privacy & Terms",
  "Renter Details",
  "Requirements",
  "Review",
];

function initialCameraName() {
  // Landing-page cards link here as /book?camera=<name>. The catalogue loads
  // asynchronously, so this is only the requested name — PublicBooking
  // resolves it against the catalogue (loosely, ignoring case) once loaded.
  return new URLSearchParams(window.location.search).get("camera")?.trim() || "";
}

function hasRequirementUpload(value) {
  return String(value?.dataUrl || "").startsWith("data:image/");
}

function hasSignature(value) {
  return String(value || "").startsWith("data:image/");
}

function formatTimeLabel(value) {
  if (!TIME_OPTIONS.includes(value)) return "Not set";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function money(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH")}`;
}

function pesoMoney(value) {
  return `₱ ${Number(value || 0).toLocaleString("en-PH")}`;
}

function compactFileName(value) {
  return (
    String(value || "contract")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "contract"
  );
}

function formatDateLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "Not set";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("This browser cannot save the contract image."));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to render the contract image."));
    }, "image/png");
  });
}

// Saves through a blob URL rather than a data URL: data URLs are size-capped in
// some browsers, and iOS Safari ignores the download attribute on them and opens
// the image instead of saving it. The anchor also has to be in the document for a
// programmatic click to fire in Firefox.
async function saveCanvasAsPng(canvas, fileName) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Leave the URL alive briefly so the download can actually start.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load contract image."));
    image.src = src;
  });
}

// Key out the light background of an ink-on-paper image (logo on gray, signature
// on white): keep the dark strokes, fade light pixels to transparent, then crop
// to the ink's bounding box so it sits cleanly on the signature line.
function inkOnlyCanvas(image) {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  const sctx = source.getContext("2d");
  sctx.drawImage(image, 0, 0);

  const imageData = sctx.getImageData(0, 0, source.width, source.height);
  const pixels = imageData.data;
  let minX = source.width;
  let minY = source.height;
  let maxX = 0;
  let maxY = 0;
  let hasInk = false;

  for (let i = 0; i < pixels.length; i += 4) {
    const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    let alpha;
    if (lum <= 95) alpha = 255;
    else if (lum >= 165) alpha = 0;
    else alpha = Math.round((255 * (165 - lum)) / 70);
    pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    if (pixels[i + 3] > 24) {
      hasInk = true;
      const px = (i / 4) % source.width;
      const py = Math.floor(i / 4 / source.width);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  sctx.putImageData(imageData, 0, 0);

  if (!hasInk) return source;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(source.width - 1, maxX + pad);
  maxY = Math.min(source.height - 1, maxY + pad);
  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  out.getContext("2d").drawImage(source, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

async function loadTransparentInk(src) {
  const image = await loadCanvasImage(src);
  return inkOnlyCanvas(image).toDataURL("image/png");
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, wrapX) {
  // wrapX lets continuation lines align to a deeper indent than the first line
  // (used for numbered/lettered clauses with a hanging label).
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const continueX = wrapX ?? x;
  let line = "";
  let currentX = x;

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    const available = maxWidth - (currentX - x);
    if (ctx.measureText(testLine).width > available && line) {
      ctx.fillText(line, currentX, y);
      y += lineHeight;
      currentX = continueX;
      line = word;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line, currentX, y);
    y += lineHeight;
  }

  return y;
}

function buildNumberedTerms(terms) {
  // Main clauses get 1., 2., 3.; scratch-fee lines fold into a., b., c. beneath
  // the clause that introduced them — mirrors the printed agreement.
  let main = 0;
  let sub = 0;
  return (terms || []).map((text) => {
    if (SUB_TERM_PATTERN.test(String(text).trim())) {
      const label = `${String.fromCharCode(97 + sub)}.`;
      sub += 1;
      return { text, label, isSub: true };
    }
    main += 1;
    sub = 0;
    return { text, label: `${main}.`, isSub: false };
  });
}

function renderContractTermText(text) {
  const value = String(text || "");
  const match = value.match(/^([^:]{2,80}):\s*(.*)$/);
  if (!match) return value;
  return (
    <>
      <strong>{match[1]}:</strong> {match[2]}
    </>
  );
}

function dateNumber(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function timeNumber(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function windowIsValid(form) {
  const pickupDay = dateNumber(form.pickupDate);
  const returnDay = dateNumber(form.returnDate);
  const pickupTime = timeNumber(form.pickupTime);
  const returnTime = timeNumber(form.returnTime);
  if (
    pickupDay == null ||
    returnDay == null ||
    pickupTime == null ||
    returnTime == null
  ) {
    return false;
  }
  if (returnDay < pickupDay) return false;
  if (returnDay === pickupDay && returnTime <= pickupTime) return false;
  return true;
}

function rentalDays(pickupDate, returnDate) {
  const pickupDay = dateNumber(pickupDate);
  const returnDay = dateNumber(returnDate);
  if (pickupDay == null || returnDay == null || returnDay < pickupDay) {
    return null;
  }
  return Math.max(Math.round(returnDay - pickupDay), 1);
}

function todayIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function isSameDayBooking(pickupDateIso) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(pickupDateIso || "") &&
    pickupDateIso === todayIso()
  );
}

function monthLabel(monthIso) {
  const [year, month] = monthIso.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(monthIso, amount) {
  const [year, month] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + amount, 1))
    .toISOString()
    .slice(0, 7);
}

function monthDayIsos(monthIso) {
  const [year, month] = monthIso.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: dayCount },
    (_, index) =>
      `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
}

// One calendar for the whole rental window: the first click sets the pickup
// date, the second sets the return. Clicking again starts a new range.
function DateRangePicker({ pickupDate, returnDate, onChange, invalid = false }) {
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(
    pickupDate?.slice(0, 7) || currentMonth,
  );
  const [hoverDate, setHoverDate] = useState("");

  useEffect(() => {
    if (pickupDate && pickupDate.slice(0, 7) !== visibleMonth) {
      setVisibleMonth(pickupDate.slice(0, 7));
    }
  }, [pickupDate]);

  const [year, month] = visibleMonth.split("-").map(Number);
  const leadingDays = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells = [
    ...Array.from({ length: leadingDays }, () => null),
    ...monthDayIsos(visibleMonth),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const startDay = dateNumber(pickupDate);
  const endDay = dateNumber(returnDate);
  const hoverDay = dateNumber(hoverDate);
  const previewing =
    startDay != null && endDay == null && hoverDay != null && hoverDay > startDay;

  function pick(dateIso) {
    // No range yet, or a finished one: this click starts a new range.
    if (startDay == null || endDay != null) {
      onChange({ pickupDate: dateIso, returnDate: "" });
      return;
    }
    // A rental always spans at least one night, so a second click on or
    // before the start restarts the range instead of making it invalid.
    if (dateNumber(dateIso) <= startDay) {
      onChange({ pickupDate: dateIso, returnDate: "" });
      return;
    }
    onChange({ pickupDate, returnDate: dateIso });
  }

  const days = rentalDays(pickupDate, returnDate);

  return (
    <section className={`bk-daterange ${invalid ? "is-invalid" : ""}`}>
      <div className="bk-daterange__head">
        <div>
          <div className="bk-panel-label">Rental Dates</div>
          <h3 className="bk-daterange__title">
            {startDay == null || endDay != null
              ? "Select your pickup date"
              : "Now select your return date"}
          </h3>
        </div>
        <div className="bk-daterange__nav">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setVisibleMonth((value) => shiftMonth(value, -1))}
            disabled={visibleMonth <= currentMonth}
          >
            &larr;
          </button>
          <strong>{monthLabel(visibleMonth)}</strong>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setVisibleMonth((value) => shiftMonth(value, 1))}
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="bk-daterange__weekdays" aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="bk-daterange__grid" onMouseLeave={() => setHoverDate("")}>
        {cells.map((dateIso, index) => {
          if (!dateIso) {
            return (
              <span className="bk-daterange__blank" key={`blank-${index}`} />
            );
          }

          const day = dateNumber(dateIso);
          const isPast = dateIso < today;
          const isStart = dateIso === pickupDate;
          const isEnd =
            dateIso === returnDate || (previewing && day === hoverDay);
          const inRange = endDay != null && day > startDay && day < endDay;
          const inPreview = previewing && day > startDay && day < hoverDay;
          const isSolo = isStart && endDay == null && !previewing;

          return (
            <button
              type="button"
              key={dateIso}
              disabled={isPast}
              onMouseEnter={() => setHoverDate(dateIso)}
              onFocus={() => setHoverDate(dateIso)}
              onClick={() => pick(dateIso)}
              aria-label={formatDateLabel(dateIso)}
              className={`bk-daterange__day ${isStart ? "is-start" : ""} ${
                isEnd ? "is-end" : ""
              } ${isSolo ? "is-solo" : ""} ${inRange ? "is-range" : ""} ${
                inPreview ? "is-preview" : ""
              }`}
            >
              {Number(dateIso.slice(-2))}
            </button>
          );
        })}
      </div>

      <div className="bk-daterange__foot">
        <span>
          {days
            ? `${formatDateLabel(pickupDate)} to ${formatDateLabel(
                returnDate,
              )} — ${days} day${days === 1 ? "" : "s"}`
            : pickupDate
              ? `${formatDateLabel(pickupDate)} — now pick your return date`
              : "Click your pickup date, then your return date."}
        </span>
        {pickupDate && (
          <button
            type="button"
            className="bk-daterange__reset"
            onClick={() => onChange({ pickupDate: "", returnDate: "" })}
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}

function CameraChooserCard({ camera, selected, onSelect }) {
  const assets = getCameraAssets(camera);
  const detailCopy = getCameraDetailCopy(camera);
  const startingPrice = camera.pricing?.[0]?.pricePerDay;

  return (
    <button
      type="button"
      className={`bk-chooser__card ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(camera.name)}
    >
      {assets.image && (
        <img
          src={assets.image}
          alt=""
          className="bk-chooser__card-img"
          loading="lazy"
        />
      )}
      <span className="bk-chooser__card-name">{camera.name}</span>
      {startingPrice != null && (
        <span className="bk-chooser__card-price">
          From ₱{startingPrice}/day
        </span>
      )}
      <span className="bk-chooser__card-hook">{detailCopy.goodFor}</span>
    </button>
  );
}

function Field({ label, children, invalid = false }) {
  return (
    <label className={`bk-field ${invalid ? "is-invalid" : ""}`}>
      <span className="bk-label">{label}</span>
      {children}
      {invalid && <span className="bk-field__error">Required</span>}
    </label>
  );
}

function TextInput({ value, onChange, type = "text", required = false, invalid = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      aria-invalid={invalid}
      className={`bk-input ${invalid ? "is-invalid" : ""}`}
    />
  );
}

function TimeSelect({
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder = "Select time",
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      required={!disabled}
      aria-invalid={invalid}
      className={`bk-input ${invalid ? "is-invalid" : ""}`}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {TIME_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {formatTimeLabel(option)}
        </option>
      ))}
    </select>
  );
}

function readImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read uploaded image."));
    };
    image.src = url;
  });
}

async function compressImageFile(file) {
  if (!file) return "";
  if (!file.type.startsWith("image/")) {
    throw new Error("Requirement uploads must be image files.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Each uploaded image must be 12MB or smaller.");
  }

  const image = await readImageElement(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

function FileInput({ id, label, file, isProcessing, onChange }) {
  return (
    <div className="bk-file">
      <label htmlFor={id} className="bk-label">
        {label}
      </label>
      {isProcessing && (
        <div className="bk-file__processing">Saving preview…</div>
      )}
      {file && (
        <div className="bk-file__saved">
          <div className="bk-file__saved-row">
            <span className="bk-file__name">✓ {file.name}</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="bk-file__remove"
            >
              Remove
            </button>
          </div>
          <img
            src={file.dataUrl}
            alt={`${label} preview`}
            className="bk-file__preview"
          />
        </div>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        disabled={isProcessing}
        required={!hasRequirementUpload(file)}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] || null;
          onChange(selectedFile);
          event.target.value = "";
        }}
        className="bk-file__input"
      />
      <span className="bk-file__hint">
        {file
          ? "Preview saved. Choose a new file only if you want to replace it."
          : "Required image upload."}
      </span>
    </div>
  );
}

function RequirementFileInput({ id, label, file, isProcessing, onChange, invalid = false }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className={`bk-file bk-file--compact ${invalid ? "is-invalid" : ""}`}>
      <label htmlFor={id} className="bk-label">
        {label}
      </label>
      {isProcessing && <div className="bk-file__processing">Saving preview...</div>}
      {file && (
        <div className="bk-file__saved">
          <div className="bk-file__saved-row">
            <span className="bk-file__name">Saved: {file.name}</span>
            <div className="bk-file__actions">
              <button
                type="button"
                onClick={() => setShowPreview((value) => !value)}
                className="bk-file__preview-toggle"
              >
                {showPreview ? "Hide" : "Preview"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreview(false);
                  onChange(null);
                }}
                className="bk-file__remove"
              >
                Remove
              </button>
            </div>
          </div>
          {showPreview && (
            <img
              src={file.dataUrl}
              alt={`${label} preview`}
              className="bk-file__preview"
            />
          )}
        </div>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        disabled={isProcessing}
        required={!hasRequirementUpload(file)}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0] || null;
          onChange(selectedFile);
          event.target.value = "";
        }}
        className="bk-file__input"
      />
      <span className="bk-file__hint">
        {file
          ? "File saved. Use preview only when you need to check it."
          : "Image required. Max 12MB."}
      </span>
      {invalid && <span className="bk-field__error">This upload is required</span>}
    </div>
  );
}

function SignaturePad({ value, onChange, signerName, contractName, onError, invalid = false }) {
  const canvasRef = useRef(null);
  const fullscreenRef = useRef(null);
  const fullscreenCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const movedRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  function prepareCanvas(canvas, previous = value) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f0f0f";

    if (previous) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = previous;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    function resizeCanvas() { prepareCanvas(canvas); }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [value]);

  useEffect(() => {
    if (!fullscreenOpen) return undefined;
    const resize = () => prepareCanvas(fullscreenCanvasRef.current);
    const frame = requestAnimationFrame(resize);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [fullscreenOpen]);

  function pointFromEvent(event) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.nativeEvent?.offsetX ?? event.clientX - rect.left,
      y: event.nativeEvent?.offsetY ?? event.clientY - rect.top,
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    const point = pointFromEvent(event);
    drawingRef.current = true;
    movedRef.current = false;
    canvas.setPointerCapture?.(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const ctx = event.currentTarget.getContext("2d");
    const point = pointFromEvent(event);
    movedRef.current = true;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDrawing(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!movedRef.current) {
      const point = pointFromEvent(event);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = "#0f0f0f";
      ctx.fill();
    }
    drawingRef.current = false;
    canvas.releasePointerCapture?.(event.pointerId);
    onChange(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    [canvasRef.current, fullscreenCanvasRef.current].forEach((canvas) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.getContext("2d").clearRect(0, 0, rect.width, rect.height);
    });
    onChange("");
  }

  async function openFullscreenSignature() {
    setFullscreenOpen(true);
    try {
      await fullscreenRef.current?.requestFullscreen?.();
      await window.screen.orientation?.lock?.("landscape");
    } catch {
      // The fixed landscape overlay remains available when browser APIs are restricted.
    }
  }

  async function closeFullscreenSignature() {
    setFullscreenOpen(false);
    window.screen.orientation?.unlock?.();
    if (document.fullscreenElement) await document.exitFullscreen?.();
  }

  async function uploadSignature(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      onChange(await compressImageFile(file));
    } catch (err) {
      onError?.(err.message || "Unable to upload signature image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={`bk-signature ${invalid ? "is-invalid" : ""}`}>
      <div className="bk-signature__head">
        <div>
          <div className="bk-panel-label">Electronic Signature</div>
          <p className="bk-signature__statement">
            This signature will be placed on the {contractName || "selected camera"}
            rental contract. Draw below or upload a saved signature image.
          </p>
        </div>
        <button
          type="button"
          className="bk-signature__clear"
          onClick={clearSignature}
          disabled={!hasSignature(value)}
        >
          Clear
        </button>
      </div>
      <div className="bk-signature__choices">
        <span>Choose one: sign in the box or upload your signature.</span>
        <label className="bk-signature__upload">
          <input
            type="file"
            accept="image/*"
            onChange={uploadSignature}
            disabled={uploading}
          />
          {uploading ? "Uploading..." : "Upload Signature"}
        </label>
      </div>
      <canvas
        ref={canvasRef}
        className="bk-signature__canvas"
        aria-label="Renter e-signature"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div className="bk-signature__line">
        <span>{signerName || "Renter Signature"}</span>
        <span>{hasSignature(value) ? "Signed" : "Signature required"}</span>
      </div>
      <button
        type="button"
        className="bk-signature__fullscreen-button"
        onClick={openFullscreenSignature}
      >
        <span aria-hidden="true">↔</span>
        <span><strong>Sign Full Screen</strong><small>Opens in landscape for more writing room</small></span>
      </button>
      {invalid && <span className="bk-field__error">Signature is required</span>}
      <div
        ref={fullscreenRef}
        className={`bk-signature-fullscreen ${fullscreenOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Full-screen landscape signature"
      >
        <div className="bk-signature-fullscreen__panel">
          <div className="bk-signature-fullscreen__head">
            <div>
              <strong>Sign horizontally</strong>
              <span>Hold your phone sideways and write normally from left to right.</span>
            </div>
            <div className="bk-signature-fullscreen__actions">
              <button type="button" onClick={clearSignature}>Clear</button>
              <button type="button" className="is-done" onClick={closeFullscreenSignature}>Done ✓</button>
            </div>
          </div>
          <canvas
            ref={fullscreenCanvasRef}
            className="bk-signature-fullscreen__canvas"
            aria-label="Full-screen renter e-signature"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          <div className="bk-signature-fullscreen__baseline">SIGN ABOVE THIS LINE →</div>
        </div>
      </div>
    </section>
  );
}

function PreviewLightbox({ preview, onClose }) {
  useLockBodyScroll(Boolean(preview));
  if (!preview) return null;
  const images = preview.images || [{ src: preview.src, label: preview.label }];
  const isDetails = Boolean(
    preview.heroSrc ||
      preview.inclusions?.length ||
      preview.addOns?.length ||
      preview.images?.length,
  );

  return createPortal(
    <div
      className="bk-lightbox booking-app"
      role="dialog"
      aria-modal="true"
      aria-label={preview.label}
      onClick={onClose}
    >
      <div
        className={`bk-lightbox__panel ${isDetails ? "bk-lightbox__panel--details" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        {isDetails ? (
          <>
            <div className="bk-lightbox__detail-head">
              {preview.heroSrc && (
                <img
                  src={preview.heroSrc}
                  alt={preview.title || preview.label}
                  className="bk-lightbox__hero"
                />
              )}
              <div className="bk-lightbox__copy">
                <span className="bk-lightbox__eyebrow">{preview.label}</span>
                {preview.title && <strong>{preview.title}</strong>}
                {preview.goodFor && <p>Good for: {preview.goodFor}</p>}
                {preview.perfectFor && <p>Perfect for: {preview.perfectFor}</p>}
              </div>
              <button
                type="button"
                className="bk-lightbox__close bk-lightbox__close--icon"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="bk-lightbox__gear">
              {preview.inclusions?.length > 0 && (
                <section className="bk-lightbox__detail-section">
                  <div className="bk-panel-label">What's Included</div>
                  <ul className="bk-lightbox__list">
                    {preview.inclusions.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </section>
              )}
              {preview.addOns?.length > 0 && (
                <section className="bk-lightbox__gear-section">
                  <div className="bk-panel-label">Optional Add-ons</div>
                  <GearGrid items={preview.addOns} cameraName={preview.title} />
                </section>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="bk-lightbox__bar">
              <div className="bk-lightbox__label">{preview.label}</div>
              <button
                type="button"
                className="bk-lightbox__close bk-lightbox__close--icon"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="bk-lightbox__scroll">
              {images.map((image) => (
                <figure className="bk-lightbox__figure" key={image.src}>
                  <img
                    src={image.src}
                    alt={image.alt || image.label || preview.label}
                    className="bk-lightbox__img"
                  />
                </figure>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PaymentQrBlock() {
  const [activeId, setActiveId] = useState(PAYMENT_METHODS[0].id);
  const [copied, setCopied] = useState(false);
  const active =
    PAYMENT_METHODS.find((method) => method.id === activeId) ||
    PAYMENT_METHODS[0];

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(active.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) — number is still
      // visible on screen to copy by hand.
    }
  }

  return (
      <section className="bk-pay">
        <div className="bk-panel-label">
          Payment QR · 20% rental downpayment
        </div>
        <p className="bk-pay__deposit-reminder">
          The refundable security deposit (₱1,000 per camera) is separate
          from this downpayment and must be settled before release.
        </p>

        <div className="bk-pay__tabs" role="tablist">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              role="tab"
              aria-selected={method.id === activeId}
              className={`bk-pay__tab ${
                method.id === activeId ? "is-active" : ""
              }`}
              onClick={() => setActiveId(method.id)}
            >
              {method.label}
            </button>
          ))}
        </div>

        <div className="bk-pay__card">
          <div className="bk-pay__qr-display">
            <img
              src={active.qr}
              alt={`S & R Rentals ${active.label} payment QR`}
              className="bk-pay__qr-img"
            />
          </div>

          <div className="bk-pay__details">
            <span className="bk-pay__account-name">{active.accountName}</span>
            <button type="button" className="bk-pay__number" onClick={copyNumber}>
              {active.accountNumber}
              <span className="bk-pay__copy-hint">
                {copied ? "Copied!" : "Tap to copy"}
              </span>
            </button>
            <span className="bk-pay__note">
              Transfer fees may apply.
            </span>
          </div>
        </div>
      </section>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="bk-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — the code is on screen to copy by hand */
        }
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

// Optional sign-in at the top of the form: members see their tier and that
// the member price is applied; guests get a one-tap Google sign-in.
function MemberStrip({ member }) {
  if (member.status === "off") return null;
  if (member.status === "loading") {
    // Same footprint as the final strip, so the form doesn't jump.
    return wasSignedIn() ? <div className="bk-member bk-member--skeleton" aria-hidden="true" /> : null;
  }
  if (member.status === "member") {
    const tier = member.me?.tier;
    if (!tier) return null;
    const perks = [
      tier.discountPercent ? `${tier.discountPercent}% off the camera` : null,
      tier.freeAddons ? `${tier.freeAddons} free add-on${tier.freeAddons > 1 ? "s" : ""}` : null,
      tier.priority ? "priority review" : null,
    ].filter(Boolean);
    return (
      <div className={`bk-member bk-member--member tier--${tier.key}`}>
        {member.user?.photo && <img src={member.user.photo} alt="" className="bk-member__avatar" referrerPolicy="no-referrer" />}
        <p className="bk-member__text">
          Hi {(member.me?.renter?.name || member.user?.name || "").split(" ")[0] || "there"}! You're a{" "}
          <strong>
            {tier.name}
          </strong>{" "}
          member
          {perks.length ? `. ${perks.join(" and ")} applied to this booking.` : ". Your details are filled in for you."}
        </p>
      </div>
    );
  }
  return (
    <div className="bk-member">
      <p className="bk-member__text">
        <strong>Rented with us before?</strong> Sign in to fill in your details, skip re-uploading IDs, and earn
        member discounts. Optional.
      </p>
      <button type="button" className="btn btn--outline" onClick={openSignIn}>
        Sign in
      </button>
    </div>
  );
}

export function BookingTopBar() {
  const member = useMember();
  // Members see the member navigation (MemberShell, added in App) instead.
  if (looksSignedIn(member)) return null;
  return (
    <div className="bk-top">
      <a href="/" className="bk-top__brand" aria-label="Back to S&R Rentals home">
        <Logo size="sm" withTagline={false} />
      </a>
      <a href="/" className="bk-top__back">
        ← Back to site
      </a>
    </div>
  );
}

export default function PublicBooking() {
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState(initialFiles);
  const [processingFiles, setProcessingFiles] = useState({});
  const [fileResetKey, setFileResetKey] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [validatedSteps, setValidatedSteps] = useState(() => new Set());
  const [draftReady, setDraftReady] = useState(false);
  const [cameraName, setCameraName] = useState(initialCameraName);
  const catalog = useCatalog();
  const cameras = catalog.cameras;
  const member = useMember();
  // The tier whose perks the server will apply (it re-checks on submit).
  const memberTier = member.status === "member" ? member.me?.tier || null : null;
  const memberPrefilled = useRef(false);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  // More cameras in the same booking: [{ key, camera, addOns }].
  const [extraItems, setExtraItems] = useState([]);
  const [extraAvailability, setExtraAvailability] = useState({});
  const [brandLogo, setBrandLogo] = useState(COMPANY_LOGO);
  const [repSignature, setRepSignature] = useState("");
  const [assetPreview, setAssetPreview] = useState(null);
  const [availability, setAvailability] = useState({
    state: "idle",
    data: null,
    error: null,
  });
  const [submitState, setSubmitState] = useState({
    loading: false,
    error: null,
    success: null,
  });
  const [contractSaving, setContractSaving] = useState(false);
  const [repeatCheck, setRepeatCheck] = useState({
    loading: false,
    error: null,
  });

  useEffect(() => {
    let active = true;
    readBookingDraft()
      .then((draft) => {
        if (!active || !draft) return;
        if (draft.form) {
          const merged = { ...initialForm, ...draft.form };
          // Old drafts may hold times outside the 8AM–11PM window or a
          // return time that predates the 24-hour cycle rule.
          if (!TIME_OPTIONS.includes(merged.pickupTime)) {
            merged.pickupTime = initialForm.pickupTime;
          }
          merged.returnTime = merged.pickupTime;
          merged.repeatRenter = merged.repeatRenter === "yes" ? "yes" : "no";
          setForm(merged);
        }
        if (draft.files) setFiles({ ...initialFiles, ...draft.files });
        // Checked against the catalogue once it loads (effect below).
        if (typeof draft.cameraName === "string" && draft.cameraName) {
          setCameraName(draft.cameraName);
        }
        if (Array.isArray(draft.selectedAddOns)) {
          setSelectedAddOns(draft.selectedAddOns);
        }
        if (Array.isArray(draft.extraItems)) {
          setExtraItems(
            draft.extraItems
              .filter((item) => item && typeof item.camera === "string")
              .slice(0, MAX_ORDER_CAMERAS - 1)
              .map((item, i) => ({ key: `d${i}`, camera: item.camera, addOns: Array.isArray(item.addOns) ? item.addOns : [] })),
          );
        }
        if (Number.isInteger(draft.currentStep)) {
          setCurrentStep(Math.max(0, Math.min(draft.currentStep, STEPS.length - 1)));
        }
      })
      .catch(() => {
        // Draft storage may be unavailable in private browsing; booking still works.
      })
      .finally(() => active && setDraftReady(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReady || submitState.success) return undefined;
    const timer = window.setTimeout(() => {
      writeBookingDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        form,
        files,
        cameraName,
        selectedAddOns,
        extraItems,
        currentStep,
      }).catch(() => {
        // Never block the renter if browser draft storage is unavailable.
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [cameraName, currentStep, draftReady, extraItems, files, form, selectedAddOns, submitState.success]);

  // A requested or restored camera that isn't (or is no longer) offered —
  // removed, hidden, or a typo in a link — is dropped; casing is corrected.
  useEffect(() => {
    if (catalog.loading || catalog.error || !cameraName) return;
    const match = findCamera(cameras, cameraName);
    if (!match) setCameraName("");
    else if (match.name !== cameraName) setCameraName(match.name);
  }, [catalog.loading, catalog.error, cameras, cameraName]);

  useEffect(() => {
    if (catalog.loading || catalog.error) return;
    setExtraItems((items) => {
      const next = items
        .map((item) => {
          const match = findCamera(cameras, item.camera);
          return match ? { ...item, camera: match.name } : null;
        })
        .filter(Boolean);
      return JSON.stringify(next) === JSON.stringify(items) ? items : next;
    });
  }, [catalog.loading, catalog.error, cameras]);

  // Entering the renter step for a delivery: start the Lalamove form from the
  // renter's own name, number and address — most deliveries go to them.
  useEffect(() => {
    if (currentStep !== 2 || form.mode !== "Deliver") return;
    setForm((current) => {
      const d = current.delivery || EMPTY_DELIVERY;
      const name = current.fullName.trim() || current.repeatVerifiedName;
      const next = {
        ...d,
        recipientName: d.recipientName || name || "",
        recipientPhone: d.recipientPhone || current.contactNumber.trim(),
        address: d.address || current.address.trim(),
      };
      return JSON.stringify(next) === JSON.stringify(d) ? current : { ...current, delivery: next };
    });
  }, [currentStep, form.mode]);

  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.name === cameraName),
    [cameras, cameraName],
  );
  const selectedContract = useMemo(
    () => getContractForCamera(cameraName),
    [cameraName],
  );
  const selectedAssets = useMemo(
    () => getCameraAssets(selectedCamera),
    [selectedCamera],
  );

  const addOns = useMemo(() => cameraAddOns(selectedCamera), [selectedCamera]);
  const selectedAddonDetails = useMemo(
    () =>
      selectedAddOns
        .map((addonName) => addOns.find((addon) => addon.name === addonName))
        .filter(Boolean),
    [addOns, selectedAddOns],
  );

  const quote = useMemo(() => {
    const days = rentalDays(form.pickupDate, form.returnDate);
    if (!selectedCamera || !days) {
      return {
        days,
        cameraSubtotal: 0,
        addOnsSubtotal: 0,
        rushFee: 0,
        perks: memberPerks(null),
        grossTotal: 0,
        total: 0,
      };
    }

    const rushFee = isSameDayBooking(form.pickupDate) ? RUSH_FEE : 0;
    // Member price preview — the server works it out again from the catalogue.
    const { cameraSubtotal, addOnsSubtotal, perks } = priceCamera(
      selectedCamera,
      selectedAddOns,
      days,
      memberTier,
      memberTier?.freeAddons || 0,
    );
    const grossTotal = cameraSubtotal + addOnsSubtotal + rushFee;

    return {
      days,
      cameraSubtotal,
      addOnsSubtotal,
      rushFee,
      perks,
      grossTotal,
      total: Math.max(grossTotal - perks.savings, 0),
    };
  }, [form.pickupDate, form.returnDate, memberTier, selectedAddOns, selectedCamera]);

  // The other cameras in this booking, each priced on its own.
  const extraQuotes = useMemo(() => {
    let freeLeft = Math.max((memberTier?.freeAddons || 0) - quote.perks.freeAddons.length, 0);
    return extraItems.map((item) => {
      const camera = cameras.find((c) => c.name === item.camera) || null;
      const priced = priceCamera(camera, item.addOns, quote.days || 0, memberTier, freeLeft);
      freeLeft -= priced.perks.freeAddons.length;
      return { ...item, cameraInfo: camera, ...priced };
    });
  }, [cameras, extraItems, memberTier, quote.days, quote.perks.freeAddons.length]);

  // What the renter pays for the whole booking.
  const order = useMemo(() => {
    const extras = extraQuotes.filter((item) => item.cameraInfo);
    const count = 1 + extras.length;
    const rentalTotal = quote.total + extras.reduce((sum, item) => sum + item.net, 0);
    const savings = quote.perks.savings + extras.reduce((sum, item) => sum + item.perks.savings, 0);
    const deposits = SECURITY_DEPOSIT * count;
    return {
      count,
      rentalTotal,
      savings,
      deposits,
      payable: rentalTotal + deposits,
      downpayment: Math.ceil(rentalTotal * 0.2),
    };
  }, [extraQuotes, quote.perks.savings, quote.total]);

  // Signed-in member: fill in what we already know (once, after any saved
  // draft is restored) and, if they've rented before, verify them as a
  // repeat renter so they can skip the ID uploads.
  useEffect(() => {
    const me = member.me;
    if (!draftReady || !me || memberPrefilled.current) return;
    memberPrefilled.current = true;
    const p = me.profile || {};
    setForm((current) => ({
      ...current,
      fullName: current.fullName || p.fullName || "",
      contactNumber: current.contactNumber || p.contactNumber || "",
      facebookName: current.facebookName || p.facebookName || "",
      facebookLink: current.facebookLink || p.facebookLink || "",
      address: current.address || p.address || "",
      ...(me.repeatRef && current.repeatRenter === "no" && !current.repeatVerifiedName
        ? { repeatRenter: "yes", repeatRef: me.repeatRef }
        : {}),
    }));
    if (me.repeatRef && form.repeatRenter === "no") verifyRepeatRenter(me.repeatRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, member.me]);

  const validWindow = windowIsValid(form);
  const totalPayableBeforeRelease = order.payable;

  useEffect(() => {
    setSelectedAddOns([]);
  }, [cameraName]);

  useEffect(() => {
    let alive = true;
    // Strip the gray/white paper background off the brand logo and the rep's
    // signature so both drop cleanly onto the contract.
    loadTransparentInk(COMPANY_LOGO)
      .then((url) => alive && setBrandLogo(url))
      .catch(() => {});
    loadTransparentInk(REP_SIGNATURE_SRC)
      .then((url) => alive && setRepSignature(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!cameraName || !validWindow) {
      setAvailability({ state: "idle", data: null, error: null });
      return;
    }

    let active = true;
    const params = new URLSearchParams({
      camera: cameraName,
      pickUpDate: form.pickupDate,
      pickUpTime: form.pickupTime,
      returnDate: form.returnDate,
      returnTime: form.returnTime,
    });

    setAvailability({ state: "loading", data: null, error: null });
    apiGetJson(`/api/public?action=availability&${params.toString()}`)
      .then((data) => {
        if (active) {
          setAvailability({ state: "ready", data, error: null });
        }
      })
      .catch((err) => {
        if (active) {
          setAvailability({
            state: "error",
            data: null,
            error: err.message || "Availability check failed",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [
    cameraName,
    form.pickupDate,
    form.pickupTime,
    form.returnDate,
    form.returnTime,
    validWindow,
  ]);

  // Availability of each other camera in the booking (one check per model).
  const extraCameraKey = [...new Set(extraItems.map((item) => item.camera).filter(Boolean))].sort().join("|");
  useEffect(() => {
    const names = extraCameraKey ? extraCameraKey.split("|") : [];
    if (names.length === 0 || !validWindow) {
      setExtraAvailability({});
      return undefined;
    }
    let active = true;
    setExtraAvailability(Object.fromEntries(names.map((name) => [name, { state: "loading" }])));
    for (const name of names) {
      const params = new URLSearchParams({
        camera: name,
        pickUpDate: form.pickupDate,
        pickUpTime: form.pickupTime,
        returnDate: form.returnDate,
        returnTime: form.returnTime,
      });
      apiGetJson(`/api/public?action=availability&${params.toString()}`)
        .then((data) => {
          if (active) setExtraAvailability((cur) => ({ ...cur, [name]: { state: "ready", available: data.available || 0 } }));
        })
        .catch((err) => {
          if (active) {
            setExtraAvailability((cur) => ({
              ...cur,
              [name]: { state: "error", error: err.message || "Availability check failed" },
            }));
          }
        });
    }
    return () => {
      active = false;
    };
  }, [extraCameraKey, form.pickupDate, form.pickupTime, form.returnDate, form.returnTime, validWindow]);

  function addExtraItem() {
    setSubmitState((state) => ({ ...state, error: null }));
    setForm((current) => ({ ...current, signatureDataUrl: "" }));
    setExtraItems((items) =>
      items.length >= MAX_ORDER_CAMERAS - 1
        ? items
        : [...items, { key: `${Date.now()}-${items.length}`, camera: "", addOns: [] }],
    );
  }

  function updateExtraItem(key, patch) {
    setSubmitState((state) => ({ ...state, error: null }));
    if ("camera" in patch) setForm((current) => ({ ...current, signatureDataUrl: "" }));
    setExtraItems((items) =>
      items.map((item) =>
        item.key === key ? { ...item, ...patch, ...("camera" in patch ? { addOns: [] } : {}) } : item,
      ),
    );
  }

  function toggleExtraAddon(key, addonName) {
    setExtraItems((items) =>
      items.map((item) =>
        item.key === key
          ? {
              ...item,
              addOns: item.addOns.includes(addonName)
                ? item.addOns.filter((name) => name !== addonName)
                : [...item.addOns, addonName],
            }
          : item,
      ),
    );
  }

  function removeExtraItem(key) {
    setSubmitState((state) => ({ ...state, error: null }));
    setForm((current) => ({ ...current, signatureDataUrl: "" }));
    setExtraItems((items) => items.filter((item) => item.key !== key));
  }

  function updateField(key, value) {
    setSubmitState((state) => ({ ...state, error: null }));
    setForm((current) => {
      // Rentals run on a 24-hour cycle, so the return time always mirrors
      // the pickup time.
      if (key === "pickupTime") {
        return { ...current, pickupTime: value, returnTime: value };
      }
      // Verification is bound to the reference code — editing it voids a
      // previous check.
      if (key === "repeatRef") {
        return { ...current, repeatRef: value, repeatVerifiedName: "" };
      }
      return { ...current, [key]: value };
    });
  }

  function setRange({ pickupDate, returnDate }) {
    setSubmitState((state) => ({ ...state, error: null }));
    setForm((current) => ({ ...current, pickupDate, returnDate }));
  }

  function updateCamera(value) {
    setSubmitState((state) => ({ ...state, error: null }));
    setForm((current) => ({ ...current, signatureDataUrl: "" }));
    setCameraName(value);
  }

  async function verifyRepeatRenter(refArg) {
    // Called from the button (an event) or with a member's past booking ref.
    const ref = (typeof refArg === "string" ? refArg : form.repeatRef).trim();
    if (!ref) {
      setRepeatCheck({
        loading: false,
        error: "Enter the reference code from your previous booking.",
      });
      return;
    }
    setRepeatCheck({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ ref });
      const data = await apiGetJson(`/api/public?action=verify-renter&${params.toString()}`);
      if (data.verified) {
        // Prefill the renter details from their record so they don't have
        // to retype anything.
        setForm((current) => ({
          ...current,
          repeatVerifiedName: data.fullName || "Verified renter",
          fullName: data.fullName || current.fullName,
          facebookName: data.facebookName || current.facebookName,
          facebookLink: data.facebookLink || current.facebookLink,
          address: data.address || current.address,
          contactNumber: data.contactNumber || current.contactNumber,
        }));
        setRepeatCheck({ loading: false, error: null });
      } else {
        setRepeatCheck({
          loading: false,
          error:
            data.reason === "not_approved"
              ? "We found this booking, but it hasn't been approved or hasn't gone out yet. Only past rentals that were approved or already released/returned count — please continue as a first-time renter for now."
              : "We couldn't match that reference code and contact number. Make sure you entered the same contact number used for that booking.",
        });
      }
    } catch (err) {
      setRepeatCheck({
        loading: false,
        error: err.message || "Unable to verify right now. Please try again.",
      });
    }
  }

  async function updateFile(field, file) {
    setSubmitState((state) => ({ ...state, error: null }));
    if (!file) {
      setFiles((current) => ({ ...current, [field.stateKey]: null }));
      setProcessingFiles((current) => ({ ...current, [field.stateKey]: false }));
      return;
    }

    setProcessingFiles((current) => ({ ...current, [field.stateKey]: true }));
    try {
      const dataUrl = await compressImageFile(file);
      if (!dataUrl.startsWith("data:image/")) {
        throw new Error("Unable to save uploaded image.");
      }
      setFiles((current) => ({
        ...current,
        [field.stateKey]: {
          name: file.name,
          dataUrl,
        },
      }));
    } catch (err) {
      setFiles((current) => ({ ...current, [field.stateKey]: null }));
      setSubmitState({
        loading: false,
        error: `${field.label}: ${err.message || "Unable to save uploaded image."}`,
        success: null,
      });
    } finally {
      setProcessingFiles((current) => ({ ...current, [field.stateKey]: false }));
    }
  }

  function toggleAddon(addonName) {
    setSelectedAddOns((current) =>
      current.includes(addonName)
        ? current.filter((item) => item !== addonName)
        : [...current, addonName],
    );
  }

  async function buildUploadedDocuments() {
    const entries = REQUIREMENT_FILES.map((field) => [
      field.payloadKey,
      [files[field.stateKey]?.dataUrl || ""],
    ]);
    return Object.fromEntries(entries);
  }

  function getMissingRequirement() {
    return activeRequirementFiles.find(
      (field) => !hasRequirementUpload(files[field.stateKey]),
    );
  }

  function buildPayload(responseId, documents) {
    return {
      responseId,
      Timestamp: new Date().toISOString(),
      _source: "website_booking_form",
      PUBLIC_BOOKING: true,
      status: "pending",
      REPEAT_RENTER: isRepeatVerified,
      REPEAT_REF: isRepeatVerified ? form.repeatRef.trim() : "",
      FULL_NAME: form.fullName.trim(),
      FACEBOOK_ACCOUNT_NAME: form.facebookName.trim(),
      FACEBOOK_PROFILE_LINK: form.facebookLink.trim(),
      CONTACT_NUMBER: form.contactNumber.trim(),
      COMPLETE_ADDRESS: form.address.trim(),
      TYPE_OF_TRIP: form.tripType.trim(),
      SPECIFIC_DESTINATION: form.destination.trim(),
      PICK_UP_DATE: form.pickupDate,
      PICK_UP_TIME: form.pickupTime,
      RETURN_DATE: form.returnDate,
      RETURN_TIME: form.returnTime,
      PREFERRED_MODE: form.mode,
      PREFERRED_CAMERA: cameraName,
      ...(form.mode === "Deliver"
        ? {
            DELIVERY_DETAILS: form.delivery,
            RETURN_DETAILS:
              form.returnSame === "no"
                ? { sameAsDelivery: false, ...form.returnPickup }
                : { sameAsDelivery: true },
          }
        : {}),
      // Sent BEFORE member perks: the server verifies the renter's tier and
      // subtracts the perks itself (api/submit → upsertSubmittedBooking).
      RENTAL_FEE: quote.grossTotal || null,
      RUSH_FEE: quote.rushFee,
      SECURITY_DEPOSIT,
      // This camera's own total — each camera of the booking has its own.
      TOTAL_PAYABLE_BEFORE_RELEASE: quote.grossTotal + SECURITY_DEPOSIT,
      "Please_choose_your_add-ons": selectedAddOns,
      CONTRACT_CAMERA: selectedContract.unit,
      CONTRACT_TERMS_AND_CONDITIONS: selectedContract.terms,
      // The other cameras: the server saves each as its own booking
      // (<code>-2, <code>-3…) with its own fee and ₱1,000 deposit. Fees are
      // before member perks, like RENTAL_FEE above.
      ...(extraQuotes.length
        ? {
            ORDER_ITEMS: extraQuotes.map((item) => {
              const contract = getContractForCamera(item.camera);
              return {
                camera: item.camera,
                addons: item.addOns,
                rentalFee: item.gross || null,
                contractUnit: contract.unit,
                contractTerms: contract.terms,
              };
            }),
          }
        : {}),
      ...documents,
      Data_Privacy_Act_of_2012: form.privacy
        ? ["YES, I understand that my data will be used to process my booking"]
        : [],
      "Terms_&_Conditions": hasSignature(form.signatureDataUrl)
        ? [
            `Electronically signed by ${form.fullName.trim()} for the ${selectedContract.unit} rental agreement.`,
          ]
        : [],
      RENTER_E_SIGNATURE: hasSignature(form.signatureDataUrl)
        ? [form.signatureDataUrl]
        : [],
      E_SIGNATURE_DATE: hasSignature(form.signatureDataUrl)
        ? new Date().toISOString()
        : "",
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    // Verified repeat renters' personal details come from their record —
    // the server backfills them, so only per-trip fields are checked here.
    const requiredFields = [
      ...(isRepeatVerified
        ? []
        : [
            form.fullName,
            form.facebookName,
            form.facebookLink,
            form.contactNumber,
            form.address,
          ]),
      form.tripType,
      form.destination,
      form.pickupDate,
      form.pickupTime,
      form.returnDate,
      form.returnTime,
      form.mode,
      cameraName,
    ];

    if (requiredFields.some((value) => !String(value || "").trim())) {
      setSubmitState({
        loading: false,
        error: "All booking fields are required.",
        success: null,
      });
      return;
    }

    if (form.repeatRenter === "yes" && !isRepeatVerified) {
      setSubmitState({
        loading: false,
        error: "Please verify your previous booking first, or switch to first-time renter.",
        success: null,
      });
      return;
    }

    const missingFile = getMissingRequirement();
    if (missingFile) {
      setSubmitState({
        loading: false,
        error: `${missingFile.label} upload is required.`,
        success: null,
      });
      return;
    }

    if (!validWindow) {
      setSubmitState({
        loading: false,
        error: "Please choose a valid pickup and return schedule.",
        success: null,
      });
      return;
    }

    if (!form.privacy) {
      setSubmitState({
        loading: false,
        error: "Data privacy consent is required before submitting.",
        success: null,
      });
      return;
    }

    if (!form.termsAgree) {
      setSubmitState({
        loading: false,
        error: "You must agree to the rental terms & conditions before submitting.",
        success: null,
      });
      return;
    }

    if (!hasSignature(form.signatureDataUrl)) {
      setSubmitState({
        loading: false,
        error: "Renter e-signature is required on the contract.",
        success: null,
      });
      return;
    }

    if (availability.state !== "ready") {
      setSubmitState({
        loading: false,
        error: "Please wait for the availability check.",
        success: null,
      });
      return;
    }

    if ((availability.data?.available || 0) <= 0) {
      setSubmitState({
        loading: false,
        error: "Selected camera is not available for that schedule.",
        success: null,
      });
      return;
    }

    if (extraProblem) {
      setSubmitState({ loading: false, error: extraProblem, success: null });
      return;
    }

    const responseId = `PUBLIC-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    setSubmitState({ loading: true, error: null, success: null });
    try {
      const documents = await buildUploadedDocuments();
      const renterToken = member.status === "member" ? await getIdToken().catch(() => null) : null;
      const result = await apiPostJson("/api/submit", {
        ...buildPayload(responseId, documents),
        ...(renterToken ? { RENTER_TOKEN: renterToken } : {}),
      });
      await clearBookingDraft().catch(() => {});
      const memberSuccess =
        result.member && member.me
          ? {
              tierName: member.me.tier.name,
              tierKey: member.me.tier.key,
              savings: order.savings,
              next: member.me.next,
              toNext: member.me.toNext,
            }
          : null;
      if (renterToken) refreshMe();
      setSubmitState({
        loading: false,
        error: null,
        success: {
          responseId,
          total: order.rentalTotal,
          delivery: form.mode === "Deliver",
          camera: cameraName,
          cameras: [cameraName, ...extraQuotes.map((item) => item.camera)],
          references: result.order?.references || [responseId],
          pickupDate: form.pickupDate,
          member: memberSuccess,
        },
      });
      setForm(initialForm);
      setFiles(initialFiles);
      setProcessingFiles({});
      setFileResetKey((key) => key + 1);
      setCameraName("");
      setCurrentStep(0);
      setValidatedSteps(new Set());
      setSelectedAddOns([]);
      setExtraItems([]);
    } catch (err) {
      setSubmitState({
        loading: false,
        error: err.message || "Unable to submit booking.",
        success: null,
      });
    }
  }

  const availabilityReady = availability.state === "ready";
  const availabilityCount = availabilityReady
    ? availability.data?.available || 0
    : 0;
  const availabilityLabel =
    availability.state === "loading"
      ? "Checking availability…"
      : availabilityReady
        ? availabilityCount > 0
          ? "Available for your schedule ✓"
          : "Not available for that schedule"
        : availability.state === "error"
          ? availability.error
          : "Pick a schedule to check availability";
  const availabilityTone =
    availability.state === "loading"
      ? "wait"
      : availabilityReady && availabilityCount > 0
        ? "ok"
        : availabilityReady || availability.state === "error"
          ? "bad"
          : "idle";

  // Every camera of the booking must have enough free units — the same model
  // twice needs two.
  const unitsWanted = {};
  for (const name of [cameraName, ...extraItems.map((item) => item.camera)]) {
    if (name) unitsWanted[name] = (unitsWanted[name] || 0) + 1;
  }
  function unitsFree(name) {
    if (name === cameraName) return availabilityReady ? { state: "ready", available: availabilityCount } : availability;
    return extraAvailability[name] || { state: validWindow ? "loading" : "idle" };
  }
  const extraProblem = (() => {
    if (extraItems.some((item) => !item.camera)) return "Choose a camera for each added camera, or remove it.";
    for (const item of extraItems) {
      const free = unitsFree(item.camera);
      if (free.state === "loading") return "Please wait for availability.";
      if (free.state === "error") return free.error;
      if (free.state !== "ready") return "Please complete the availability check.";
      if (free.available < unitsWanted[item.camera]) {
        return free.available <= 0
          ? `${item.camera} is not available for that schedule.`
          : `Only ${free.available} ${item.camera} ${free.available === 1 ? "unit is" : "units are"} free for that schedule.`;
      }
    }
    if (cameraName && availabilityReady && availabilityCount > 0 && availabilityCount < unitsWanted[cameraName]) {
      return `Only ${availabilityCount} ${cameraName} ${availabilityCount === 1 ? "unit is" : "units are"} free for that schedule.`;
    }
    return null;
  })();

  const availabilityStepComplete =
    !extraProblem &&
    Boolean(cameraName) &&
    Boolean(form.mode) &&
    Boolean(form.pickupDate) &&
    Boolean(form.pickupTime) &&
    Boolean(form.returnDate) &&
    Boolean(form.returnTime) &&
    validWindow &&
    availabilityReady &&
    availabilityCount > 0;
  const privacyStepComplete = Boolean(form.privacy) && Boolean(form.termsAgree);
  // A verified repeat renter gets their details prefilled from the record
  // and reuses the ID documents already on file — only the per-booking
  // proof of downpayment is collected from them.
  const isRepeatVerified =
    form.repeatRenter === "yes" && Boolean(form.repeatVerifiedName);
  // Verified repeat renters only supply the per-trip fields — their personal
  // details come from the record (the server backfills any gaps).
  const renterStepComplete = (
    form.repeatRenter === "yes"
      ? [isRepeatVerified ? "ok" : "", form.tripType, form.destination]
      : [
          form.address,
          form.fullName,
          form.facebookName,
          form.facebookLink,
          form.contactNumber,
          form.tripType,
          form.destination,
        ]
  ).every((value) => String(value || "").trim());
  const isDelivery = form.mode === "Deliver";
  // First missing piece of the Lalamove delivery form, if any.
  const deliveryProblem = !isDelivery
    ? null
    : deliveryMissing(form.delivery) ||
      (form.returnSame === "no" ? deliveryMissing(form.returnPickup, "Return pickup") : null);
  const renterAndDeliveryComplete = renterStepComplete && !deliveryProblem;
  const activeRequirementFiles =
    form.repeatRenter === "yes"
      ? REQUIREMENT_FILES.filter(
          (field) => field.stateKey === "proofOfDownpayment",
        )
      : REQUIREMENT_FILES;
  const requirementsStepComplete =
    (form.repeatRenter !== "yes" || isRepeatVerified) &&
    activeRequirementFiles.every((field) =>
      hasRequirementUpload(files[field.stateKey]),
    );
  const hasProcessingFile = Object.values(processingFiles).some(Boolean);
  const reviewStepComplete = hasSignature(form.signatureDataUrl);
  const stepComplete = [
    availabilityStepComplete,
    privacyStepComplete,
    renterAndDeliveryComplete,
    requirementsStepComplete,
    reviewStepComplete,
  ];
  const showCurrentStepErrors = validatedSteps.has(currentStep);

  function markStepValidated(step) {
    setValidatedSteps((current) => new Set([...current, step]));
  }

  function stepError(step = currentStep) {
    if (step === 0) {
      if (!cameraName) return "Preferred unit is required.";
      if (!form.mode) return "Preferred option is required.";
      if (
        !form.pickupDate ||
        !form.pickupTime ||
        !form.returnDate ||
        !form.returnTime
      ) {
        return "Pickup and return schedule are required.";
      }
      if (!validWindow) return "Please choose a valid pickup and return schedule.";
      if (availability.state === "loading") return "Please wait for availability.";
      if (availability.state === "error") return availability.error;
      if (!availabilityReady) return "Please complete the availability check.";
      if (availabilityCount <= 0) return "Selected unit is not available.";
      if (extraProblem) return extraProblem;
    }
    if (step === 1) {
      if (!form.privacy) return "Data privacy consent is required.";
      if (!form.termsAgree) {
        return "You must agree to the rental terms & conditions.";
      }
    }
    if (step === 2) {
      if (form.repeatRenter === "yes" && !isRepeatVerified) {
        return "Please verify your previous booking first, or switch to first-time renter.";
      }
      if (!renterStepComplete) return "All renter details are required.";
      if (deliveryProblem) return deliveryProblem;
    }
    if (step === 3) {
      if (form.repeatRenter === "yes" && !isRepeatVerified) {
        return "Please verify your previous booking first, or switch to first-time renter.";
      }
      if (hasProcessingFile) {
        return "Please wait for requirement uploads to finish.";
      }
      const missingFile = getMissingRequirement();
      if (missingFile) return `${missingFile.label} upload is required.`;
    }
    if (step === 4 && !reviewStepComplete) {
      return "Renter e-signature is required on the contract.";
    }
    return null;
  }

  function handleNext() {
    const error = stepError();
    if (error) {
      markStepValidated(currentStep);
      setSubmitState({ loading: false, error, success: null });
      return;
    }
    setSubmitState((state) => ({ ...state, error: null }));
    setCurrentStep((step) => Math.min(step + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setSubmitState((state) => ({ ...state, error: null }));
    setCurrentStep((step) => Math.max(step - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStartOver() {
    const sure = window.confirm(
      "Start over? This clears everything you've entered in the form.",
    );
    if (!sure) return;
    await clearBookingDraft().catch(() => {});
    setForm(initialForm);
    setFiles(initialFiles);
    setProcessingFiles({});
    setFileResetKey((key) => key + 1);
    setCameraName("");
    setCurrentStep(0);
    setValidatedSteps(new Set());
    setSelectedAddOns([]);
    setRepeatCheck({ loading: false, error: null });
    setSubmitState({ loading: false, error: null, success: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFormSubmit(event) {
    if (currentStep < STEPS.length - 1) {
      event.preventDefault();
      handleNext();
      return;
    }
    const firstIncompleteStep = stepComplete.findIndex((complete) => !complete);
    if (firstIncompleteStep !== -1) {
      event.preventDefault();
      markStepValidated(firstIncompleteStep);
      setCurrentStep(firstIncompleteStep);
      setSubmitState({
        loading: false,
        error: stepError(firstIncompleteStep) || "Please complete all required fields.",
        success: null,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    await handleSubmit(event);
  }

  function resetSuccess() {
    setSubmitState({ loading: false, error: null, success: null });
    setCurrentStep(0);
    setValidatedSteps(new Set());
  }

  async function downloadContractImage() {
    if (!hasSignature(form.signatureDataUrl)) {
      setSubmitState({
        loading: false,
        error: "Please sign or upload your signature before downloading the contract.",
        success: null,
      });
      return;
    }

    setSubmitState((state) => ({ ...state, error: null }));
    setContractSaving(true);

    try {
      // Preload assets: renter signature, background-free logo + rep signature,
      // and the script font (fallback for the rep signature).
      const [signature, logoImage, repSigImage] = await Promise.all([
        loadCanvasImage(form.signatureDataUrl),
        loadCanvasImage(COMPANY_LOGO).catch(() => null),
        loadCanvasImage(REP_SIGNATURE_SRC).catch(() => null),
        document.fonts?.load('700 44px "Caveat"').catch(() => null),
      ]);
      const logo = logoImage ? inkOnlyCanvas(logoImage) : null;
      const repSig = repSigImage ? inkOnlyCanvas(repSigImage) : null;

      const width = 1240;
      const margin = 90;
      const ink = "#141414";
      // Draw onto a tall working canvas, then fit the result to a real A4 page.
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = 3400;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, canvas.height);
      let y = 96;

      function drawLine(text, options = {}) {
        ctx.fillStyle = ink;
        ctx.textAlign = "left";
        ctx.font = `${options.bold ? "700" : "400"} ${options.size || 19}px "Times New Roman", Times, serif`;
        y = drawWrappedText(
          ctx,
          text,
          margin,
          y,
          width - margin * 2,
          options.lineHeight || 27,
        );
        y += options.after ?? 5;
      }

      function section(title) {
        y += 14;
        ctx.textAlign = "left";
        ctx.fillStyle = ink;
        ctx.font = '700 21px "Times New Roman", Times, serif';
        ctx.fillText(title, margin, y);
        y += 26;
      }

      function drawClauseText(text, x, startY, maxX, lineHeight, size) {
        const value = String(text || "");
        const match = value.match(/^([^:]{2,80}):\s*(.*)$/);
        const body = match ? match[2] : value;
        let currentY = startY;
        let currentX = x;

        ctx.textAlign = "left";
        if (match) {
          const prefix = `${match[1]}: `;
          ctx.font = `700 ${size}px "Times New Roman", Times, serif`;
          ctx.fillText(prefix, x, currentY);
          currentX = x + ctx.measureText(prefix).width;
        }

        ctx.font = `400 ${size}px "Times New Roman", Times, serif`;
        const words = body.split(/\s+/).filter(Boolean);
        let line = "";
        words.forEach((word) => {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxX - currentX && line) {
            ctx.fillText(line, currentX, currentY);
            currentY += lineHeight;
            currentX = x;
            line = word;
          } else {
            line = testLine;
          }
        });

        if (line) {
          ctx.fillText(line, currentX, currentY);
          currentY += lineHeight;
        }

        return currentY;
      }

      // Header: centered title, then owner/contact on the left with logo at right.
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.font = '700 28px "Times New Roman", Times, serif';
      ctx.fillText("EQUIPMENT RENTAL AGREEMENT", width / 2, y);
      y += 40;
      if (logo) {
        const logoW = 210;
        const logoH = (logo.height / logo.width) * logoW;
        ctx.drawImage(logo, width - margin - logoW, y - 8, logoW, logoH);
      }
      ctx.textAlign = "left";
      ctx.font = '700 18px "Times New Roman", Times, serif';
      ctx.fillText("Owner:", margin, y);
      ctx.font = '400 18px "Times New Roman", Times, serif';
      ctx.fillText(
        `${COMPANY_NAME} (San Ildefonso, Bulacan)`,
        margin + ctx.measureText("Owner:").width + 16,
        y,
      );
      y += 25;
      ctx.font = '700 18px "Times New Roman", Times, serif';
      ctx.fillText("Contact:", margin, y);
      ctx.font = '400 18px "Times New Roman", Times, serif';
      ctx.fillText(
        COMPANY_CONTACT,
        margin + ctx.measureText("Contact:").width + 16,
        y,
      );
      y += 4;

      section("I. RENTAL PERIOD");
      drawLine(
        `Pick-up Date & Time: ${formatDateLabel(form.pickupDate)} @ ${formatTimeLabel(
          form.pickupTime,
        )}`,
      );
      drawLine(
        `Return Date & Time: ${formatDateLabel(form.returnDate)} @ ${formatTimeLabel(
          form.returnTime,
        )}`,
        { after: 10 },
      );

      section("II. EQUIPMENT & INCLUSIONS (Check all that apply)");
      drawLine(`Unit: ${selectedContract.unit}`);
      drawLine("Condition: [ ] Good/Working   [ ] No Scratches on Lens");
      drawLine("Accessories:", { after: 4 });
      // Two-column accessory checklist, matching the printed form.
      const accessories = selectedCamera?.inclusions || [];
      const half = Math.ceil(accessories.length / 2);
      const colX = [margin + 20, width / 2 + 12];
      const rowH = 25;
      ctx.font = '400 18px "Times New Roman", Times, serif';
      ctx.textAlign = "left";
      accessories.forEach((item, index) => {
        const col = index < half ? 0 : 1;
        const row = col === 0 ? index : index - half;
        ctx.fillText(`•  ${item}`, colX[col], y + row * rowH);
      });
      y += half * rowH + 6;
      drawLine(
        `Others: ${
          selectedAddonDetails.length
            ? selectedAddonDetails.map((addon) => addon.name).join(", ")
            : "______________________________________________"
        }`,
        { after: 10 },
      );
      // Other cameras in the same booking — one contract, one signature.
      contractExtras().forEach((item, index) => {
        drawLine(`Unit ${index + 2}: ${item.unit}`, { bold: true });
        drawLine(`Others: ${item.addOns.length ? item.addOns.join(", ") : "None"}`, { after: 6 });
      });

      section("III. FEES");
      drawLine(
        `Rental Fee: ${pesoMoney(order.rentalTotal)}${order.count > 1 ? ` (${order.count} units)` : ""}`,
      );
      if (quote.rushFee > 0) {
        drawLine(
          `Same-Day Rush Fee (included in rental fee): ${pesoMoney(quote.rushFee)}`,
        );
      }
      drawLine(
        order.count > 1
          ? `Security Deposit: ${pesoMoney(order.deposits)} (${pesoMoney(SECURITY_DEPOSIT)} per unit, refundable upon safe return)`
          : `Security Deposit: ${pesoMoney(SECURITY_DEPOSIT)} (Refundable upon safe return)`,
      );
      drawLine(`Total Payables: ${pesoMoney(totalPayableBeforeRelease)}`, {
        after: 10,
      });

      section("IV. TERMS & CONDITIONS");
      buildNumberedTerms(selectedContract.terms).forEach((item) => {
        const labelX = item.isSub ? margin + 30 : margin;
        const textX = item.isSub ? margin + 64 : margin + 32;
        const size = item.isSub ? 17 : 18;
        ctx.fillStyle = ink;
        ctx.textAlign = "left";
        ctx.font = `${item.isSub ? "400" : "700"} ${size}px "Times New Roman", Times, serif`;
        ctx.fillText(item.label, labelX, y);
        y = drawClauseText(item.text, textX, y, width - margin, 22, size);
        y += 5;
      });

      y += 10;
      drawLine(
        "I have read and understood the terms above. I acknowledge receipt of the equipment in good working order.",
        { size: 19, lineHeight: 25, after: 34 },
      );

      // Two signature blocks side by side (Renter | S&R Rentals Rep).
      const gap = 70;
      const colW = (width - margin * 2 - gap) / 2;
      const blockX = [margin, margin + colW + gap];
      const lineY = y + 70;
      const sigDate = formatDateLabel(todayIso());
      const sigBoxH = 74;

      const placeSignature = (source, boxX) => {
        const scale = Math.min(colW / source.width, sigBoxH / source.height);
        const w = source.width * scale;
        const h = source.height * scale;
        ctx.drawImage(source, boxX + (colW - w) / 2, lineY - h - 2, w, h);
      };
      placeSignature(signature, blockX[0]);
      if (repSig) {
        placeSignature(repSig, blockX[1]);
      } else {
        // Fallback: render the rep signature in the brand script font.
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.font = '700 38px "Caveat", cursive';
        ctx.fillText(REP_NAME, blockX[1] + colW / 2, lineY - 14);
      }

      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      blockX.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + colW, lineY);
        ctx.stroke();
      });

      const printedNames = [form.fullName.trim().toUpperCase(), REP_NAME_UPPER];
      const roles = [
        "Renter's Signature over Printed Name",
        "S&R Rentals Rep. Signature over Printed Name",
      ];
      ctx.textAlign = "center";
      blockX.forEach((x, index) => {
        const cx = x + colW / 2;
        ctx.fillStyle = ink;
        ctx.font = '700 18px "Times New Roman", Times, serif';
        ctx.fillText(printedNames[index], cx, lineY + 34);
        ctx.font = '400 15px "Times New Roman", Times, serif';
        ctx.fillText(roles[index], cx, lineY + 60);
        ctx.fillText(`Date: ${sigDate}`, cx, lineY + 88);
      });

      const contentHeight = Math.min(lineY + 88 + margin, canvas.height);

      // Fit the drawn contract onto a true A4 page (portrait, 210 x 297).
      const a4Width = 1240;
      const a4Height = Math.round((a4Width * 297) / 210);
      const scale = Math.min(1, a4Height / contentHeight);
      const drawW = width * scale;
      const drawH = contentHeight * scale;
      const output = document.createElement("canvas");
      output.width = a4Width;
      output.height = a4Height;
      const outCtx = output.getContext("2d");
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, a4Width, a4Height);
      outCtx.drawImage(
        canvas,
        0,
        0,
        width,
        contentHeight,
        (a4Width - drawW) / 2,
        0,
        drawW,
        drawH,
      );

      const fileName = `sr-rentals-${compactFileName(cameraName)}-${compactFileName(
        form.fullName,
      )}-contract.png`;
      await saveCanvasAsPng(output, fileName);
    } catch (err) {
      setSubmitState({
        loading: false,
        error: err.message || "Unable to download the contract image.",
        success: null,
      });
    } finally {
      setContractSaving(false);
    }
  }

  function renderPrivacyConsent() {
    return (
      <label className={`bk-agree bk-agree--privacy ${showCurrentStepErrors && !form.privacy ? "is-invalid" : ""}`}>
        <input
          type="checkbox"
          checked={form.privacy}
          onChange={(event) => updateField("privacy", event.target.checked)}
        />
        <span>
          <strong>Data Privacy Act consent.</strong> I understand that my
          information and uploaded requirements will be used by S&R Rentals to
          check, process, and document this booking.
        </span>
      </label>
    );
  }

  function renderPrivacyAndTerms() {
    return (
      <div className="bk-stack">
        <section className="bk-legal">
          <div className="bk-panel-label">Data Privacy</div>
          {renderPrivacyConsent()}
        </section>

        <section className="bk-legal">
          <div className="bk-panel-label">
            Rental Terms &amp; Conditions — {selectedContract.unit}
          </div>
          <p className="bk-legal__lede">
            Please read the terms for your selected unit. You'll sign the full
            contract with these terms on the last step.
          </p>
          <ol className="bk-legal__terms">
            {buildNumberedTerms(selectedContract.terms).map((item) => (
              <li
                key={item.text}
                className={item.isSub ? "bk-legal__term--sub" : "bk-legal__term"}
              >
                <span className="bk-legal__term-label">{item.label}</span>
                <span>{renderContractTermText(item.text)}</span>
              </li>
            ))}
          </ol>
          <label className={`bk-agree ${showCurrentStepErrors && !form.termsAgree ? "is-invalid" : ""}`}>
            <input
              type="checkbox"
              checked={form.termsAgree}
              onChange={(event) => updateField("termsAgree", event.target.checked)}
            />
            <span>
              <strong>I have read and agree</strong> to the S&R Rentals rental
              terms &amp; conditions above.
            </span>
          </label>
        </section>
      </div>
    );
  }

  function renderAddOns() {
    if (addOns.length === 0) return null;
    return (
      <div className="bk-addons">
        <div className="bk-panel-label">
          Want to add anything to your {selectedCamera?.name}?
        </div>
        <div className="bk-addons__grid">
          {addOns.map((addon) => (
            <label
              key={addon.name}
              className={`bk-addon ${
                selectedAddOns.includes(addon.name) ? "is-selected" : ""
              }`}
            >
              <GearImage
                name={addon.name}
                cameraName={selectedCamera?.name}
                className="bk-addon__img"
              />
              <span className="bk-addon__info">
                <span className="bk-addon__name">{addon.name}</span>
                <span className="bk-addon__price">
                  ₱{addon.pricePerDay}/day
                </span>
              </span>
              <input
                type="checkbox"
                checked={selectedAddOns.includes(addon.name)}
                onChange={() => toggleAddon(addon.name)}
                className="bk-sr-only"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  function renderExtraItems() {
    if (!cameraName) return null;
    const canAdd = extraItems.length < MAX_ORDER_CAMERAS - 1;
    return (
      <section className="bk-extras">
        {extraQuotes.map((item, index) => {
          const offered = cameraAddOns(item.cameraInfo);
          const free = item.camera ? unitsFree(item.camera) : null;
          const short = free?.state === "ready" && free.available < (unitsWanted[item.camera] || 1);
          const missing = showCurrentStepErrors && !item.camera;
          return (
            <div className={`bk-extra ${missing || short ? "is-invalid" : ""}`} key={item.key}>
              <div className="bk-extra__head">
                <span className="bk-extra__num">Camera {index + 2}</span>
                <button type="button" className="bk-extra__remove" onClick={() => removeExtraItem(item.key)}>
                  Remove
                </button>
              </div>
              <div className="bk-extra__pick">
                {item.cameraInfo && getCameraAssets(item.cameraInfo).image && (
                  <img src={getCameraAssets(item.cameraInfo).image} alt="" className="bk-extra__thumb" />
                )}
                <select
                  className={`bk-input ${missing ? "is-invalid" : ""}`}
                  value={item.camera}
                  onChange={(event) => updateExtraItem(item.key, { camera: event.target.value })}
                  aria-label={`Camera ${index + 2}`}
                >
                  <option value="" disabled>
                    Choose a camera
                  </option>
                  {cameras.map((camera) => (
                    <option key={camera.name} value={camera.name}>
                      {camera.name}
                    </option>
                  ))}
                </select>
              </div>
              {item.camera && (
                <p className={`bk-extra__avail bk-extra__avail--${free?.state === "ready" ? (short ? "bad" : "ok") : free?.state || "idle"}`}>
                  {free?.state === "ready"
                    ? short
                      ? free.available <= 0
                        ? "Not available for that schedule"
                        : `Only ${free.available} free for that schedule — you picked ${unitsWanted[item.camera]}`
                      : "Available for your schedule ✓"
                    : free?.state === "loading"
                      ? "Checking availability…"
                      : free?.state === "error"
                        ? free.error
                        : "Pick a schedule to check availability"}
                </p>
              )}
              {offered.length > 0 && (
                <div className="bk-extra__addons">
                  {offered.map((addon) => (
                    <label key={addon.name} className={`bk-extra__addon ${item.addOns.includes(addon.name) ? "is-selected" : ""}`}>
                      <input
                        type="checkbox"
                        className="bk-sr-only"
                        checked={item.addOns.includes(addon.name)}
                        onChange={() => toggleExtraAddon(item.key, addon.name)}
                      />
                      {addon.name} <small>₱{addon.pricePerDay}/day</small>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {canAdd && (
          <button type="button" className="bk-extras__add" onClick={addExtraItem}>
            <span aria-hidden="true">+</span> Add another camera
            <small>Same dates · each camera has its own ₱1,000 deposit</small>
          </button>
        )}
      </section>
    );
  }

  function renderCameraChooser() {
    return (
      <section
        className={`bk-chooser ${
          showCurrentStepErrors && !cameraName ? "is-invalid" : ""
        }`}
      >
        <div className="bk-panel-label">Choose Your Camera</div>
        <div className="bk-chooser__grid">
          {catalog.loading && <p>Loading cameras…</p>}
          {!catalog.loading && cameras.length === 0 && (
            <p>
              Cameras can't be loaded right now. Please refresh the page, or
              message us to book.
            </p>
          )}
          {cameras.map((camera) => (
            <CameraChooserCard
              key={camera.name}
              camera={camera}
              selected={camera.name === cameraName}
              onSelect={updateCamera}
            />
          ))}
        </div>
        {showCurrentStepErrors && !cameraName && (
          <p className="bk-chooser__error">Please select a camera to continue.</p>
        )}
        {selectedCamera && (
          <div className="bk-chooser__summary">
            <div className="bk-chooser__summary-head">
              {selectedAssets.image && (
                <img
                  src={selectedAssets.image}
                  alt={selectedCamera.name}
                  className="bk-chooser__summary-thumb"
                />
              )}
              <div>
                <strong>{selectedCamera.name}</strong>
                <span>Comes with:</span>
              </div>
            </div>
            <ul className="bk-chooser__inclusions">
              {(selectedCamera.inclusions || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button
              type="button"
              className="bk-chooser__more"
              onClick={() => {
                const detailCopy = getCameraDetailCopy(selectedCamera);
                setAssetPreview({
                  label: `${selectedCamera.name} details`,
                  title: selectedCamera.name,
                  heroSrc: selectedAssets.detailImage || selectedAssets.image,
                  goodFor: detailCopy.goodFor,
                  perfectFor: detailCopy.perfectFor,
                  inclusions: selectedCamera.inclusions || [],
                  addOns,
                });
              }}
            >
              See full details & photos
            </button>
          </div>
        )}
      </section>
    );
  }

  /** The other cameras as they appear on the contract. */
  function contractExtras() {
    return extraQuotes
      .filter((item) => item.cameraInfo)
      .map((item) => ({ key: item.key, unit: getContractForCamera(item.camera).unit, addOns: item.addOns }));
  }

  function renderFullContract() {
    return (
      <section className="bk-contract bk-contract--doc">
        <div className="bk-contract__intro">
          <div className="bk-panel-label">Completed Rental Contract</div>
          <p>
            Step 1: sign or upload your signature. Step 2: check the contract
            preview. Step 3: download or screenshot the completed contract.
          </p>
        </div>

        <SignaturePad
          value={form.signatureDataUrl}
          signerName={form.fullName}
          contractName={selectedContract.unit}
          invalid={showCurrentStepErrors && !hasSignature(form.signatureDataUrl)}
          onChange={(value) => updateField("signatureDataUrl", value)}
          onError={(message) =>
            setSubmitState({
              loading: false,
              error: message,
              success: null,
            })
          }
        />

        <div className="bk-contract__paper-head">
          <div className="bk-panel-label">Rental Contract Preview</div>
          <p>Your renter details and signature are already placed below.</p>
        </div>

        <div className="bk-contract__paper">
          <h3>EQUIPMENT RENTAL AGREEMENT</h3>
          <div className="bk-doc__meta">
            <div>
              <p>
                <strong>Owner:</strong> {COMPANY_NAME} (San Ildefonso, Bulacan)
              </p>
              <p>
                <strong>Contact:</strong> {COMPANY_CONTACT}
              </p>
            </div>
            <img
              className="bk-doc__logo"
              src={brandLogo}
              alt="S&R Rentals logo"
            />
          </div>

          <h4>I. RENTAL PERIOD</h4>
          <p>
            Pick-up Date &amp; Time:{" "}
            <span className="bk-contract__line">
              {formatDateLabel(form.pickupDate)} @ {formatTimeLabel(form.pickupTime)}
            </span>
          </p>
          <p>
            Return Date &amp; Time:{" "}
            <span className="bk-contract__line">
              {formatDateLabel(form.returnDate)} @ {formatTimeLabel(form.returnTime)}
            </span>
          </p>

          <h4>II. EQUIPMENT &amp; INCLUSIONS (Check all that apply)</h4>
          <p>Unit: {selectedContract.unit}</p>
          <p>Condition: [ ] Good/Working&nbsp;&nbsp;&nbsp;[ ] No Scratches on Lens</p>
          <p>Accessories:</p>
          <ul className="bk-doc__acc">
            {(selectedCamera?.inclusions || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Others:{" "}
            <span className="bk-contract__line">
              {selectedAddonDetails.length
                ? selectedAddonDetails.map((addon) => addon.name).join(", ")
                : "______________________________________"}
            </span>
          </p>

          {contractExtras().map((item, index) => (
            <div className="bk-doc__extra" key={item.key}>
              <p>
                <strong>
                  Unit {index + 2}: {item.unit}
                </strong>
              </p>
              <p>Others: {item.addOns.length ? item.addOns.join(", ") : "None"}</p>
            </div>
          ))}

          <h4>III. FEES</h4>
          <p>
            Rental Fee: {pesoMoney(order.rentalTotal)}
            {order.count > 1 ? ` (${order.count} units)` : ""}
          </p>
          {quote.rushFee > 0 && (
            <p>
              Same-Day Rush Fee (included in rental fee):{" "}
              {pesoMoney(quote.rushFee)}
            </p>
          )}
          <p>
            {order.count > 1
              ? `Security Deposit: ${pesoMoney(order.deposits)} (${pesoMoney(SECURITY_DEPOSIT)} per unit, refundable upon safe return)`
              : `Security Deposit: ${pesoMoney(SECURITY_DEPOSIT)} (Refundable upon safe return)`}
          </p>
          <p>Total Payables: {pesoMoney(totalPayableBeforeRelease)}</p>

          <h4>IV. TERMS &amp; CONDITIONS</h4>
          <ol className="bk-doc__terms">
            {buildNumberedTerms(selectedContract.terms).map((item) => (
              <li
                key={item.text}
                className={item.isSub ? "bk-doc__term--sub" : "bk-doc__term"}
              >
                <span className="bk-doc__term-label">{item.label}</span>
                <span>{renderContractTermText(item.text)}</span>
              </li>
            ))}
          </ol>
          <p className="bk-doc__ack">
            I have read and understood the terms above. I acknowledge receipt of
            the equipment in good working order.
          </p>

          <div className="bk-doc__signrow">
            <div className="bk-doc__sign">
              <div className="bk-doc__sign-mark">
                {hasSignature(form.signatureDataUrl) && (
                  <img src={form.signatureDataUrl} alt="Renter signature" />
                )}
              </div>
              <div className="bk-doc__sign-line" />
              <p className="bk-doc__sign-name">
                {form.fullName.trim() || "—"}
              </p>
              <p>Renter's Signature over Printed Name</p>
              <p>Date: {formatDateLabel(todayIso())}</p>
            </div>
            <div className="bk-doc__sign">
              {repSignature ? (
                <div className="bk-doc__sign-mark">
                  <img src={repSignature} alt="S&R Rentals representative signature" />
                </div>
              ) : (
                <div className="bk-doc__sign-mark bk-doc__sign-mark--rep">
                  {REP_NAME}
                </div>
              )}
              <div className="bk-doc__sign-line" />
              <p className="bk-doc__sign-name">{REP_NAME_UPPER}</p>
              <p>S&amp;R Rentals Rep. Signature over Printed Name</p>
              <p>Date: {formatDateLabel(todayIso())}</p>
            </div>
          </div>
        </div>

        <div className="bk-contract__foot">
          <p className="bk-contract__reminder">
            Reminder: download or screenshot this completed contract, then send it
            to S&R Rentals via PM after submitting your booking.
          </p>
          <button
            type="button"
            className="bk-contract__download"
            onClick={downloadContractImage}
            disabled={!hasSignature(form.signatureDataUrl) || contractSaving}
          >
            {contractSaving ? "Preparing contract…" : "Download Signed Contract"}
          </button>
        </div>
      </section>
    );
  }

  function renderQuotation({ payment = false } = {}) {
    const many = order.count > 1;
    const cameraLines = [
      {
        key: "first",
        name: cameraName || "Preferred Unit",
        cameraSubtotal: quote.cameraSubtotal,
        addonLines: selectedAddonDetails.map((addon) => ({ name: addon.name, amount: addon.pricePerDay * quote.days })),
        perks: quote.perks,
        net: quote.total - quote.rushFee,
      },
      ...extraQuotes
        .filter((item) => item.cameraInfo)
        .map((item) => ({ key: item.key, name: item.camera, ...item })),
    ];
    return (
      <div className={`bk-quote ${payment ? "bk-quote--payment" : ""}`}>
        <div className="bk-quote__title">
          {payment ? "Rental Fee & Downpayment Breakdown" : "Quotation"}
        </div>
        <div className="bk-quote__rows">
          <div className="bk-quote__row">
            <span>Days</span>
            <span className="bk-num">{quote.days || "–"}</span>
          </div>
          {cameraLines.map((line, index) => (
            <div className={many ? "bk-quote__cam" : undefined} key={line.key}>
              {many && <div className="bk-quote__cam-title">Camera {index + 1}</div>}
              <div className="bk-quote__row">
                <span>{line.name}</span>
                <span className="bk-num">{money(line.cameraSubtotal)}</span>
              </div>
              {line.addonLines.length > 0
                ? line.addonLines.map((addon) => (
                    <div className="bk-quote__row" key={addon.name}>
                      <span>{addon.name} add-on</span>
                      <span className="bk-num">{money(addon.amount)}</span>
                    </div>
                  ))
                : !many && (
                    <div className="bk-quote__row">
                      <span>Add-ons</span>
                      <span className="bk-num">{money(0)}</span>
                    </div>
                  )}
              {line.perks.discount > 0 && memberTier && (
                <div className="bk-quote__row bk-quote__row--member">
                  <span>
                    {memberTier.name} member · {memberTier.discountPercent}% off camera
                  </span>
                  <span className="bk-num">−{money(line.perks.discount)}</span>
                </div>
              )}
              {line.perks.freeAddons.map((addon) => (
                <div className="bk-quote__row bk-quote__row--member" key={`free-${addon.name}`}>
                  <span>Free add-on · {addon.name}</span>
                  <span className="bk-num">−{money(addon.amount)}</span>
                </div>
              ))}
              {many && (
                <div className="bk-quote__row bk-quote__row--sub">
                  <span>Rental fee · Camera {index + 1}</span>
                  <span className="bk-num">{money(line.net)}</span>
                </div>
              )}
            </div>
          ))}
          {quote.rushFee > 0 && (
            <div className="bk-quote__row bk-quote__row--rush">
              <span>Same-Day Rush Fee{many ? " (once per booking)" : ""}</span>
              <span className="bk-num">{money(quote.rushFee)}</span>
            </div>
          )}
        </div>
        <p className="bk-quote__rush-note">
          The {money(RUSH_FEE)} rush fee applies only when the pickup or
          delivery date is today.
        </p>
        <div className="bk-quote__rental-total">
          <span>Total Rental Fee{many ? ` · ${order.count} cameras` : ""}</span>
          <span className="bk-num">{money(order.rentalTotal)}</span>
        </div>
        <div className="bk-quote__deposit">
          <span>
            Security Deposit{many ? ` · ${money(SECURITY_DEPOSIT)} × ${order.count} cameras` : ""}
            <small>
              {many
                ? "Each camera has its own deposit, refunded when that camera comes back safe and complete"
                : "Refundable upon safe and complete return"}
            </small>
          </span>
          <span className="bk-num">{money(order.deposits)}</span>
        </div>
        <div className="bk-quote__total">
          <span>Total Payable Before Release</span>
          <span className="bk-num">{money(order.payable)}</span>
        </div>
        <div className="bk-quote__dp">
          <span>
            {payment
              ? "Pay this downpayment now (20% of rental fee)"
              : "Downpayment (20% of rental fee)"}
          </span>
          <span className="bk-num">{money(order.downpayment)}</span>
        </div>
        {payment && (
          <p className="bk-quote__payment-note">
            Pay exactly {money(order.downpayment)} now using one of the accounts
            below, then upload your proof of downpayment. The refundable
            {` ${money(order.deposits)} `}security deposit
            {many ? ` (${money(SECURITY_DEPOSIT)} per camera)` : ""} is paid
            separately before release.
          </p>
        )}
      </div>
    );
  }

  function renderStepContent() {
    if (currentStep === 0) {
      return (
        <div className="bk-stack">
          {renderCameraChooser()}
          {renderAddOns()}
          {renderExtraItems()}
          <Field label="Preferred Option" invalid={showCurrentStepErrors && !form.mode}>
            <select
              value={form.mode}
              onChange={(event) => updateField("mode", event.target.value)}
              required
              aria-invalid={showCurrentStepErrors && !form.mode}
              className={`bk-input ${showCurrentStepErrors && !form.mode ? "is-invalid" : ""}`}
            >
              <option value="" disabled>
                Select pickup or delivery
              </option>
              {OPTION_CHOICES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {form.mode === "Deliver" && (
            <p className="bk-delivery-reminder">
              We deliver by Lalamove and book the rider for you. In step 3
              you'll pin your exact location on the map so the rider goes
              straight to your door. The delivery fee follows the actual
              Lalamove fare.
            </p>
          )}
          <DateRangePicker
            pickupDate={form.pickupDate}
            returnDate={form.returnDate}
            onChange={setRange}
            invalid={
              showCurrentStepErrors &&
              (!form.pickupDate || !form.returnDate || !validWindow)
            }
          />
          <div className="bk-grid-2">
            <Field
              label="Pickup / Delivery Time"
              invalid={showCurrentStepErrors && !form.pickupTime}
            >
              <TimeSelect
                value={form.pickupTime}
                onChange={(value) => updateField("pickupTime", value)}
                invalid={showCurrentStepErrors && !form.pickupTime}
                placeholder="Select pickup / delivery time"
              />
            </Field>
            <Field
              label="Return Time (same as pickup — 24-hr cycle)"
              invalid={showCurrentStepErrors && !form.returnTime}
            >
              <TimeSelect
                value={form.returnTime}
                onChange={(value) => updateField("returnTime", value)}
                disabled
                invalid={showCurrentStepErrors && !form.returnTime}
                placeholder="Select pickup time first"
              />
            </Field>
          </div>
          <div className={`bk-status bk-status--${availabilityTone} ${showCurrentStepErrors && !availabilityStepComplete ? "is-invalid" : ""}`}>
            <span className="bk-status__dot" aria-hidden="true" />
            {availabilityLabel}
          </div>
          {order.rentalTotal > 0 && renderQuotation()}
        </div>
      );
    }

    if (currentStep === 1) {
      return renderPrivacyAndTerms();
    }

    if (currentStep === 2) {
      return (
        <div className="bk-stack">
          <div className={`bk-repeat ${showCurrentStepErrors && form.repeatRenter === "yes" && !isRepeatVerified ? "is-invalid" : ""}`}>
            <div className="bk-panel-label">Have you rented from us before?</div>
            <div className="bk-repeat__toggle">
              <button
                type="button"
                className={`bk-repeat__option ${form.repeatRenter !== "yes" ? "is-active" : ""}`}
                onClick={() => updateField("repeatRenter", "no")}
              >
                First-time renter
              </button>
              <button
                type="button"
                className={`bk-repeat__option ${form.repeatRenter === "yes" ? "is-active" : ""}`}
                onClick={() => updateField("repeatRenter", "yes")}
              >
                Repeat renter
              </button>
            </div>
            {form.repeatRenter === "yes" &&
              (isRepeatVerified ? (
                <div className="bk-repeat__verified">
                  ✓ Verified — welcome back,{" "}
                  <strong>{form.repeatVerifiedName}</strong>! Your details are
                  on file, so just set your trip type and destination below.
                  You'll also skip the ID uploads later — only the proof of
                  downpayment is needed.
                </div>
              ) : (
                <div className="bk-repeat__check">
                  <p className="bk-repeat__hint">
                    No need to retype your details — just enter the reference
                    code from your previous booking (shown after you submitted
                    it, or ask S&amp;R Rentals for it) and we'll pull them up.
                  </p>
                  <Field label="Previous Booking Reference">
                    <input
                      className="bk-input"
                      value={form.repeatRef}
                      onChange={(event) => updateField("repeatRef", event.target.value)}
                      placeholder="PUBLIC-XXXXXXXXXXXXX-XXXXXX"
                      aria-label="Previous booking reference code"
                    />
                  </Field>
                  <button
                    type="button"
                    className="bk-repeat__verify bk-repeat__verify--wide"
                    onClick={verifyRepeatRenter}
                    disabled={repeatCheck.loading}
                  >
                    {repeatCheck.loading ? "Checking…" : "Verify & fill my details"}
                  </button>
                  {repeatCheck.error && (
                    <span className="bk-field__error">{repeatCheck.error}</span>
                  )}
                </div>
              ))}
          </div>
          {(form.repeatRenter !== "yes" || isRepeatVerified) && (
        <div className="bk-grid-2">
          {/* A verified repeat renter's personal details all come from
              their record — they only fill in trip type and destination. */}
          {!isRepeatVerified && (
          <div className="bk-grid-wide">
            <Field label="Complete Address" invalid={showCurrentStepErrors && !form.address.trim()}>
              <TextInput
                value={form.address}
                onChange={(value) => updateField("address", value)}
                required
                invalid={showCurrentStepErrors && !form.address.trim()}
              />
            </Field>
          </div>
          )}
          {!isRepeatVerified && (
          <Field label="Full Name" invalid={showCurrentStepErrors && !form.fullName.trim()}>
            <TextInput
              value={form.fullName}
              onChange={(value) => updateField("fullName", value)}
              required
              invalid={showCurrentStepErrors && !form.fullName.trim()}
            />
          </Field>
          )}
          {!isRepeatVerified && (
          <Field label="Contact Number" invalid={showCurrentStepErrors && !form.contactNumber.trim()}>
            <TextInput
              value={form.contactNumber}
              onChange={(value) => updateField("contactNumber", value)}
              required
              invalid={showCurrentStepErrors && !form.contactNumber.trim()}
            />
          </Field>
          )}
          {!isRepeatVerified && (
          <Field label="Facebook Name" invalid={showCurrentStepErrors && !form.facebookName.trim()}>
            <TextInput
              value={form.facebookName}
              onChange={(value) => updateField("facebookName", value)}
              required
              invalid={showCurrentStepErrors && !form.facebookName.trim()}
            />
          </Field>
          )}
          {!isRepeatVerified && (
          <Field label="Facebook Link" invalid={showCurrentStepErrors && !form.facebookLink.trim()}>
            <TextInput
              value={form.facebookLink}
              onChange={(value) => updateField("facebookLink", value)}
              required
              invalid={showCurrentStepErrors && !form.facebookLink.trim()}
            />
          </Field>
          )}
          <Field label="Trip Type" invalid={showCurrentStepErrors && !form.tripType.trim()}>
            <select
              value={form.tripType}
              onChange={(event) => updateField("tripType", event.target.value)}
              required
              aria-invalid={showCurrentStepErrors && !form.tripType.trim()}
              className={`bk-input ${showCurrentStepErrors && !form.tripType.trim() ? "is-invalid" : ""}`}
            >
              <option value="" disabled>
                Select trip type
              </option>
              <option value="Local">Local</option>
              <option value="International">International</option>
            </select>
          </Field>
          <Field label="Destination" invalid={showCurrentStepErrors && !form.destination.trim()}>
            <TextInput
              value={form.destination}
              onChange={(value) => updateField("destination", value)}
              required
              invalid={showCurrentStepErrors && !form.destination.trim()}
            />
          </Field>
        </div>
          )}
          {isDelivery && (form.repeatRenter !== "yes" || isRepeatVerified) && (
            <section className="bk-repeat bk-deliv-section">
              <div className="bk-panel-label">Lalamove delivery details</div>
              <p className="bk-repeat__hint">
                We'll book the Lalamove for you using exactly these details, so
                please make sure the pin is on your door or gate.
              </p>
              {!isRepeatVerified && (
                <button
                  type="button"
                  className="bk-repeat__verify"
                  onClick={() =>
                    updateField("delivery", {
                      ...form.delivery,
                      recipientName: form.fullName.trim(),
                      recipientPhone: form.contactNumber.trim(),
                      address: form.address.trim(),
                    })
                  }
                >
                  Deliver to me — use my name, number &amp; address above
                </button>
              )}
              <DeliveryDetailsForm
                value={form.delivery}
                onChange={(next) => updateField("delivery", next)}
                showErrors={showCurrentStepErrors}
              />
              <div className="bk-panel-label bk-deliv__return-label">
                Return pickup — where do we collect the camera?
              </div>
              <div className="bk-repeat__toggle">
                <button
                  type="button"
                  className={`bk-repeat__option ${form.returnSame !== "no" ? "is-active" : ""}`}
                  onClick={() => updateField("returnSame", "yes")}
                >
                  Same as delivery
                </button>
                <button
                  type="button"
                  className={`bk-repeat__option ${form.returnSame === "no" ? "is-active" : ""}`}
                  onClick={() => updateField("returnSame", "no")}
                >
                  Different place / person
                </button>
              </div>
              {form.returnSame === "no" && (
                <DeliveryDetailsForm
                  idPrefix="return"
                  value={form.returnPickup}
                  onChange={(next) => updateField("returnPickup", next)}
                  showErrors={showCurrentStepErrors}
                />
              )}
              <p className="bk-repeat__hint">
                You can still change the return pickup later on the Track my
                booking page, until we book the return rider.
              </p>
            </section>
          )}
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div className="bk-stack">
          {order.rentalTotal > 0 ? (
            renderQuotation({ payment: true })
          ) : (
            <div className="bk-quote bk-quote--payment bk-quote--pending">
              Complete your camera and rental schedule in Check Availability to
              see the rental fee, ₱1,000 refundable security deposit, total
              payable before release, and exact 20% downpayment here.
            </div>
          )}
          <PaymentQrBlock />
          {isRepeatVerified && (
            <div className="bk-repeat__verified bk-repeat__verified--standalone">
              ✓ Verified repeat renter — we'll reuse the IDs on your record.
              Only the proof of downpayment is needed below.
            </div>
          )}
          <div className="bk-grid-2">
            {activeRequirementFiles.map((field) => (
              <RequirementFileInput
                key={`${field.stateKey}-${fileResetKey}`}
                id={`${field.stateKey}-${fileResetKey}`}
                label={field.label}
                file={files[field.stateKey]}
                isProcessing={Boolean(processingFiles[field.stateKey])}
                invalid={showCurrentStepErrors && !hasRequirementUpload(files[field.stateKey])}
                onChange={(file) => updateFile(field, file)}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bk-stack">
        <div className="bk-review-grid">
          <div className="bk-review-card">
            <div className="bk-panel-label">Renter</div>
            <div className="bk-review-card__main">{form.fullName}</div>
            <div className="bk-review-card__sub">{form.contactNumber}</div>
          </div>
          <div className="bk-review-card">
            <div className="bk-panel-label">Booking</div>
            <div className="bk-review-card__main">
              {[cameraName, ...extraQuotes.filter((item) => item.cameraInfo).map((item) => item.camera)].join(" + ")}
            </div>
            <div className="bk-review-card__sub">
              {form.pickupDate} {formatTimeLabel(form.pickupTime)} to{" "}
              {form.returnDate} {formatTimeLabel(form.returnTime)}
            </div>
          </div>
        </div>
        {renderQuotation()}
        {renderFullContract()}
      </div>
    );
  }

  if (submitState.success) {
    return (
      <main className="bk-page">
        <BookingTopBar />
        <section className="bk-success">
          <p className="bk-kicker float-in" style={{ "--d": "0ms" }}>
            Request received
          </p>
          <h1 className="bk-title">
            <span className="hero__word" style={{ "--d": "120ms" }}>
              Booking
            </span>{" "}
            <span className="hero__word" style={{ "--d": "260ms" }}>
              Sent!
            </span>
          </h1>
          <p className="bk-success__note float-in" style={{ "--d": "420ms" }}>
            {submitState.success.cameras?.length > 1 ? (
              <>
                Your request for <strong>{submitState.success.cameras.length} cameras</strong> —{" "}
                {submitState.success.cameras.join(", ")} — is in. One reference code covers all of them.
              </>
            ) : (
              <>
                Your request for the <strong>{submitState.success.camera}</strong> is in.
              </>
            )}{" "}
            Save your reference code — you'll use it to track this booking and
            to skip the ID uploads next time.
          </p>
          <div className="bk-success__ref-row float-in" style={{ "--d": "540ms" }}>
            <div className="bk-success__ref">{submitState.success.responseId}</div>
            <CopyButton text={submitState.success.responseId} />
          </div>
          {submitState.success.member && (
            <div className={`bk-success__member tier--${submitState.success.member.tierKey} float-in`} style={{ "--d": "580ms" }}>
              {submitState.success.member.savings > 0
                ? `${submitState.success.member.tierName} member price — you saved ${pesoMoney(submitState.success.member.savings)}. `
                : `Saved to your ${submitState.success.member.tierName} account. `}
              {submitState.success.member.next
                ? `Once this rental is completed you'll be ${
                    submitState.success.member.toNext <= 1
                      ? `${submitState.success.member.next.name}!`
                      : `${submitState.success.member.toNext - 1} away from ${submitState.success.member.next.name}.`
                  }`
                : "Thanks for being a top-tier renter!"}
            </div>
          )}
          <ol className="bk-next float-in" style={{ "--d": "620ms" }}>
            <li>
              <strong>We review your requirements</strong>
              <span>and message you on Facebook once your booking is approved.</span>
            </li>
            <li>
              <strong>
                Settle the balance + {pesoMoney(SECURITY_DEPOSIT * (submitState.success.cameras?.length || 1))} deposit
              </strong>
              <span>
                {submitState.success.cameras?.length > 1
                  ? `before the cameras are released — ${pesoMoney(SECURITY_DEPOSIT)} per camera, each refunded when that camera comes back in good condition.`
                  : "before the camera is released. The deposit is refunded when it comes back in good condition."}
              </span>
            </li>
            {submitState.success.delivery ? (
              <li>
                <strong>We book your Lalamove</strong>
                <span>on the day — the rider's live tracking link shows up on your Track page.</span>
              </li>
            ) : (
              <li>
                <strong>Pick it up on your schedule</strong>
                <span>— bring a valid ID that matches your booking.</span>
              </li>
            )}
            <li>
              <strong>Return on time</strong>
              <span>
                {submitState.success.delivery
                  ? "— we'll book the return rider too. Need it collected somewhere else? Change it on your Track page."
                  : "— late returns are charged per the rental terms."}
              </span>
            </li>
          </ol>
          <div className="bk-success__actions float-in" style={{ "--d": "700ms" }}>
            <a
              href={`/track?ref=${encodeURIComponent(submitState.success.responseId)}`}
              className="btn btn--solid"
            >
              Track my booking
            </a>
            {submitState.success.member && (
              <a href="/account" className="btn btn--outline">
                My rewards
              </a>
            )}
            <button type="button" onClick={resetSuccess} className="btn btn--outline">
              Book another
            </button>
            <a href="/" className="btn btn--outline">
              Back to Home
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bk-page">
      <BookingTopBar />
      <PreviewLightbox
        preview={assetPreview}
        onClose={() => setAssetPreview(null)}
      />

      <header className="bk-head">
        <p className="bk-kicker float-in" style={{ "--d": "0ms" }}>
          Booking request
        </p>
        <h1 className="bk-title">
          <span className="hero__word" style={{ "--d": "100ms" }}>
            Book
          </span>{" "}
          <span className="hero__word" style={{ "--d": "220ms" }}>
            a
          </span>{" "}
          <span className="hero__word" style={{ "--d": "340ms" }}>
            Camera
          </span>
        </h1>
        <ul className="bk-facts float-in" style={{ "--d": "480ms" }}>
          <li>20% downpayment reserves your slot</li>
          <li>₱1,000 refundable deposit on release</li>
          <li>Delivery by Lalamove or self pick-up</li>
          <li>₱300 rush fee for same-day only</li>
        </ul>
        <p className="bk-sub bk-sub--small float-in" style={{ "--d": "540ms" }}>
          Already booked? <a href="/track">Track your booking →</a>
        </p>
        <MemberStrip member={member} />
      </header>

      <form onSubmit={handleFormSubmit} className="bk-form float-in" style={{ "--d": "600ms" }}>
        <ol className="bk-steps">
          {STEPS.map((step, index) => (
            <li
              key={step}
              aria-current={index === currentStep ? "step" : undefined}
              className={`bk-step ${index === currentStep ? "is-current" : ""} ${stepComplete[index] ? "is-done" : ""} ${validatedSteps.has(index) && !stepComplete[index] ? "is-incomplete" : ""}`}
            >
              <span className="bk-step__num" aria-hidden="true">
                {stepComplete[index] ? "✓" : index + 1}
              </span>
              <span className="bk-step__label">{step}</span>
            </li>
          ))}
        </ol>

        <div className="bk-panel">
          <h2 className="bk-panel__title">{STEPS[currentStep]}</h2>
          <div className="bk-anim" key={currentStep}>
            {renderStepContent()}
          </div>
          {submitState.error && (
            <div className="bk-error" role="alert">
              ✕ {submitState.error}
            </div>
          )}
        </div>

        <footer className="bk-nav">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0 || submitState.loading}
            className="btn btn--outline"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleStartOver}
            disabled={submitState.loading}
            className="bk-nav__restart"
          >
            ↺ Start Over
          </button>
          {currentStep < STEPS.length - 1 ? (
            <button type="button" onClick={handleNext} className="btn btn--solid">
              Next →
            </button>
          ) : (
            <button type="submit" disabled={submitState.loading || hasProcessingFile} className="btn btn--solid">
              {submitState.loading ? "Submitting…" : "Submit Booking"}
            </button>
          )}
        </footer>
      </form>
    </main>
  );
}
