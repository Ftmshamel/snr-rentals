// ============================================================================
// Camera pricing/stock helpers.
//
// The catalogue itself is no longer in this file: it lives in Firestore
// (`cameras` collection) and is edited on the owner-only Catalog page
// (/catalog). Components get it from hooks/useCameras.js.
//
// Two fields on every camera look redundant and are not. Both exist because
// the catalogue describes the PAST as well as the present:
//
//   priceHistory — what a camera cost on a given date.
//   unitHistory  — how many units existed on a given date.
//
// The server maintains both (backend/lib/catalog.js): saving a new price or
// unit count on the Catalog page moves the old value into history with the
// date the change takes effect, so past bookings keep their fee and past
// dates don't read as overbooked. Entries are oldest cut-off first.
// ============================================================================

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
