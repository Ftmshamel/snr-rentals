// ============================================================================
// UNUSED — nothing imports this file. Kept deliberately; read before deleting.
//
// The header below used to claim this seeds a `camera_prices` table and is
// read through lib/cameraPricing.js. Neither exists: cameraPricing.js was
// never committed and `camera_prices` is not in the Supabase schema (querying
// it returns "Could not find the table"). This file is the leftover backend
// half of the editable-camera-pricing feature that was added and then reverted
// — the frontend half (hooks/useCameraPrices.js) went with the revert.
//
// So: this is dead code today, and its numbers are NOT consulted by anything.
// It is left in place because the feature may be picked up again, but do not
// treat it as a source of truth, and do not "fix" a bug by editing it. The
// real catalogue is frontend/src/data/cameras.js.
//
// Its values are kept correct anyway, so that if the feature is revived it
// does not seed the table with stale prices or unit counts.
// ============================================================================
//
// Original intent (aspirational, not current behaviour): hardcoded camera
// rates — the seed for the camera_prices table and the fallback used whenever
// that table is unavailable. Mirror of frontend/src/data/cameras.js.
// Camera matching is case-insensitive, so the name casing here only needs to
// stay in step with the source for readability.

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

module.exports = { CAMERAS };
