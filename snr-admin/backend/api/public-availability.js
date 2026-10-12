const { findAvailabilityBookings } = require("../lib/dataSource");
const { isFirebase } = require("../lib/sourceName");
const { findCamera, getUnitsForDate } = require("../lib/catalog");

// In firebase mode the unit count comes from the live catalogue (Firestore
// `cameras`), as of the requested pick-up date. CAMERA_UNITS below is the
// legacy (supabase / mongodb) source only.
async function unitsFor(cameraName, pickUpDate) {
  if (!isFirebase()) return CAMERA_UNITS[normalize(cameraName)];
  const { listCameras } = require("../lib/firestoreQueries");
  const camera = findCamera(await listCameras(), cameraName);
  // A hidden camera can't be booked from the public site.
  if (!camera || camera.active === false) return undefined;
  return getUnitsForDate(camera, pickUpDate);
}

// LEGACY ONLY — keep in step with frontend/src/data/cameras.js.
//
// This endpoint only ever quotes windows the renter is booking now, so the
// current stock is the right count — no unit history needed here. The admin
// side does look at past dates and uses getUnitsForDate for that.
//
// DJI Osmo Pocket 3 was 3 until one was sold on 2026-08-20.
const CAMERA_UNITS = {
  "DJI OSMO 360": 2,
  "DJI OSMO POCKET 3": 2,
  "DJI OSMO NANO": 2,
  "INSTA360 ACE PRO 2": 2,
  "CANON G7X MARK III": 4,
  "FUJIFILM X-T100": 2,
  "CANON EOS R50": 1,
};

const INACTIVE_STATUSES = new Set(["cancelled", "rejected"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseTime(value, fallback) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return [hour, minute];
}

function toUtcMillis(dateValue, timeValue, fallbackTime) {
  if (!isIsoDate(dateValue)) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = parseTime(timeValue, fallbackTime);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function getQuery(req) {
  if (req.query && Object.keys(req.query).length > 0) return req.query;
  const url = new URL(req.url || "", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = async (req, res) => {
  setCors(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const query = getQuery(req);
  const camera = first(query.camera);
  const pickUpDate = first(query.pickUpDate);
  const returnDate = first(query.returnDate);
  const pickUpTime = first(query.pickUpTime);
  const returnTime = first(query.returnTime);
  const cameraKey = normalize(camera);

  const requestStart = toUtcMillis(pickUpDate, pickUpTime, [7, 0]);
  const requestEnd = toUtcMillis(returnDate, returnTime, [22, 0]);
  if (requestStart == null || requestEnd == null || requestStart >= requestEnd) {
    return res.status(400).json({ ok: false, error: "Invalid rental window" });
  }

  try {
    const units = await unitsFor(camera, pickUpDate);
    if (units === undefined) {
      return res.status(400).json({ ok: false, error: "Unknown camera" });
    }

    const bookings = await findAvailabilityBookings();
    let booked = 0;

    for (const booking of bookings) {
      if (normalize(booking.PREFERRED_CAMERA) !== cameraKey) continue;
      if (INACTIVE_STATUSES.has(normalize(booking.status).toLowerCase())) continue;

      const bookingStart = toUtcMillis(
        booking.PICK_UP_DATE,
        booking.PICK_UP_TIME,
        [0, 0],
      );
      const bookingEnd = toUtcMillis(
        booking.RETURN_DATE,
        booking.RETURN_TIME,
        [23, 59],
      );

      if (
        bookingStart != null &&
        bookingEnd != null &&
        overlaps(requestStart, requestEnd, bookingStart, bookingEnd)
      ) {
        booked += 1;
      }
    }

    return res.status(200).json({
      ok: true,
      camera,
      units,
      booked,
      available: Math.max(units - booked, 0),
    });
  } catch (err) {
    console.error("[api/public-availability]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
