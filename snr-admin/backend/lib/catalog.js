// Camera catalogue rules — shared by the Firestore store, the catalog API, fee
// calculation and public availability. No database access in here.
//
// A camera:
//   {
//     id, name, tag, active, sortOrder,
//     units, unitHistory:  [{ before: "YYYY-MM-DD", units }],
//     pricing,             [{ minDays, maxDays|null, pricePerDay }]
//     priceHistory:        [{ before: "YYYY-MM-DD", pricing }],
//     addOns:              [{ name, pricePerDay }],
//     serials:             [{ serial, active, note }]   one per physical unit
//     inclusions:          [string],
//     image, detailImage, goodFor, perfectFor   (public-site display)
//   }
//
// History arrays are kept OLDEST cut-off first. getPricingForDate walks them in
// order and returns the first entry whose `before` is after the date, so the
// order is what makes the lookup correct. They are written only by the server
// (applyCameraUpdate) — an edit never overwrites the past, it moves the old
// value into history with the date the change took effect. See
// docs/ENGINEERING-NOTES.md §2 for why flattening history restates revenue.
//
// Serial numbers: when a camera lists its physical units, `units` is the
// number of ACTIVE serials (a retired unit stays listed so its rental history
// still resolves). Every release must name the serial handed over, so a
// damaged unit can be traced to its last renter. A camera with no serials
// keeps a plain `units` count (the original seven were seeded that way).

class CatalogValidationError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new CatalogValidationError(message);
}

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sameName(a, b) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}

function findCamera(catalog, name) {
  return (catalog || []).find((c) => sameName(c.name, name)) || null;
}

/** Pricing tiers in effect on a PICK_UP_DATE. Same contract as the frontend copy. */
function getPricingForDate(camera, pickUpDateIso) {
  if (!camera) return null;
  if (pickUpDateIso && Array.isArray(camera.priceHistory)) {
    for (const entry of camera.priceHistory) {
      if (pickUpDateIso < entry.before) return entry.pricing;
    }
  }
  return camera.pricing;
}

/** Units owned on a date. Same contract as the frontend copy. */
function getUnitsForDate(camera, dateIso) {
  if (!camera) return 0;
  if (dateIso && Array.isArray(camera.unitHistory)) {
    for (const entry of camera.unitHistory) {
      if (dateIso < entry.before) return Number(entry.units) || 0;
    }
  }
  return Number(camera.units) || 0;
}

/** Fee for a booking: day rate in force on its pick-up date × days, plus add-ons. */
function calcRentalFee(camera, pickUpDate, returnDate, addonNames = []) {
  if (!camera) return null;
  const start = new Date(pickUpDate);
  const end = new Date(returnDate);
  if (isNaN(start) || isNaN(end)) return null;
  const days = Math.max(Math.round((end - start) / 86400000), 1);

  const pricing = getPricingForDate(camera, pickUpDate) || [];
  const tier = pricing.find(
    (t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays),
  );
  if (!tier) return null;

  let fee = tier.pricePerDay * days;
  for (const addonName of addonNames) {
    const a = (camera.addOns || []).find((x) => sameName(x.name, addonName));
    if (a) fee += a.pricePerDay * days;
  }
  return fee;
}

// ── Validation ───────────────────────────────────────────────────────────────

function toInt(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) fail(`${label} must be a whole number of at least ${min}.`);
  return n;
}

function toPrice(value, label) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n) || n < 0) {
    fail(`${label} must be a price of 0 or more.`);
  }
  return n;
}

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Tiers must cover every rental length exactly once: start at 1 day, each tier
 * starts the day after the previous one ends, and the last is open-ended.
 * Otherwise some durations would have no price and the fee would silently be
 * null (which Analytics then counts as ₱0).
 */
function sanitizePricing(raw, label = "Pricing") {
  if (!Array.isArray(raw) || raw.length === 0) fail(`${label}: add at least one price tier.`);
  const tiers = raw
    .map((t, i) => {
      const minDays = toInt(t?.minDays, `${label} tier ${i + 1} "from" days`, { min: 1 });
      const hasMax = !(t?.maxDays === null || t?.maxDays === undefined || t?.maxDays === "");
      const maxDays = hasMax ? toInt(t.maxDays, `${label} tier ${i + 1} "to" days`, { min: 1 }) : null;
      if (maxDays !== null && maxDays < minDays) {
        fail(`${label} tier ${i + 1}: "to" days must not be less than "from" days.`);
      }
      return { minDays, maxDays, pricePerDay: toPrice(t?.pricePerDay, `${label} tier ${i + 1} price`) };
    })
    .sort((a, b) => a.minDays - b.minDays);

  if (tiers[0].minDays !== 1) fail(`${label}: the first tier must start at 1 day.`);
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    if (prev.maxDays === null) fail(`${label}: only the last tier can be open-ended ("and up").`);
    if (tiers[i].minDays !== prev.maxDays + 1) {
      fail(`${label}: tier ${i + 1} must start at ${prev.maxDays + 1} days (right after tier ${i}).`);
    }
  }
  if (tiers[tiers.length - 1].maxDays !== null) {
    fail(`${label}: the last tier must be open-ended ("and up") so long rentals have a price.`);
  }
  return tiers;
}

function sanitizeAddOns(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail("Add-ons must be a list.");
  const seen = new Set();
  return raw
    .filter((a) => cleanText(a?.name))
    .map((a) => {
      const name = cleanText(a.name, 120);
      const key = name.toUpperCase();
      if (seen.has(key)) fail(`Add-on "${name}" is listed twice.`);
      seen.add(key);
      return { name, pricePerDay: toPrice(a.pricePerDay, `Add-on "${name}" price`) };
    });
}

function sanitizeSerials(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail("Serial numbers must be a list.");
  const seen = new Set();
  return raw
    .filter((u) => cleanText(u?.serial))
    .map((u) => {
      const serial = cleanText(u.serial, 60);
      const key = serial.toUpperCase();
      if (seen.has(key)) fail(`Serial "${serial}" is listed twice.`);
      seen.add(key);
      return { serial, active: u.active === undefined ? true : Boolean(u.active), note: cleanText(u.note, 200) };
    });
}

function sanitizeInclusions(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail("Inclusions must be a list.");
  return raw.map((s) => cleanText(s, 200)).filter(Boolean);
}

function sanitizeHistory(raw, kind) {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) fail(`${kind} must be a list.`);
  const entries = raw.map((e) => {
    if (!ISO_DATE.test(String(e?.before || ""))) fail(`${kind}: every entry needs a YYYY-MM-DD "before" date.`);
    return kind === "priceHistory"
      ? { before: e.before, pricing: sanitizePricing(e.pricing, `Price history (before ${e.before})`) }
      : { before: e.before, units: toInt(e.units, `Unit history (before ${e.before})`) };
  });
  return entries.sort((a, b) => (a.before < b.before ? -1 : a.before > b.before ? 1 : 0));
}

/**
 * Normalise a camera from a request body. History is only accepted when
 * `allowHistory` (seeding); edits from the admin page never send it — the
 * server derives it in applyCameraUpdate.
 */
function hasSerials(input) {
  return Array.isArray(input?.serials) && input.serials.some((u) => cleanText(u?.serial));
}

function activeSerialCount(input) {
  return input.serials.filter((u) => cleanText(u?.serial) && u.active !== false).length;
}

/** Serials of a camera that can be handed out. */
function activeSerials(camera) {
  return (camera?.serials || []).filter((u) => u.active !== false).map((u) => u.serial);
}

function sanitizeCamera(input, { allowHistory = false } = {}) {
  if (!input || typeof input !== "object") fail("Camera details are missing.");
  const name = cleanText(input.name, 80);
  if (!name) fail("Camera name is required.");

  const camera = {
    name,
    tag: cleanText(input.tag, 80),
    active: input.active === undefined ? true : Boolean(input.active),
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    units: hasSerials(input) ? activeSerialCount(input) : toInt(input.units, "Units"),
    pricing: sanitizePricing(input.pricing),
    addOns: sanitizeAddOns(input.addOns),
    serials: sanitizeSerials(input.serials),
    inclusions: sanitizeInclusions(input.inclusions),
    image: cleanText(input.image, 1000),
    detailImage: cleanText(input.detailImage, 1000),
    goodFor: cleanText(input.goodFor),
    perfectFor: cleanText(input.perfectFor),
  };

  if (allowHistory) {
    const priceHistory = sanitizeHistory(input.priceHistory, "priceHistory");
    const unitHistory = sanitizeHistory(input.unitHistory, "unitHistory");
    if (priceHistory?.length) camera.priceHistory = priceHistory;
    if (unitHistory?.length) camera.unitHistory = unitHistory;
  }
  return camera;
}

/** Move the old value into history, or overwrite it if it never took effect. */
function recordChange(history, entry, effectiveDate, label) {
  const list = Array.isArray(history) ? [...history] : [];
  const last = list[list.length - 1];
  if (last && effectiveDate < last.before) {
    fail(
      `${label} already changed on ${last.before}; the new ${label.toLowerCase()} ` +
        `must take effect on or after that date.`,
    );
  }
  // Same effective date as the last change: the value being replaced was
  // never in force for a single day, so there is nothing to preserve.
  if (last && effectiveDate === last.before) return list;
  list.push({ before: effectiveDate, ...entry });
  return list;
}

// Firestore does not preserve map key order, so compare normalised copies.
const canonicalPricing = (tiers) =>
  JSON.stringify((tiers || []).map((t) => [t.minDays, t.maxDays ?? null, Number(t.pricePerDay)]));
const samePricing = (a, b) => canonicalPricing(a) === canonicalPricing(b);

/**
 * Merge an edit into a stored camera. A changed day rate or unit count keeps
 * the old value in history up to `effectiveDate`, so bookings before that date
 * keep their price and availability. The name is fixed after creation because
 * bookings refer to their camera by name.
 */
function applyCameraUpdate(existing, input, effectiveDate) {
  const next = sanitizeCamera({ ...input, name: input?.name ?? existing.name });
  if (!sameName(next.name, existing.name)) {
    fail("A camera's name can't be changed — bookings refer to it by name. Hide it and add a new one instead.");
  }
  next.name = existing.name;

  const pricingChanged = !samePricing(next.pricing, existing.pricing);
  const unitsChanged = next.units !== existing.units;
  if ((pricingChanged || unitsChanged) && !ISO_DATE.test(String(effectiveDate || ""))) {
    fail("Pick the date the new price or unit count takes effect.");
  }

  next.priceHistory = pricingChanged
    ? recordChange(existing.priceHistory, { pricing: existing.pricing }, effectiveDate, "Price")
    : existing.priceHistory || [];
  next.unitHistory = unitsChanged
    ? recordChange(existing.unitHistory, { units: existing.units }, effectiveDate, "Unit count")
    : existing.unitHistory || [];
  return next;
}

/** Today in the Philippines (UTC+8), as YYYY-MM-DD. */
function todayManila() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = {
  CatalogValidationError,
  slugify,
  sameName,
  findCamera,
  getPricingForDate,
  getUnitsForDate,
  calcRentalFee,
  sanitizeCamera,
  sanitizePricing,
  activeSerials,
  applyCameraUpdate,
  todayManila,
};
