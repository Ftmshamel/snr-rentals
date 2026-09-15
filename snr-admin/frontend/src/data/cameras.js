// ============================================================================
// Camera catalogue — the source of truth for rates and stock.
//
// READ THIS BEFORE EDITING.
//
// Two fields here look redundant and are not. Both exist because this data is
// used to describe the PAST as well as the present, and flattening either one
// silently rewrites history:
//
//   priceHistory — what a camera cost on a given date.
//     Analytics, RentalsReport and BookingModal re-derive fees for old
//     bookings. Without it, changing a price today would restate every past
//     rental's fee and shift months-old revenue figures.
//
//   unitHistory  — how many units existed on a given date.
//     Availability and the overbooking warning look at past dates too. Without
//     it, a booking that was fine when you owned more units reads as a
//     double-booking. This is real: on 2026-06-04 three Pocket 3s were out,
//     which was correct then and looks like an overbooking under today's count.
//
// Both are read newest-cut-off-first via getPricingForDate / getUnitsForDate at
// the bottom of this file. To record a change, do NOT overwrite the current
// value alone — move the old value into the history array with the date the
// change took effect, then update the live value.
//
// Mirrors that must be updated alongside this file:
//   backend/lib/transformBooking.js          (prices new submissions)
//   backend/scripts/fill-rental-fees.js      (backfills missing fees)
//   backend/api/public-availability.js       (unit counts for the public site)
// ============================================================================

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

export const CAMERAS = [
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
      { name: "Extra 2 Batteries", pricePerDay: 80 },
    ],
  },
  {
    name: "DJI OSMO POCKET 3",
    units: 2,
    // One of the three was sold on 2026-08-20. Availability checks on earlier
    // dates must use the count that existed then, or past bookings look like
    // overbookings. See getUnitsForDate.
    unitHistory: [{ before: "2026-08-20", units: 3 }],
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
      { name: "Extended Battery Handle", pricePerDay: 50 },
      { name: "Mini Mic ", pricePerDay: 50 },
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
      { name: "Extra AcePro Battery", pricePerDay: 80 },
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
    // No priceHistory: added to the lineup after RATE_CARD_CHANGE_DATE, so it
    // has only ever been rented at these rates. Nothing to fall back to.
    addOns: [
      { name: "Extra R50 Battery", pricePerDay: 50 },
      { name: "Camera Tripod", pricePerDay: 50 },
      { name: "Mini Tripod", pricePerDay: 40 },
      { name: "128GB SD Card", pricePerDay: 50 },
    ],
  },
];

/**
 * Returns the pricing tiers in effect for a camera on a given PICK_UP_DATE
 * (YYYY-MM-DD). Falls back to `camera.pricing` when the camera has no
 * priceHistory or no date is given, so callers that don't care about a
 * historical cutoff can pass either.
 */
export function getPricingForDate(camera, pickUpDateIso) {
  if (!camera) return null;
  if (pickUpDateIso && Array.isArray(camera.priceHistory)) {
    for (const entry of camera.priceHistory) {
      if (pickUpDateIso < entry.before) return entry.pricing;
    }
  }
  return camera.pricing;
}

/**
 * How many units of a camera existed on a given date. Stock changes over time
 * (units bought or sold), so checking availability on a past date has to use
 * the count from then — otherwise a booking that was fine at the time reads as
 * an overbooking now. Same shape as getPricingForDate.
 */
export function getUnitsForDate(camera, dateIso) {
  if (!camera) return 0;
  if (dateIso && Array.isArray(camera.unitHistory)) {
    for (const entry of camera.unitHistory) {
      if (dateIso < entry.before) return entry.units;
    }
  }
  return camera.units;
}
