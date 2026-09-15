const { getBookingsCollection } = require("./bookingsCollection");
const { sanitizeBookingUpdateFields } = require("./statusRules");

function addDaysIso(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Excludes pending/rejected/cancelled; legacy docs with no status field still show
const APPROVED_FILTER = {
  status: { $nin: ["pending", "rejected", "cancelled"] },
};

// Uploaded documents are stored inline as base64 data URLs, so returning them
// for every booking makes the list endpoint tens of MB. List-shaped queries omit
// them and flag rows `_partial: true`; anything needing a booking's documents
// fetches that one booking via findBookingByResponseId. Mirrors supabaseQueries.
const LIST_EXCLUDED_DOCS = {
  "1st_ID": 0,
  "2nd_ID": 0,
  PROOF_OF_BILLING: 0,
  "SELFIE_HOLDING_YOUR_ID's": 0,
  PROOF_OF_DOWNPAYMENT: 0,
  RENTER_E_SIGNATURE: 0,
};

async function findAllBookingsSorted() {
  const col = await getBookingsCollection();
  const docs = await col
    .find({}, { projection: LIST_EXCLUDED_DOCS })
    .sort({ PICK_UP_DATE: 1 })
    .toArray();
  return docs.map((d) => ({ ...d, _partial: true }));
}

async function findAvailabilityBookings() {
  const col = await getBookingsCollection();
  return col
    .find(
      {},
      {
        projection: {
          PREFERRED_CAMERA: 1,
          PICK_UP_DATE: 1,
          PICK_UP_TIME: 1,
          RETURN_DATE: 1,
          RETURN_TIME: 1,
          status: 1,
        },
      },
    )
    .sort({ PICK_UP_DATE: 1 })
    .toArray();
}

async function findPendingBookings() {
  const col = await getBookingsCollection();
  return col.find({ status: "pending" }).sort({ _lastUpdatedAt: -1 }).toArray();
}

async function findBookingsInWeek(startIso) {
  const endIso = addDaysIso(startIso, 6);
  const col = await getBookingsCollection();
  const filter = {
    ...APPROVED_FILTER,
    $or: [
      { PICK_UP_DATE: { $gte: startIso, $lte: endIso } },
      { RETURN_DATE: { $gte: startIso, $lte: endIso } },
    ],
  };
  return col.find(filter).sort({ PICK_UP_DATE: 1 }).toArray();
}

async function findBookingsOnDate(dateIso) {
  const col = await getBookingsCollection();
  const filter = {
    ...APPROVED_FILTER,
    PICK_UP_DATE: { $lte: dateIso },
    RETURN_DATE: { $gte: dateIso },
  };
  return col.find(filter).sort({ PICK_UP_DATE: 1 }).toArray();
}

async function findBookingsByCamera(cameraNameFromUrl) {
  const decoded = decodeURIComponent(cameraNameFromUrl || "").trim();
  if (!decoded) return [];
  const col = await getBookingsCollection();
  const pattern = new RegExp(`^${escapeRegex(decoded)}$`, "i");
  return col
    .find({ ...APPROVED_FILTER, PREFERRED_CAMERA: pattern })
    .sort({ PICK_UP_DATE: 1 })
    .toArray();
}

async function findBookingByResponseId(responseId) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return null;
  const col = await getBookingsCollection();
  return col.findOne({ responseId: decoded });
}

async function updateBookingByResponseId(responseId, fields) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return null;
  const col = await getBookingsCollection();
  const existing = await col.findOne(
    { responseId: decoded },
    { projection: { status: 1 } },
  );
  if (!existing) return null;
  const {
    _id,
    responseId: _rid,
    _source,
    _lastUpdatedAt,
    ...rawFields
  } = fields;
  const safeFields = sanitizeBookingUpdateFields(existing.status, rawFields);
  const result = await col.findOneAndUpdate(
    { responseId: decoded },
    { $set: { ...safeFields, _lastUpdatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result;
}

async function deleteBookingByResponseId(responseId) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return false;
  const col = await getBookingsCollection();
  const result = await col.deleteOne({ responseId: decoded });
  return result.deletedCount > 0;
}

async function findBookingsByAddon(addonNameFromUrl) {
  const decoded = decodeURIComponent(addonNameFromUrl || "").trim();
  if (!decoded) return [];
  const col = await getBookingsCollection();
  const pattern = new RegExp(`^${escapeRegex(decoded)}$`, "i");
  return col
    .find({
      ...APPROVED_FILTER,
      $or: [{ "Please_choose_your_add-ons": pattern }, { ADD_ONS: pattern }],
    })
    .sort({ PICK_UP_DATE: 1 })
    .toArray();
}

module.exports = {
  addDaysIso,
  findAllBookingsSorted,
  findAvailabilityBookings,
  findPendingBookings,
  findBookingsInWeek,
  findBookingsOnDate,
  findBookingsByCamera,
  findBookingsByAddon,
  findBookingByResponseId,
  updateBookingByResponseId,
  deleteBookingByResponseId,
};
