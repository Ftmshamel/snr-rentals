/**
 * Calculates and fills missing rental_fee values in Supabase
 * based on pick_up_date, return_date, preferred_camera, and add-ons.
 *
 * Only updates rows where rental_fee IS NULL.
 * Rows with an existing fee are printed for comparison but not touched.
 *
 * Usage:
 *   node scripts/fill-rental-fees.js
 *
 * Add --force to also overwrite rows that already have a fee.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
  (process.env.SUPABASE_SERVICE_KEY || "").trim(),
);

// ── Camera pricing data (mirrors frontend/src/data/cameras.js) ───────────────
//
// Date the current rate card took effect. Bookings whose pick_up_date falls
// before this keep computing against the old tiers in each camera's
// priceHistory (see getPricingForDate) so re-running this backfill never
// reprices old bookings at today's rate.
//
// The rate card that took effect on this date changed two things at once:
//   1. Day tiers went from 2 bands (1-3 / 4+) to 3 bands (1-2 / 3-4 / 5+),
//      for every camera — so a 3-day rental moved down a band.
//   2. Canon G7X Mark III dropped 700/650 -> 600/550/500 and
//      Fujifilm X-T100 dropped 600/550 -> 550/500/450.
// Every camera therefore carries a priceHistory entry, not just those two.
const RATE_CARD_CHANGE_DATE = "2026-08-20";

const CAMERAS = [
  {
    name: "DJI Osmo 360",
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
    name: "DJI Osmo Pocket 3",
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
    name: "Insta360 Ace Pro 2",
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
    name: "Canon G7X Mark III",
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
    name: "Fujifilm X-T100",
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
    name: "Canon EOS R50",
    pricing: [
      { minDays: 1, maxDays: 2, pricePerDay: 600 },
      { minDays: 3, maxDays: 4, pricePerDay: 550 },
      { minDays: 5, maxDays: null, pricePerDay: 500 },
    ],
    // No priceHistory: added after the rate card change.
    addOns: [
      { name: "Extra R50 Battery", pricePerDay: 50 },
      { name: "Camera Tripod", pricePerDay: 50 },
      { name: "Mini Tripod", pricePerDay: 40 },
      { name: "128GB SD Card", pricePerDay: 50 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDays(pickUpDate, returnDate) {
  const start = new Date(pickUpDate);
  const end = new Date(returnDate);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(days, 1); // same-day rentals count as 1 day
}

function findCamera(name) {
  const normalized = (name || "").toUpperCase().trim();
  return CAMERAS.find((c) => c.name.toUpperCase() === normalized);
}

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

function getPricePerDay(camera, days, pickUpDateIso) {
  const pricing = getPricingForDate(camera, pickUpDateIso);
  for (const tier of pricing) {
    if (
      days >= tier.minDays &&
      (tier.maxDays === null || days <= tier.maxDays)
    ) {
      return tier.pricePerDay;
    }
  }
  return null;
}

function calcFee(booking, addons) {
  const camera = findCamera(booking.preferred_camera);
  if (!camera) return null;

  const days = calcDays(booking.pick_up_date, booking.return_date);
  if (days <= 0) return null;

  const pricePerDay = getPricePerDay(camera, days, booking.pick_up_date);
  if (pricePerDay === null) return null;

  let fee = pricePerDay * days;

  for (const addon of addons) {
    const addonDef = camera.addOns.find(
      (a) =>
        a.name.toUpperCase() === (addon.addon_name || "").toUpperCase().trim(),
    );
    if (addonDef) {
      fee += addonDef.pricePerDay * days;
    }
  }

  return fee;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, response_id, full_name, preferred_camera, pick_up_date, return_date, rental_fee",
    );

  if (error) {
    console.error("Failed to fetch bookings:", error.message);
    process.exit(1);
  }

  const { data: allAddons } = await supabase
    .from("booking_addons")
    .select("booking_id, addon_name");

  const addonsByBooking = {};
  for (const addon of allAddons || []) {
    if (!addonsByBooking[addon.booking_id])
      addonsByBooking[addon.booking_id] = [];
    addonsByBooking[addon.booking_id].push(addon);
  }

  let updated = 0;
  let skipped = 0;
  let noCamera = 0;

  for (const booking of bookings) {
    const addons = addonsByBooking[booking.id] || [];
    const calculated = calcFee(booking, addons);

    if (calculated === null) {
      console.warn(
        `  NO MATCH  ${booking.preferred_camera} (${booking.full_name})`,
      );
      noCamera++;
      continue;
    }

    const days = calcDays(booking.pick_up_date, booking.return_date);

    // Skip rows that already have a fee (may have been manually adjusted)
    if (booking.rental_fee !== null) {
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ rental_fee: calculated })
      .eq("id", booking.id);

    if (updateError) {
      console.error(`  ERROR  ${booking.full_name}:`, updateError.message);
    } else {
      console.log(
        `  SET  ${booking.full_name} → ₱${calculated} (${days}d, ${booking.preferred_camera})`,
      );
      updated++;
    }
  }

  console.log("\n── Done ──────────────────────────────────────────");
  console.log(`  Updated        : ${updated}`);
  console.log(`  Skipped        : ${skipped} (already have a fee)`);
  console.log(`  Unknown camera : ${noCamera}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
