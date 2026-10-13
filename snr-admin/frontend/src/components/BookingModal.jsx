import { useEffect, useState } from "react";
import { getPricingForDate } from "../data/cameras.js";
import { useCameras, findCamera } from "../hooks/useCameras.js";
import LifecyclePanel from "./LifecyclePanel.jsx";
import { getContractForCamera } from "../data/contracts.js";
import { apiPatchJson, apiDeleteJson } from "../utils/api.js";
import {
  fetchBookingDocuments,
  isPartialBooking,
  primeBookingDocuments,
} from "../utils/bookingDocuments.js";
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

const MODES = ["Pick Up", "Deliver"];
const CAMERA_INCLUSIONS = {
  "DJI Osmo 360": ["128GB SD Card", "3 Batteries", "Camera pouch", "Battery case", "Quick-release mount", "Lens cleaning cloth", "Charger cable", "Silicon protector", "Invisible selfie stick"],
  "DJI OSMO POCKET 3": ["128GB SD Card", "Type-C to Type-C Cable", "Protective Cover", "Mic 2 Transmitter", "Mic 2 Clip Magnet", "Mic 2 Windscreen", "Wrist Strap", 'Handle with 1/4" Thread', "Carrying Bag", "Wide-Angle Lens", "Mini tripod", "Battery Handle"],
  "DJI Osmo Nano": ["128GB SD Card", "Type-C to Type-C Cable", "Magnetic lanyard", "Ball joint adapter mount", "Magnetic Hat clip", "Mini Tripod"],
  "INSTA360 ACE PRO 2": ["128GB SD Card", "Type-C to Type-C Cable", "2 Batteries", "Mini Tripod", "Standard Action Mount", "Wrist Strap", "Mic Cap"],
  "CANON G7X MARK III": ["32GB Memory Card", "Charger", "1 Battery", "Silicone Case", "Camera Bag", "Strap", "SD Card reader"],
  "FUJIFILM X-T100": ["32GB Memory Card", "Charger", "1 Battery", "Kit Lens", "Camera Bag", "Strap", "SD Card reader"],
  "CANON EOS R50": ["32GB Memory Card", "Charger", "1 Battery", "Silicone Case", "Camera Bag", "Strap", "SD Card reader"],
};
const CONTRACT_SUBTERM =
  /^(Mild|Medium|Major|Lens Damage|Screen Damage|Other Damages)/i;
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const hour12 = h % 12 || 12;
  return {
    value,
    label: `${hour12}:${m} ${h >= 12 ? "PM" : "AM"}`,
  };
});

// Entries created by the app carry these sources. Anything else (e.g. legacy
// CSV/MongoDB imports labelled "outdated_csv" or "unknown") is treated as a
// fixed historical record: its rental fee is never auto-recalculated.
const ACTIVE_SOURCES = ["google_form", "manual"];
function isLegacyEntry(b) {
  const s = (b?._source || "").toLowerCase();
  return !!s && !ACTIVE_SOURCES.includes(s);
}

function getDocuments(booking) {
  return DOC_FIELDS.flatMap(({ label, key }) => {
    const ids = booking[key];
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return ids.map((id) => ({ label, id }));
  });
}
function getAddons(b) {
  const a =
    b["Please_choose_your_add-ons"] ||
    b.Please_choose_your_add_ons ||
    b.ADDONS ||
    [];
  return Array.isArray(a) ? a : [];
}
function isDeliveryMode(b) {
  return (b.PREFERRED_MODE || "").trim().toLowerCase().startsWith("deliver");
}
function toAmPm(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function formatDate(iso) {
  if (!iso) return "—";
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatDateTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function peso(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₱${amount.toLocaleString()}` : "—";
}
function firstValue(value) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
function canGenerateUnsignedContract(booking) {
  return /^2026-07-\d{2}$/.test(String(booking?.PICK_UP_DATE || ""));
}
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function getContractData(booking) {
  const savedTerms = Array.isArray(booking.CONTRACT_TERMS_AND_CONDITIONS)
    ? booking.CONTRACT_TERMS_AND_CONDITIONS.filter(Boolean)
    : [];
  const cameraContract = getContractForCamera(
    booking.CONTRACT_CAMERA || booking.PREFERRED_CAMERA,
  );
  const signature = firstValue(booking.RENTER_E_SIGNATURE);
  return {
    unit: booking.CONTRACT_CAMERA || cameraContract.unit,
    terms: savedTerms.length > 0 ? savedTerms : cameraContract.terms,
    signature,
    signedAt: signature
      ? booking.E_SIGNATURE_DATE || booking.Timestamp || null
      : null,
  };
}
function getContractTotalPayable(booking) {
  const savedTotal = Number(booking.TOTAL_PAYABLE_BEFORE_RELEASE);
  if (Number.isFinite(savedTotal) && savedTotal > 0) return savedTotal;

  const rentalFee = Number(booking.RENTAL_FEE);
  const securityDeposit = Number(booking.SECURITY_DEPOSIT ?? 1000);
  return (
    (Number.isFinite(rentalFee) ? rentalFee : 0) +
    (Number.isFinite(securityDeposit) ? securityDeposit : 0)
  );
}
function openPrintableContract(booking) {
  const contract = getContractData(booking);
  const addons = getAddons(booking);
  const signature = /^data:image\//i.test(contract.signature)
    ? `<img class="signature" src="${escapeHtml(contract.signature)}" alt="Renter signature">`
    : "";
  const terms = contract.terms.length
    ? contract.terms
        .map((term) => `<li>${escapeHtml(term)}</li>`)
        .join("")
    : "<li>No contract terms were stored for this booking.</li>";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Contract - ${escapeHtml(booking.responseId)}</title>
<style>
@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#171717;font:12px/1.45 Arial,sans-serif}
.page{max-width:780px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px}
h1{font-size:20px;letter-spacing:.08em;margin:0}h2{font-size:12px;margin:20px 0 6px;border-bottom:1px solid #999;padding-bottom:4px}
p{margin:4px 0}ol{padding-left:20px}li{margin:0 0 7px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}
.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:35px}.sign{text-align:center}.mark{height:58px;display:flex;align-items:end;justify-content:center}
.signature{max-width:190px;max-height:55px}.line{border-top:1px solid #111;padding-top:5px;font-weight:bold}.muted{color:#666;font-size:10px}
button{margin:0 0 16px;padding:8px 14px;background:#111;color:#fff;border:0;font-weight:bold}@media print{button{display:none}}
</style></head><body><div class="page"><button onclick="window.print()">Print / Save as PDF</button>
<div class="head"><div><h1>EQUIPMENT RENTAL AGREEMENT</h1><p><strong>S&amp;R Rentals</strong> · San Ildefonso, Bulacan</p><p>Contact: 0912 016 1865</p></div><div class="muted">Reference<br><strong>${escapeHtml(booking.responseId || "—")}</strong></div></div>
<h2>I. RENTER &amp; RENTAL PERIOD</h2><div class="grid"><p><strong>Renter:</strong> ${escapeHtml(booking.FULL_NAME || "—")}</p><p><strong>Contact:</strong> ${escapeHtml(booking.CONTACT_NUMBER || "—")}</p><p><strong>Pick-up:</strong> ${escapeHtml(formatDate(booking.PICK_UP_DATE))} · ${escapeHtml(toAmPm(booking.PICK_UP_TIME))}</p><p><strong>Return:</strong> ${escapeHtml(formatDate(booking.RETURN_DATE))} · ${escapeHtml(toAmPm(booking.RETURN_TIME))}</p></div>
<p><strong>Address:</strong> ${escapeHtml(booking.COMPLETE_ADDRESS || "—")}</p>
<h2>II. EQUIPMENT &amp; INCLUSIONS</h2><p><strong>Unit:</strong> ${escapeHtml(contract.unit)}</p><p><strong>Add-ons:</strong> ${escapeHtml(addons.join(", ") || "None")}</p>
<h2>III. FEES</h2><div class="grid"><p><strong>Rental Fee:</strong> ${escapeHtml(peso(booking.RENTAL_FEE))}</p><p><strong>Security Deposit:</strong> ${escapeHtml(peso(booking.SECURITY_DEPOSIT ?? 1000))}</p><p><strong>Total Payables:</strong> ${escapeHtml(peso(getContractTotalPayable(booking)))}</p></div>
<h2>IV. TERMS &amp; CONDITIONS</h2><ol>${terms}</ol>
<p><strong>I have read and understood the terms above. I acknowledge receipt of the equipment in good working order.</strong></p>
<div class="signatures"><div class="sign"><div class="mark">${signature}</div><div class="line">${escapeHtml(booking.FULL_NAME || "—")}</div><p>Renter's Signature over Printed Name</p><p class="muted">Date: ${escapeHtml(formatDate(booking.PICK_UP_DATE))}</p></div>
<div class="sign"><div class="mark"></div><div class="line">SHAMEL FATIMA PERONO</div><p>S&amp;R Rentals Representative</p></div></div>
</div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const popup = window.open(url, "_blank");
  if (!popup) URL.revokeObjectURL(url);
  else {
    popup.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
function loadContractImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load contract image."));
    image.src = src;
  });
}
function transparentInkCanvas(image) {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  const sourceContext = source.getContext("2d");
  sourceContext.drawImage(image, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
  const pixels = imageData.data;
  let minX = source.width;
  let minY = source.height;
  let maxX = 0;
  let maxY = 0;
  let foundInk = false;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      0.299 * pixels[index] +
      0.587 * pixels[index + 1] +
      0.114 * pixels[index + 2];
    const alpha =
      luminance <= 95
        ? 255
        : luminance >= 180
          ? 0
          : Math.round((255 * (180 - luminance)) / 85);
    pixels[index + 3] = Math.min(pixels[index + 3], alpha);
    if (pixels[index + 3] > 24) {
      foundInk = true;
      const x = (index / 4) % source.width;
      const y = Math.floor(index / 4 / source.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  sourceContext.putImageData(imageData, 0, 0);
  if (!foundInk) return source;
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  output
    .getContext("2d")
    .drawImage(source, minX, minY, width, height, 0, 0, width, height);
  return output;
}
function safeFileName(value) {
  return String(value || "contract")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "contract";
}
function numberedContractTerms(terms) {
  let mainNumber = 0;
  let subNumber = 0;
  return terms.map((text) => {
    const isSub = CONTRACT_SUBTERM.test(String(text || ""));
    if (isSub) {
      const label = `${String.fromCharCode(97 + subNumber)}.`;
      subNumber += 1;
      return { text, label, isSub: true };
    }
    mainNumber += 1;
    subNumber = 0;
    return { text, label: `${mainNumber}.`, isSub: false };
  });
}
async function downloadContractImage(booking) {
  const contract = getContractData(booking);
  if (!contract.signature && !canGenerateUnsignedContract(booking)) {
    throw new Error("This booking has no saved renter signature.");
  }
  const [renterSignature, rawLogo, rawRepresentativeSignature] = await Promise.all([
    contract.signature ? loadContractImage(contract.signature) : Promise.resolve(null),
    loadContractImage("/logo.png").catch(() => null),
    loadContractImage("/signature.jpg").catch(() => null),
  ]);
  const logo = rawLogo ? transparentInkCanvas(rawLogo) : null;
  const representativeSignature = rawRepresentativeSignature
    ? transparentInkCanvas(rawRepresentativeSignature)
    : null;
  const width = 1240;
  const height = Math.round((width * 297) / 210);
  const margin = 55;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#151515";
  let y = 72;
  const contentWidth = width - margin * 2;

  function wrapped(text, x, startY, maxWidth, lineHeight = 32) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let currentY = startY;
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
      } else line = next;
    });
    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }
  function line(text, bold = false, after = 5) {
    ctx.textAlign = "left";
    ctx.font = `${bold ? "700" : "400"} 25px "Times New Roman", serif`;
    y = wrapped(text, margin, y, contentWidth, 32) + after;
  }
  function section(title) {
    y += 10;
    ctx.font = '700 29px "Times New Roman", serif';
    ctx.textAlign = "left";
    ctx.fillText(title, margin, y);
    y += 36;
  }
  function clause(text, x, startY, maxX, lineHeight, size) {
    const value = String(text || "");
    const match = value.match(/^([^:]{2,80}):\s*(.*)$/);
    const body = match ? match[2] : value;
    let currentY = startY;
    let currentX = x;
    if (match) {
      const prefix = `${match[1]}: `;
      ctx.font = `700 ${size}px "Times New Roman", serif`;
      ctx.fillText(prefix, x, currentY);
      currentX += ctx.measureText(prefix).width;
    }
    ctx.font = `400 ${size}px "Times New Roman", serif`;
    let lineText = "";
    body.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = lineText ? `${lineText} ${word}` : word;
      if (lineText && ctx.measureText(next).width > maxX - currentX) {
        ctx.fillText(lineText, currentX, currentY);
        currentY += lineHeight;
        currentX = x;
        lineText = word;
      } else {
        lineText = next;
      }
    });
    if (lineText) {
      ctx.fillText(lineText, currentX, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }
  function fitImage(image, x, bottomY, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, x + (maxWidth - drawWidth) / 2, bottomY - drawHeight, drawWidth, drawHeight);
  }

  ctx.textAlign = "center";
  ctx.font = '700 39px "Times New Roman", serif';
  ctx.fillText("EQUIPMENT RENTAL AGREEMENT", width / 2, y);
  y += 48;
  if (logo) fitImage(logo, width - margin - 300, y + 96, 300, 150);
  line("Owner: S&R Rentals (San Ildefonso, Bulacan)", true);
  line("Contact: 0912 016 1865", false, 18);

  section("I. RENTAL PERIOD");
  line(`Pick-up Date & Time: ${formatDate(booking.PICK_UP_DATE)} @ ${toAmPm(booking.PICK_UP_TIME)}`);
  line(`Return Date & Time: ${formatDate(booking.RETURN_DATE)} @ ${toAmPm(booking.RETURN_TIME)}`, false, 8);

  section("II. EQUIPMENT & INCLUSIONS (Check all that apply)");
  line(`Unit: ${contract.unit}`);
  line("Condition: [ ] Good/Working   [ ] No Scratches on Lens");
  line("Accessories:", false, 0);
  const inclusions =
    CAMERA_INCLUSIONS[booking.PREFERRED_CAMERA] ||
    CAMERA_INCLUSIONS[contract.unit] ||
    [];
  const inclusionHalf = Math.ceil(inclusions.length / 2);
  const inclusionColumns = [margin + 8, width / 2 + 5];
  const inclusionRowHeight = 31;
  ctx.font = '400 23px "Times New Roman", serif';
  inclusions.forEach((item, index) => {
    const column = index < inclusionHalf ? 0 : 1;
    const row = column === 0 ? index : index - inclusionHalf;
    ctx.fillText(
      `•  ${item}`,
      inclusionColumns[column],
      y + row * inclusionRowHeight,
    );
  });
  y += inclusionHalf * inclusionRowHeight + 4;
  line(
    `Others: ${getAddons(booking).join(", ") || "________________________________________"}`,
    false,
    8,
  );

  section("III. FEES");
  line(`Rental Fee: ${peso(booking.RENTAL_FEE)}`);
  line(`Security Deposit: ${peso(booking.SECURITY_DEPOSIT ?? 1000)} (Refundable upon safe return)`);
  line(`Total Payables: ${peso(getContractTotalPayable(booking))}`, false, 8);

  section("IV. TERMS & CONDITIONS");
  numberedContractTerms(contract.terms).forEach((item) => {
    const labelX = item.isSub ? margin + 30 : margin;
    const textX = item.isSub ? margin + 64 : margin + 34;
    ctx.font = `${item.isSub ? "400" : "700"} 23px "Times New Roman", serif`;
    ctx.fillText(item.label, labelX, y);
    y = clause(item.text, textX, y, width - margin, 28, 23) + 7;
  });
  y += 6;
  ctx.font = '700 24px "Times New Roman", serif';
  y = wrapped(
    "I have read and understood the terms above. I acknowledge receipt of the equipment in good working order.",
    margin,
    y,
    contentWidth,
    31,
  ) + 24;

  const gap = 70;
  const columnWidth = (contentWidth - gap) / 2;
  const columns = [margin, margin + columnWidth + gap];
  const signatureLineY = Math.min(y + 96, height - 140);
  if (renterSignature) {
    fitImage(renterSignature, columns[0], signatureLineY - 3, columnWidth, 88);
  }
  if (representativeSignature) {
    fitImage(representativeSignature, columns[1], signatureLineY - 3, columnWidth, 88);
  } else {
    ctx.textAlign = "center";
    ctx.font = 'italic 34px "Times New Roman", serif';
    ctx.fillText("Shamel Fatima Perono", columns[1] + columnWidth / 2, signatureLineY - 14);
  }
  ctx.strokeStyle = "#151515";
  columns.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, signatureLineY);
    ctx.lineTo(x + columnWidth, signatureLineY);
    ctx.stroke();
  });
  const names = [(booking.FULL_NAME || "—").toUpperCase(), "SHAMEL FATIMA PERONO"];
  const roles = ["Renter's Signature over Printed Name", "S&R Rentals Rep. Signature over Printed Name"];
  ctx.textAlign = "center";
  columns.forEach((x, index) => {
    const center = x + columnWidth / 2;
    ctx.font = '700 23px "Times New Roman", serif';
    ctx.fillText(names[index], center, signatureLineY + 28);
    ctx.font = '400 18px "Times New Roman", serif';
    ctx.fillText(roles[index], center, signatureLineY + 51);
    const dateLabel = `Date: ${formatDate(booking.PICK_UP_DATE)}`;
    ctx.fillText(dateLabel, center, signatureLineY + 73);
  });

  const link = document.createElement("a");
  link.download = `sr-rentals-${safeFileName(contract.unit)}-${safeFileName(booking.FULL_NAME)}-contract.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
function countDays(pickUp, ret) {
  if (!pickUp || !ret) return 0;
  const diff = Math.round(
    (new Date(ret + "T00:00:00") - new Date(pickUp + "T00:00:00")) / 86400000,
  );
  return diff > 0 ? diff : 0;
}
function getAutoRate(pricing, days) {
  if (!pricing || !days) return null;
  const tier = pricing.find(
    (t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays),
  );
  return tier ? tier.pricePerDay : null;
}

/** Compute fee from current form state. Returns { fee, halfDayAmount } */
function computeAutoFee(form, cameras) {
  const days = countDays(form.PICK_UP_DATE, form.RETURN_DATE);
  if (!days) return { fee: null, halfDayAmount: null };
  const cam = findCamera(cameras, form.PREFERRED_CAMERA);
  if (!cam) return { fee: null, halfDayAmount: null };
  // Uses the tier set in effect on the rental's own PICK_UP_DATE, so editing
  // an old booking recomputes at the rate it was booked under, not today's.
  const rate = getAutoRate(getPricingForDate(cam, form.PICK_UP_DATE), days);
  if (!rate) return { fee: null, halfDayAmount: null };

  const halfDayAmount = Math.round(rate * 0.5);
  const effectiveDays =
    days + (form.HALF_DAY_LATE ? 0.5 : 0) - (form.HALF_DAY_EARLY ? 0.5 : 0);
  const cameraFee = rate * effectiveDays;
  const addOnFee = (form.addons || []).reduce((sum, name) => {
    const a = cam.addOns?.find((x) => x.name === name);
    return sum + (a ? a.pricePerDay * effectiveDays : 0);
  }, 0);

  return { fee: Math.round(cameraFee + addOnFee), halfDayAmount };
}

function initForm(b) {
  return {
    FULL_NAME: b.FULL_NAME || "",
    CONTACT_NUMBER: b.CONTACT_NUMBER || "",
    COMPLETE_ADDRESS: b.COMPLETE_ADDRESS || "",
    SPECIFIC_DESTINATION: b.SPECIFIC_DESTINATION || "",
    PICK_UP_DATE: b.PICK_UP_DATE || "",
    PICK_UP_TIME: b.PICK_UP_TIME || "",
    RETURN_DATE: b.RETURN_DATE || "",
    RETURN_TIME: b.RETURN_TIME || "",
    PREFERRED_MODE: b.PREFERRED_MODE || "",
    PREFERRED_CAMERA: b.PREFERRED_CAMERA || "",
    addons: getAddons(b),
    RENTAL_FEE: b.RENTAL_FEE != null ? String(b.RENTAL_FEE) : "",
    HALF_DAY_LATE: b.HALF_DAY_LATE || false,
    HALF_DAY_EARLY: b.HALF_DAY_EARLY || false,
    NOTES: b.NOTES || "",
    DOWNPAYMENT_PAID:
      b.DOWNPAYMENT_PAID != null ? String(b.DOWNPAYMENT_PAID) : "",
  };
}

export default function BookingModal({
  booking,
  onClose,
  onSaved,
  onDeleted,
  onChanged,
}) {
  const [mode, setMode] = useState("view");
  const [savedBooking, setSavedBooking] = useState(booking);
  const [hasSaved, setHasSaved] = useState(false);
  const [form, setForm] = useState(() => initForm(booking));
  const legacy = isLegacyEntry(savedBooking);
  const [manualFee, setManualFee] = useState(() => isLegacyEntry(booking));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [docsLoading, setDocsLoading] = useState(() =>
    isPartialBooking(booking),
  );
  const [docsError, setDocsError] = useState(null);
  const { cameras } = useCameras();
  const { fee: autoFee, halfDayAmount } = computeAutoFee(form, cameras);

  // Bookings arriving from a list endpoint have no document columns (see
  // utils/bookingDocuments.js) — pull them for this one booking. Only the
  // document fields are merged, so an in-flight save is never clobbered.
  useEffect(() => {
    if (!isPartialBooking(booking)) {
      primeBookingDocuments(booking);
      setDocsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDocsLoading(true);
    setDocsError(null);
    fetchBookingDocuments(booking.responseId)
      .then((docs) => {
        if (cancelled) return;
        setSavedBooking((prev) => ({ ...prev, ...docs, _partial: false }));
      })
      .catch((e) => {
        if (!cancelled) setDocsError(e.message || "Unable to load documents.");
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking]);

  function handleClose() {
    if (hasSaved) onSaved();
    else onClose();
  }

  // Status changes (approve, release, return, complete, cancel). The server
  // validates the step and appends it to the booking's timeline; errors are
  // shown inside the panel, so this just rethrows.
  async function handleLifecycle(patch) {
    const result = await apiPatchJson(
      `/api/bookings/${encodeURIComponent(booking.responseId)}`,
      patch,
    );
    if (result.booking) {
      // Keep documents already loaded for this booking.
      setSavedBooking((prev) => ({ ...prev, ...result.booking }));
      setForm(initForm(result.booking));
    }
    setHasSaved(true);
    onChanged?.();
  }

  function handleField(e) {
    const { name, value, type, checked } = e.target;
    if (name === "PREFERRED_CAMERA") {
      const newCam = findCamera(cameras, value);
      const validNames = (newCam?.addOns ?? []).map((a) => a.name);
      setForm((f) => ({
        ...f,
        PREFERRED_CAMERA: value,
        addons: f.addons.filter((a) => validNames.includes(a)),
      }));
      return;
    }
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  function handleAddonToggle(addonName) {
    setForm((f) => ({
      ...f,
      addons: f.addons.includes(addonName)
        ? f.addons.filter((a) => a !== addonName)
        : [...f.addons, addonName],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const { addons, RENTAL_FEE, DOWNPAYMENT_PAID, ...rest } = form;
      // Legacy entries are never auto-calculated — always keep the entered fee.
      const feeToSave =
        manualFee || legacy
          ? RENTAL_FEE !== ""
            ? Number(RENTAL_FEE)
            : null
          : autoFee;
      const dpToSave =
        DOWNPAYMENT_PAID !== "" ? Number(DOWNPAYMENT_PAID) : null;
      const result = await apiPatchJson(
        `/api/bookings/${encodeURIComponent(booking.responseId)}`,
        {
          ...rest,
          "Please_choose_your_add-ons": addons,
          RENTAL_FEE: feeToSave,
          DOWNPAYMENT_PAID: dpToSave,
        },
      );
      const updated = result.booking ?? savedBooking;
      setSavedBooking(updated);
      setForm(initForm(updated));
      setHasSaved(true);
      setMode("view");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiDeleteJson(
        `/api/bookings/${encodeURIComponent(booking.responseId)}`,
      );
      onDeleted();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  }

  return (
    <div
      className="ui-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="ui-modal max-w-lg">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[rgba(58,58,58,0.2)] px-5 py-4">
          <div>
            <div className="text-lg font-bold text-[color:var(--color-black)]">
              {mode === "edit"
                ? "Edit Reservation"
                : savedBooking.FACEBOOK_ACCOUNT_NAME ||
                  savedBooking.FULL_NAME ||
                  "—"}
            </div>
            {mode === "view" && (
              <div className="mt-0.5 text-sm text-[color:var(--color-dark-gray)]">
                {savedBooking.PREFERRED_CAMERA || "—"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="ml-4 p-1 text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === "view" && (
            <ViewBody
              booking={savedBooking}
              onLifecycle={handleLifecycle}
              cameras={cameras}
              docsLoading={docsLoading}
              docsError={docsError}
            />
          )}
          {mode === "edit" && (
            <EditForm
              form={form}
              onChange={handleField}
              onAddonToggle={handleAddonToggle}
              manualFee={manualFee}
              onManualFeeToggle={setManualFee}
              autoFee={autoFee}
              halfDayAmount={halfDayAmount}
              legacy={legacy}
            />
          )}
          {mode === "confirm-delete" && (
            <p className="text-sm text-[color:var(--color-ink)]">
              Are you sure you want to delete the reservation for{" "}
              <span className="font-bold text-[color:var(--color-black)]">
                {booking.FACEBOOK_ACCOUNT_NAME || booking.FULL_NAME}
              </span>
              ? This cannot be undone.
            </p>
          )}
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-[rgba(58,58,58,0.2)] px-5 py-3">
          {mode === "view" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("confirm-delete");
                }}
                className="text-xs text-rose-600 hover:text-rose-500"
              >
                Delete
              </button>
              <div className="ml-auto flex items-center gap-3">
                {hasSaved && (
                  <span className="font-mono text-xs text-green-600">
                    Saved ✓
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode("edit");
                  }}
                  className="ui-btn ui-btn--sm"
                >
                  Edit
                </button>
              </div>
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("view");
                }}
                className="text-xs text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="ui-btn ui-btn--solid"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
          {mode === "confirm-delete" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("view");
                }}
                className="text-xs text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="border border-rose-700 px-4 py-1.5 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

function ViewBody({
  booking,
  onLifecycle,
  cameras,
  docsLoading,
  docsError,
}) {
  const [lightbox, setLightbox] = useState(null);
  const [refCopied, setRefCopied] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [contractError, setContractError] = useState("");
  const addons = getAddons(booking);
  const delivery = isDeliveryMode(booking);
  const docs = getDocuments(booking);
  const contract = getContractData(booking);
  const hasContract =
    contract.terms.length > 0 || Boolean(contract.signature) || Boolean(booking.CONTRACT_CAMERA);
  // While the documents are still loading the signature is unknown, so the
  // contract isn't offered yet — it would render without the renter's mark.
  const canGenerateContract =
    !docsLoading && (hasContract || canGenerateUnsignedContract(booking));

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(booking.responseId || "");
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the code is still visible to copy manually */
    }
  }

  return (
    <>
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
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <span className="ui-kicker">
              Reference Code
            </span>
            {booking.REPEAT_RENTER && (
              <span className="bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                Repeat renter
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <code className="ui-surface min-w-0 flex-1 truncate bg-[rgba(255,255,255,0.7)] px-2.5 py-1.5 font-mono text-xs text-[color:var(--color-ink)]">
              {booking.responseId || "—"}
            </code>
            <button
              type="button"
              onClick={copyReference}
              className="ui-btn ui-btn--sm shrink-0"
            >
              {refCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          {booking.REPEAT_RENTER && booking.REPEAT_REF && (
            <p className="mt-1 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              IDs on file under previous booking: {booking.REPEAT_REF}
            </p>
          )}
        </section>

        <section>
          <div className="ui-kicker mb-2">
            Schedule
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="ui-chip ui-chip--solid">
                {delivery ? "DELIVERY" : "PICKUP"}
              </span>
              <span className="text-sm text-[color:var(--color-ink)]">
                {formatDate(booking.PICK_UP_DATE)} ·{" "}
                {toAmPm(booking.PICK_UP_TIME)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="ui-chip ui-chip--solid">
                RETURN
              </span>
              <span className="text-sm text-[color:var(--color-ink)]">
                {formatDate(booking.RETURN_DATE)} ·{" "}
                {toAmPm(booking.RETURN_TIME)}
              </span>
            </div>
          </div>
        </section>

        <LifecyclePanel booking={booking} cameras={cameras} onPatch={onLifecycle} />

        <section>
          <div className="ui-kicker mb-2">
            Contact
          </div>
          <div className="space-y-1 text-sm text-[color:var(--color-ink)]">
            <div>
              {booking.FACEBOOK_ACCOUNT_NAME || booking.FULL_NAME || "—"}
            </div>
            <div>{booking.CONTACT_NUMBER || "—"}</div>
            {booking.FACEBOOK_ACCOUNT_NAME && booking.FULL_NAME && (
              <div className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                {booking.FULL_NAME}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="ui-kicker mb-2">
            Location
          </div>
          <div className="space-y-0.5 text-sm text-[color:var(--color-ink)]">
            <div>{booking.COMPLETE_ADDRESS || "—"}</div>
            {booking.SPECIFIC_DESTINATION && (
              <div className="text-[color:var(--color-dark-gray)]">
                Destination: {booking.SPECIFIC_DESTINATION}
              </div>
            )}
            {booking.TYPE_OF_TRIP && (
              <div className="text-[color:var(--color-dark-gray)]">
                {booking.TYPE_OF_TRIP}
              </div>
            )}
          </div>
        </section>

        {addons.length > 0 && (
          <section>
            <div className="ui-kicker mb-2">
              Add-ons
            </div>
            <div className="flex flex-wrap gap-2">
              {addons.map((a, i) => (
                <span
                  key={i}
                  className="ui-chip"
                >
                  {a}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="ui-kicker mb-2">
            Financials
          </div>
          <div className="space-y-1 text-sm text-[color:var(--color-ink)]">
            <div>
              Rental Fee:{" "}
              {booking.RENTAL_FEE != null ? (
                <span className="font-semibold">
                  ₱{Number(booking.RENTAL_FEE).toLocaleString()}
                </span>
              ) : (
                <span className="text-[color:var(--color-dark-gray)]">
                  not set
                </span>
              )}
            </div>
            {booking.RENTAL_FEE != null &&
              (() => {
                const fee = Number(booking.RENTAL_FEE);
                const dpActual =
                  booking.DOWNPAYMENT_PAID != null
                    ? Number(booking.DOWNPAYMENT_PAID)
                    : null;
                const dpEst = Math.ceil(fee * 0.2);
                const dp = dpActual ?? dpEst;
                const balance = fee - dp;
                return (
                  <div className="ui-surface mt-1">
                    <div className="flex justify-between border-b-2 border-[rgba(58,58,58,0.2)] px-3 py-1.5">
                      <span className="text-[color:var(--color-dark-gray)]">
                        Rental Fee
                      </span>
                      <span className="font-semibold">
                        ₱{fee.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between border-b-2 border-[rgba(58,58,58,0.2)] px-3 py-1.5">
                      <span className="text-[color:var(--color-dark-gray)]">
                        Downpayment
                        {dpActual == null ? (
                          <span className="ml-1 text-[10px] text-[color:var(--color-dark-gray)]">
                            (est. 20%)
                          </span>
                        ) : null}
                      </span>
                      <span className="font-semibold">
                        ₱{dp.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5">
                      <span className="font-bold text-[color:var(--color-ink)]">
                        Balance
                      </span>
                      <span
                        className={`font-bold ${balance <= 0 ? "text-green-600" : "text-[color:var(--color-black)]"}`}
                      >
                        {balance <= 0
                          ? "Fully paid"
                          : `₱${balance.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                );
              })()}
            {booking.HALF_DAY_LATE && (
              <div className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                +0.5 day — late return
              </div>
            )}
            {booking.HALF_DAY_EARLY && (
              <div className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                −0.5 day — early return
              </div>
            )}
            {booking.NOTES && (
              <div className="ui-surface mt-1 px-2.5 py-2 text-xs text-[color:var(--color-dark-gray)]">
                {booking.NOTES}
              </div>
            )}
          </div>
        </section>

        {(docsLoading || docsError) && (
          <section>
            <div className="ui-kicker mb-2">
              Documents
            </div>
            {docsError ? (
              <p className="border border-rose-300 px-3 py-3 text-xs text-rose-600">
                {docsError}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="ui-skeleton h-24"
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {!docsLoading && !docsError && docs.length > 0 && (
          <section>
            <div className="ui-kicker mb-2">
              Documents
            </div>
            <div className="grid grid-cols-2 gap-3">
              {docs.map(({ label, id }, index) => (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  onClick={() => setLightbox({ label, id })}
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
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="ui-kicker">
              Signed Rental Contract
            </div>
            {canGenerateContract && (
              <button
                type="button"
                onClick={async () => {
                  setContractError("");
                  try {
                    await downloadContractImage(booking);
                  } catch (error) {
                    setContractError(error.message || "Unable to save contract image.");
                  }
                }}
                className="ui-btn ui-btn--sm tracking-widest text-[color:var(--color-ink)] hover:bg-[rgba(255,255,255,0.6)]"
              >
                Save Contract Image
              </button>
            )}
          </div>
          {docsLoading ? (
            <div className="ui-skeleton h-12" />
          ) : !hasContract ? (
            <p className="border border-dashed border-[color:var(--color-border)] px-3 py-3 text-xs font-medium text-[color:var(--color-dark-gray)]">
              No signed contract was stored for this booking.
            </p>
          ) : (
            <div className="ui-card bg-[rgba(255,255,255,0.72)] text-[color:var(--color-black)]">
              <button
                type="button"
                onClick={() => setContractOpen((open) => !open)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span>
                  <strong className="block text-xs">{contract.unit}</strong>
                  <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                    {contract.signature ? "Signed" : "Contract saved"}
                    {formatDateTime(contract.signedAt)
                      ? ` · ${formatDateTime(contract.signedAt)}`
                      : ""}
                  </span>
                </span>
                <span className="font-mono text-xs">{contractOpen ? "−" : "+"}</span>
              </button>
              {contractOpen && (
                <div className="border-t-2 border-[rgba(58,58,58,0.2)] px-3 py-4">
                  <h3 className="text-center text-sm font-black tracking-wider">
                    EQUIPMENT RENTAL AGREEMENT
                  </h3>
                  <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <p><strong>Renter:</strong> {booking.FULL_NAME || "—"}</p>
                    <p><strong>Contact:</strong> {booking.CONTACT_NUMBER || "—"}</p>
                    <p><strong>Pick-up:</strong> {formatDate(booking.PICK_UP_DATE)} · {toAmPm(booking.PICK_UP_TIME)}</p>
                    <p><strong>Return:</strong> {formatDate(booking.RETURN_DATE)} · {toAmPm(booking.RETURN_TIME)}</p>
                    <p><strong>Rental Fee:</strong> {peso(booking.RENTAL_FEE)}</p>
                    <p><strong>Total Payables:</strong> {peso(getContractTotalPayable(booking))}</p>
                  </div>
                  <h4 className="mt-4 border-b-2 border-[rgba(58,58,58,0.2)] pb-1 text-[10px] font-bold uppercase tracking-widest">
                    Terms &amp; Conditions
                  </h4>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 text-[11px] leading-relaxed">
                    {contract.terms.map((term, index) => (
                      <li key={`${index}-${term}`}>{term}</li>
                    ))}
                  </ol>
                  <div className="mt-6 grid grid-cols-2 gap-6 text-center text-[10px]">
                    <div>
                      <div className="flex h-14 items-end justify-center">
                        {contract.signature && (
                          <img
                            src={contract.signature}
                            alt="Renter signature"
                            className="max-h-14 max-w-full object-contain"
                          />
                        )}
                      </div>
                      <div className="border-t-2 border-[color:var(--color-ink)] pt-1 font-bold">
                        {booking.FULL_NAME || "—"}
                      </div>
                      <p>Renter</p>
                    </div>
                    <div>
                      <div className="flex h-14 items-end justify-center">
                        <img
                          src="/signature.jpg"
                          alt="S&R Rentals representative signature"
                          className="max-h-14 max-w-full object-contain"
                        />
                      </div>
                      <div className="border-t-2 border-[color:var(--color-ink)] pt-1 font-bold">
                        SHAMEL FATIMA PERONO
                      </div>
                      <p>S&amp;R Rentals Representative</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {contractError && (
            <p className="mt-2 text-xs font-semibold text-rose-600">
              {contractError}
            </p>
          )}
        </section>

        {formatDateTime(booking._lastUpdatedAt) && (
          <div className="border-t border-[color:var(--color-border)] pt-3">
            <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
              Last edited: {formatDateTime(booking._lastUpdatedAt)}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  form,
  onChange,
  onAddonToggle,
  manualFee,
  onManualFeeToggle,
  autoFee,
  halfDayAmount,
  legacy,
}) {
  const { cameras } = useCameras();
  const selectedCamera = findCamera(cameras, form.PREFERRED_CAMERA);
  const availableAddOns = selectedCamera?.addOns ?? [];

  return (
    <div className="space-y-4">
      {legacy && (
        <div className="border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-700">
          ⚠ Legacy entry — rental fee is fixed and will not be auto-calculated.
          Edit the amount manually if needed.
        </div>
      )}
      <Field
        label="Full Name"
        name="FULL_NAME"
        value={form.FULL_NAME}
        onChange={onChange}
      />
      <Field
        label="Contact Number"
        name="CONTACT_NUMBER"
        value={form.CONTACT_NUMBER}
        onChange={onChange}
      />
      <Field
        label="Address"
        name="COMPLETE_ADDRESS"
        value={form.COMPLETE_ADDRESS}
        onChange={onChange}
      />
      <Field
        label="Destination"
        name="SPECIFIC_DESTINATION"
        value={form.SPECIFIC_DESTINATION}
        onChange={onChange}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Pickup Date"
          name="PICK_UP_DATE"
          type="date"
          value={form.PICK_UP_DATE}
          onChange={onChange}
        />
        <TimeSelect
          label="Pickup Time"
          name="PICK_UP_TIME"
          value={form.PICK_UP_TIME}
          onChange={onChange}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Return Date"
          name="RETURN_DATE"
          type="date"
          value={form.RETURN_DATE}
          onChange={onChange}
        />
        <TimeSelect
          label="Return Time"
          name="RETURN_TIME"
          value={form.RETURN_TIME}
          onChange={onChange}
        />
      </div>

      <div>
        <label className="ui-label">
          Mode
        </label>
        <select
          name="PREFERRED_MODE"
          value={form.PREFERRED_MODE}
          onChange={onChange}
          className="ui-input"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="ui-label">
          Camera
        </label>
        <select
          name="PREFERRED_CAMERA"
          value={form.PREFERRED_CAMERA}
          onChange={onChange}
          className="ui-input"
        >
          <option value="">— select —</option>
          {cameras.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name.toUpperCase()}
              {c.active === false ? " (hidden)" : ""}
            </option>
          ))}
          {/* Keep a booking's camera selectable even if it was since removed
              from the catalogue, so editing it doesn't silently change it. */}
          {form.PREFERRED_CAMERA &&
            !cameras.some((c) => c.name === form.PREFERRED_CAMERA) && (
            <option value={form.PREFERRED_CAMERA}>
              {form.PREFERRED_CAMERA.toUpperCase()}
              {selectedCamera ? "" : " (not in catalogue)"}
            </option>
          )}
        </select>
      </div>

      <div>
        <label className="mb-2 block ui-kicker">
          Add-ons
        </label>
        {availableAddOns.length === 0 ? (
          <p className="text-xs font-medium text-[color:var(--color-dark-gray)]">
            {form.PREFERRED_CAMERA
              ? "No add-ons for this camera."
              : "Select a camera first."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {availableAddOns.map((addon) => (
              <label
                key={addon.name}
                className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5 hover:bg-[rgba(255,255,255,0.6)]"
              >
                <input
                  type="checkbox"
                  checked={form.addons.includes(addon.name)}
                  onChange={() => onAddonToggle(addon.name)}
                  className="accent-[color:var(--color-ink)]"
                />
                <span className="text-sm text-[color:var(--color-ink)]">
                  {addon.name}
                </span>
                <span className="ml-auto font-mono text-xs text-[color:var(--color-dark-gray)]">
                  +₱{addon.pricePerDay}/day
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Financials */}
      <div className="space-y-3 border-t-2 border-[rgba(58,58,58,0.2)] pt-4">
        <div className="ui-kicker">
          Financials
        </div>

        {/* Half-day adjustments */}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 font-mono text-sm text-[color:var(--color-ink)]">
            <input
              type="checkbox"
              name="HALF_DAY_LATE"
              checked={form.HALF_DAY_LATE}
              onChange={onChange}
              className="accent-[color:var(--color-ink)]"
            />
            Add half day for late return
            {form.HALF_DAY_LATE && halfDayAmount != null && !manualFee && (
              <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                +₱{halfDayAmount.toLocaleString()}
              </span>
            )}
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-sm text-[color:var(--color-ink)]">
            <input
              type="checkbox"
              name="HALF_DAY_EARLY"
              checked={form.HALF_DAY_EARLY}
              onChange={onChange}
              className="accent-[color:var(--color-ink)]"
            />
            Subtract half day for early return
            {form.HALF_DAY_EARLY && halfDayAmount != null && !manualFee && (
              <span className="text-xs font-medium text-[color:var(--color-dark-gray)]">
                −₱{halfDayAmount.toLocaleString()}
              </span>
            )}
          </label>
        </div>

        {/* Fee display or manual input */}
        {manualFee ? (
          <Field
            label="Rental Fee (₱)"
            name="RENTAL_FEE"
            type="number"
            value={form.RENTAL_FEE}
            onChange={onChange}
            placeholder="Enter amount"
          />
        ) : (
          <div className="ui-card px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
              Rental Fee
            </div>
            <div className="mt-1 font-mono text-base font-bold text-[color:var(--color-black)]">
              {autoFee != null ? (
                `₱${autoFee.toLocaleString()}`
              ) : (
                <span className="font-normal text-[color:var(--color-dark-gray)]">
                  —
                </span>
              )}
            </div>
          </div>
        )}

        {/* Manual override toggle */}
        <label className="flex cursor-pointer items-center gap-2 font-mono text-sm text-[color:var(--color-ink)]">
          <input
            type="checkbox"
            checked={manualFee}
            onChange={(e) => onManualFeeToggle(e.target.checked)}
            className="accent-[color:var(--color-ink)]"
          />
          Override rental fee manually
        </label>

        <Field
          label="Downpayment Paid (₱)"
          name="DOWNPAYMENT_PAID"
          type="number"
          value={form.DOWNPAYMENT_PAID}
          onChange={onChange}
          placeholder="Actual amount paid by customer"
        />

        {/* Notes */}
        <div>
          <label className="ui-label">
            Notes
          </label>
          <textarea
            name="NOTES"
            value={form.NOTES}
            onChange={onChange}
            placeholder="e.g. given discount, promo rate…"
            rows={3}
            className="ui-input w-full text-sm text-[color:var(--color-black)] placeholder-[color:var(--color-dark-gray)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, name, value, onChange, type = "text", placeholder }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <label className="ui-label">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full max-ui-input w-full text-sm text-[color:var(--color-black)] placeholder-[color:var(--color-dark-gray)] focus:outline-none"
      />
    </div>
  );
}

function TimeSelect({ label, name, value, onChange }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <label className="ui-label">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full max-ui-input"
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
