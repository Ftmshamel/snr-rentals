const { normalizeBookingStatus } = require("./statusRules");

function firstOrNull(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0] ?? null;
}

// Mirror of frontend/src/data/cameras.js — keep in sync when prices change.
// Camera matching is case-insensitive (see autoCalcFee), so name casing here
// only needs to stay in step with the source for readability.
//
// Only `pricing`, `priceHistory` and `addOns` are read here (autoCalcFee).
// `units` is carried purely so this stays a faithful mirror of the frontend
// catalogue and diffs line up — nothing in the backend reads it. Availability
// is computed on the frontend from cameras.js, and the public site gets its
// counts from CAMERA_UNITS in api/public-availability.js. Keep the numbers
// accurate regardless: a wrong value here is a trap for the next reader.
//
// Note there is deliberately NO unitHistory in this mirror — fee calculation
// does not depend on stock, so replicating it would be dead weight. Stock
// history lives only in frontend/src/data/cameras.js.
//
// Date the current rate card took effect. Bookings whose PICK_UP_DATE falls
// before this keep computing against the old tiers in each camera's
// priceHistory (see getPricingForDate) so past rentals' fees never shift
// retroactively when prices are updated here.
//
// The rate card that took effect on this date changed two things at once:
//   1. Day tiers went from 2 bands (1-3 / 4+) to 3 bands (1-2 / 3-4 / 5+),
//      for every camera — so a 3-day rental moved down a band.
//   2. CANON G7X MARK III dropped 700/650 -> 600/550/500 and
//      FUJIFILM X-T100 dropped 600/550 -> 550/500/450.
// Every camera therefore carries a priceHistory entry, not just those two.
const RATE_CARD_CHANGE_DATE = "2026-08-20";

const CAMERAS = [
  {
    name: "DJI Osmo 360",
    units: 2,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 550 },
      { minDays: 3, maxDays: 4, pricePerDay: 500 },
      { minDays: 5, maxDays: null, pricePerDay: 450 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 550 },
          { minDays: 4, maxDays: null, pricePerDay: 500 },
        ],
      },
    ],
    addOns: [
      { name: "Double Crab Clamp", pricePerDay: 40 },
      { name: "Long Invisible Stick (3 meters)", pricePerDay: 50 },
      { name: "Bullet Time Tripod", pricePerDay: 40 },
      { name: "Quadpod Stand", pricePerDay: 40 },
      { name: "256GB SD Card", pricePerDay: 60 },
      { name: "512GB SD Card", pricePerDay: 80 },
    ],
  },
  {
    name: "DJI OSMO POCKET 3",
    units: 2, // was 3 until one was sold on 2026-08-20
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 550 },
      { minDays: 3, maxDays: 4, pricePerDay: 500 },
      { minDays: 5, maxDays: null, pricePerDay: 450 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 550 },
          { minDays: 4, maxDays: null, pricePerDay: 500 },
        ],
      },
    ],
    addOns: [
      { name: "512GB SD Card", pricePerDay: 80 },
      { name: "Magnetic Mount", pricePerDay: 50 },
      { name: "Quadpod Stand", pricePerDay: 40 },
      { name: "256GB SD Card", pricePerDay: 60 },
    ],
  },
  {
    name: "DJI Osmo Nano",
    units: 2,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 500 },
      { minDays: 3, maxDays: 4, pricePerDay: 450 },
      { minDays: 5, maxDays: null, pricePerDay: 400 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 500 },
          { minDays: 4, maxDays: null, pricePerDay: 450 },
        ],
      },
    ],
    addOns: [],
  },
  {
    name: "INSTA360 ACE PRO 2",
    units: 2,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 550 },
      { minDays: 3, maxDays: 4, pricePerDay: 500 },
      { minDays: 5, maxDays: null, pricePerDay: 450 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 550 },
          { minDays: 4, maxDays: null, pricePerDay: 500 },
        ],
      },
    ],
    addOns: [
      { name: "Double Crab Clamp", pricePerDay: 40 },
      { name: "Dive Case", pricePerDay: 80 },
      { name: "Magnetic Neck Mount", pricePerDay: 40 },
      { name: "Quadpod Stand", pricePerDay: 40 },
      { name: "256GB SD Card", pricePerDay: 60 },
      { name: "512GB SD Card", pricePerDay: 80 },
    ],
  },
  {
    name: "CANON G7X MARK III",
    units: 4,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 600 },
      { minDays: 3, maxDays: 4, pricePerDay: 550 },
      { minDays: 5, maxDays: null, pricePerDay: 500 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 700 },
          { minDays: 4, maxDays: null, pricePerDay: 650 },
        ],
      },
    ],
    addOns: [
      { name: "Extra G7X Battery", pricePerDay: 50 },
      { name: "Camera Tripod", pricePerDay: 50 },
      { name: "Mini Tripod", pricePerDay: 40 },
      { name: "128GB SD Card", pricePerDay: 50 },
    ],
  },
  {
    name: "FUJIFILM X-T100",
    units: 2,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 550 },
      { minDays: 3, maxDays: 4, pricePerDay: 500 },
      { minDays: 5, maxDays: null, pricePerDay: 450 },
    ],
    priceHistory: [
      {
        before: RATE_CARD_CHANGE_DATE,
        pricing: [
          { minDays: 1, maxDays: 3, pricePerDay: 600 },
          { minDays: 4, maxDays: null, pricePerDay: 550 },
        ],
      },
    ],
    addOns: [
      { name: "Extra X-T100 Battery", pricePerDay: 50 },
      { name: "Camera Tripod", pricePerDay: 50 },
      { name: "Mini Tripod", pricePerDay: 40 },
      { name: "128GB SD Card", pricePerDay: 50 },
      { name: "25mm f1.8 Prime Lens", pricePerDay: 150 },
      { name: "85mm f1.8 Prime Lens", pricePerDay: 200 },
    ],
  },
  {
    name: "CANON EOS R50",
    units: 1,
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 600 },
      { minDays: 3, maxDays: 4, pricePerDay: 550 },
      { minDays: 5, maxDays: null, pricePerDay: 500 },
    ],
    // No priceHistory: added after RATE_CARD_CHANGE_DATE, so these are the
    // only rates it has ever had.
    addOns: [
      { name: "Extra R50 Battery", pricePerDay: 50 },
      { name: "Camera Tripod", pricePerDay: 50 },
      { name: "Mini Tripod", pricePerDay: 40 },
      { name: "128GB SD Card", pricePerDay: 50 },
    ],
  },
];

// Mirrors getPricingForDate in frontend/src/data/cameras.js.
function getPricingForDate(camera, pickUpDateIso) {
  if (!camera) return null;
  if (pickUpDateIso && Array.isArray(camera.priceHistory)) {
    for (const entry of camera.priceHistory) {
      if (pickUpDateIso < entry.before) return entry.pricing;
    }
  }
  return camera.pricing;
}

function autoCalcFee(doc, addons) {
  const cam = CAMERAS.find(
    (c) =>
      c.name.toUpperCase() ===
      (doc.PREFERRED_CAMERA || "").toUpperCase().trim(),
  );
  if (!cam) return null;

  const start = new Date(doc.PICK_UP_DATE);
  const end = new Date(doc.RETURN_DATE);
  if (isNaN(start) || isNaN(end)) return null;
  const days = Math.max(Math.round((end - start) / 86400000), 1);

  // Rate in effect on this booking's own PICK_UP_DATE, not the date it's
  // being saved — matters for backfills/edits of past bookings, not just new
  // submissions (which are always priced at today's rate anyway).
  const pricing = getPricingForDate(cam, doc.PICK_UP_DATE);
  const tier = pricing.find(
    (t) => days >= t.minDays && (t.maxDays === null || days <= t.maxDays),
  );
  if (!tier) return null;

  let fee = tier.pricePerDay * days;
  for (const addonName of addons) {
    const a = cam.addOns.find(
      (x) => x.name.toUpperCase() === (addonName || "").toUpperCase().trim(),
    );
    if (a) fee += a.pricePerDay * days;
  }
  return fee;
}

function arrayToBoolean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return true;
}

// Strip everything but letters/digits for tolerant name matching.
function normalizeForMatch(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Normalize an add-ons value (array OR comma-separated string) to a clean list.
// Drops blanks and explicit "None" selections (the form's "no add-ons" choice).
function coerceAddonList(raw) {
  let items = [];
  if (Array.isArray(raw)) items = raw.map((a) => String(a).trim());
  else if (typeof raw === "string") items = raw.split(",").map((a) => a.trim());
  return items.filter((a) => a && a.toLowerCase() !== "none");
}

function parseAddons(doc) {
  if (!doc || typeof doc !== "object") return [];

  const addonKeys = Object.keys(doc).filter((k) => /add[-_ ]?ons/i.test(k));
  const camKey = normalizeForMatch(doc.PREFERRED_CAMERA);

  // Current form has ONE add-ons column per camera, e.g.
  //   "Need any add-ons? (CANON G7X MARK III)".
  // If a renter edits their response and switches cameras, the old camera's
  // column keeps its value — so only the column whose name matches the
  // SELECTED camera is authoritative; stale columns are ignored.
  if (camKey) {
    const match = addonKeys.find((k) => normalizeForMatch(k).includes(camKey));
    if (match) return coerceAddonList(doc[match]);
  }
  // Per-camera form, but no column matches the selected camera → that camera
  // simply has no add-ons (e.g. DJI Osmo Nano).
  const looksPerCamera = addonKeys.some((k) => {
    const nk = normalizeForMatch(k);
    return CAMERAS.some((c) => nk.includes(normalizeForMatch(c.name)));
  });
  if (looksPerCamera) return [];

  // Legacy single-column formats (older form / manually-created rentals).
  const explicit = [
    doc["Please_choose_your_add-ons"],
    doc["Please_choose_your_add_ons"],
    doc["ADDONS"],
    doc["ADD_ONS"],
  ];
  for (const raw of explicit) {
    const parsed = coerceAddonList(raw);
    if (parsed.length) return parsed;
  }
  for (const k of addonKeys) {
    const parsed = coerceAddonList(doc[k]);
    if (parsed.length) return parsed;
  }
  return [];
}

function transformBooking(doc) {
  const booking = {
    response_id: doc.responseId,
    submitted_at: doc.Timestamp ? new Date(doc.Timestamp).toISOString() : null,

    full_name: (doc.FULL_NAME || "").trim() || "N/A",
    facebook_profile_link: doc.FACEBOOK_PROFILE_LINK ?? null,
    facebook_account_name: doc.FACEBOOK_ACCOUNT_NAME ?? null,
    contact_number: doc.CONTACT_NUMBER ?? null,
    complete_address: doc.COMPLETE_ADDRESS ?? null,

    type_of_trip: doc.TYPE_OF_TRIP ?? null,
    specific_destination: doc.SPECIFIC_DESTINATION ?? null,
    pick_up_date: doc.PICK_UP_DATE,
    pick_up_time: doc.PICK_UP_TIME || null,
    return_date: doc.RETURN_DATE,
    return_time: doc.RETURN_TIME || null,
    preferred_mode: doc.PREFERRED_MODE ?? null,
    preferred_camera: doc.PREFERRED_CAMERA,

    rental_fee: doc.RENTAL_FEE ?? autoCalcFee(doc, parseAddons(doc)) ?? null,
    security_deposit: doc.SECURITY_DEPOSIT ?? null,
    total_payable_before_release: doc.TOTAL_PAYABLE_BEFORE_RELEASE ?? null,
    status: normalizeBookingStatus(doc.status ?? doc.STATUS) || "pending",

    data_privacy_consent: arrayToBoolean(doc.Data_Privacy_Act_of_2012),
    terms_consent: arrayToBoolean(doc["Terms_&_Conditions"]),

    gov_id_1: firstOrNull(doc["1st_ID"]),
    gov_id_2: firstOrNull(doc["2nd_ID"]),
    proof_of_billing: firstOrNull(doc.PROOF_OF_BILLING),
    selfie_with_id: firstOrNull(doc["SELFIE_HOLDING_YOUR_ID's"]),
    proof_of_downpayment: firstOrNull(doc.PROOF_OF_DOWNPAYMENT),

    // Signed rental contract, captured on the public booking site
    contract_camera: doc.CONTRACT_CAMERA ?? null,
    contract_terms: Array.isArray(doc.CONTRACT_TERMS_AND_CONDITIONS)
      ? doc.CONTRACT_TERMS_AND_CONDITIONS
      : null,
    renter_e_signature: firstOrNull(doc.RENTER_E_SIGNATURE),
    e_signature_date: doc.E_SIGNATURE_DATE
      ? new Date(doc.E_SIGNATURE_DATE).toISOString()
      : null,

    source: doc._source ?? "google_form",
    updated_at: new Date().toISOString(),
  };

  const addons = parseAddons(doc);

  return { booking, addons };
}

module.exports = { transformBooking };
