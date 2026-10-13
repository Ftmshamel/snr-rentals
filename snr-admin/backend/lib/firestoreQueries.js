const { getFirestore } = require("./firebase");
const { toMongoFormat, FIELD_MAP } = require("./bookingShape");
const {
  isCancelledStatus,
  normalizeBookingStatus,
  resolveBookingStatus,
  sanitizeBookingUpdateFields,
} = require("./statusRules");
const { transformBooking } = require("./transformBooking");
const {
  CatalogValidationError,
  slugify,
  sameName,
  findCamera,
  activeSerials,
  sanitizeCamera,
  applyCameraUpdate,
} = require("./catalog");
const {
  RETURN_CONDITIONS,
  LifecycleError,
  normalizeFulfillment,
  isReleased,
  timelineEvents,
} = require("./lifecycle");

// ── Firestore layout ─────────────────────────────────────────────────────────
//
//   bookings/{responseId}                 one booking, in the frontend's shape
//   bookings/{responseId}/documents/{key} one uploaded image per doc: { value }
//   expenses/{autoId}                     { amount, description, date, created_at }
//   date_notes/{YYYY-MM-DD}               { date, note, updated_at }
//   cameras/{slug}                        the catalogue — see lib/catalog.js
//
// Uploaded documents (IDs, selfie, billing, downpayment, signature) are base64
// images. They live in a subcollection, not on the booking, for two reasons:
// a Firestore document is capped at 1 MiB, and list views would otherwise
// download every image (GET /api/bookings was once 12.5 MB for that reason).
// List queries therefore return `_partial: true` rows, exactly as the Supabase
// layer did; the frontend fetches one booking by id when it needs documents.

const DOCUMENT_FIELDS = [
  "1st_ID",
  "2nd_ID",
  "PROOF_OF_BILLING",
  "SELFIE_HOLDING_YOUR_ID's",
  "PROOF_OF_DOWNPAYMENT",
  "RENTER_E_SIGNATURE",
];

// Fields the admin sets after submission. A renter re-submitting the same
// response (Google Form edit) must not wipe them.
const ADMIN_OWNED_FIELDS = [
  "HALF_DAY_LATE",
  "HALF_DAY_EARLY",
  "NOTES",
  "DOWNPAYMENT_PAID",
  "FULFILLMENT_STATUS",
  "_createdAt",
];

// Statuses that have earned nothing / never happened — same as approvedFilter
// in supabaseQueries.
const UNAPPROVED = new Set(["pending", "rejected", "cancelled"]);

function db() {
  return getFirestore();
}

/** Firestore ids can't contain "/" — Google Form ids don't, but be safe. */
function bookingDocId(responseId) {
  return String(responseId || "").trim().replace(/\//g, "_");
}

function bookingsCol() {
  return db().collection("bookings");
}

function decodeId(responseId) {
  try {
    return decodeURIComponent(responseId || "").trim();
  } catch {
    return String(responseId || "").trim();
  }
}

function isApproved(booking) {
  return !UNAPPROVED.has(String(booking.status || "").trim().toLowerCase());
}

function byPickUpDate(a, b) {
  const x = a.PICK_UP_DATE || "";
  const y = b.PICK_UP_DATE || "";
  return x < y ? -1 : x > y ? 1 : 0;
}

function partial(data) {
  const booking = { ...data };
  for (const key of DOCUMENT_FIELDS) booking[key] = [];
  booking._partial = true;
  return booking;
}

async function attachDocuments(ref, data) {
  const snap = await ref.collection("documents").get();
  const booking = { ...data };
  for (const key of DOCUMENT_FIELDS) booking[key] = [];
  snap.forEach((d) => {
    const value = d.get("value");
    if (DOCUMENT_FIELDS.includes(d.id) && value) booking[d.id] = [value];
  });
  return booking;
}

async function allBookings() {
  const snap = await bookingsCol().get();
  return snap.docs.map((d) => ({ ref: d.ref, data: d.data() }));
}

// ── Bookings: reads ──────────────────────────────────────────────────────────

async function findAllBookingsSorted() {
  return (await allBookings()).map((b) => partial(b.data)).sort(byPickUpDate);
}

async function findAvailabilityBookings() {
  return (await allBookings())
    .map(({ data }) => ({
      PREFERRED_CAMERA: data.PREFERRED_CAMERA,
      PICK_UP_DATE: data.PICK_UP_DATE,
      PICK_UP_TIME: data.PICK_UP_TIME,
      RETURN_DATE: data.RETURN_DATE,
      RETURN_TIME: data.RETURN_TIME,
      status: data.status,
    }))
    .sort(byPickUpDate);
}

async function findPendingBookings() {
  const snap = await bookingsCol().where("status", "==", "pending").get();
  // Approvals shows the documents, so these come back complete.
  const bookings = await Promise.all(snap.docs.map((d) => attachDocuments(d.ref, d.data())));
  return bookings.sort((a, b) =>
    String(b._lastUpdatedAt || "").localeCompare(String(a._lastUpdatedAt || "")),
  );
}

function addDaysIso(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

async function findBookingsInWeek(startIso) {
  const endIso = addDaysIso(startIso, 6);
  const hits = (await allBookings()).filter(({ data }) => {
    if (!isApproved(data)) return false;
    const p = data.PICK_UP_DATE || "";
    const r = data.RETURN_DATE || "";
    return (p >= startIso && p <= endIso) || (r >= startIso && r <= endIso);
  });
  const full = await Promise.all(hits.map((b) => attachDocuments(b.ref, b.data)));
  return full.sort(byPickUpDate);
}

async function findBookingsOnDate(dateIso) {
  const hits = (await allBookings()).filter(
    ({ data }) =>
      isApproved(data) &&
      (data.PICK_UP_DATE || "") <= dateIso &&
      (data.RETURN_DATE || "") >= dateIso,
  );
  const full = await Promise.all(hits.map((b) => attachDocuments(b.ref, b.data)));
  return full.sort(byPickUpDate);
}

async function findBookingsByCamera(cameraNameFromUrl) {
  const name = decodeId(cameraNameFromUrl);
  if (!name) return [];
  return (await allBookings())
    .filter(({ data }) => isApproved(data) && sameName(data.PREFERRED_CAMERA, name))
    .map((b) => partial(b.data))
    .sort(byPickUpDate);
}

async function findBookingsByAddon(addonNameFromUrl) {
  const name = decodeId(addonNameFromUrl);
  if (!name) return [];
  return (await allBookings())
    .filter(
      ({ data }) =>
        isApproved(data) &&
        (data["Please_choose_your_add-ons"] || []).some((a) => sameName(a, name)),
    )
    .map((b) => partial(b.data))
    .sort(byPickUpDate);
}

async function findBookingByResponseId(responseId) {
  const id = bookingDocId(decodeId(responseId));
  if (!id) return null;
  const ref = bookingsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return attachDocuments(ref, snap.data());
}

// ── Bookings: writes ─────────────────────────────────────────────────────────

function isRepeatRenter(payload) {
  const value = payload.REPEAT_RENTER;
  return value === true || ["true", "yes"].includes(String(value || "").trim().toLowerCase());
}

/**
 * Insert or update a submitted booking (public site, Google Form, or the
 * admin "Add Rental" modal). Mirrors the status rules /api/submit applied in
 * the MongoDB + Supabase setup: a cancelled booking stays cancelled, otherwise
 * the requested status wins over the stored one, defaulting to pending.
 */
async function upsertSubmittedBooking(payload, { source, catalog }) {
  const id = bookingDocId(payload.responseId);
  if (!id) throw new Error("responseId is required");
  const ref = bookingsCol().doc(id);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? existingSnap.data() : null;

  const status = isCancelledStatus(existing?.status)
    ? "cancelled"
    : resolveBookingStatus(existing?.status, normalizeBookingStatus(payload.status));

  const { booking: row, addons } = transformBooking(
    { ...payload, _source: source, status },
    { catalog },
  );
  const record = toMongoFormat(row, addons);
  const now = new Date().toISOString();
  if (!existing) {
    record.TIMELINE = [{ at: now, event: "submitted" }];
    if (status !== "pending") record.TIMELINE.push({ at: now, event: status });
  }
  record.responseId = String(payload.responseId).trim();
  record.REPEAT_RENTER = isRepeatRenter(payload);
  record.REPEAT_REF = record.REPEAT_RENTER ? payload.REPEAT_REF ?? null : null;
  record._lastUpdatedAt = now;
  if (existing) {
    for (const key of ADMIN_OWNED_FIELDS) delete record[key];
  } else {
    record._createdAt = now;
  }

  const documents = {};
  for (const key of DOCUMENT_FIELDS) {
    const value = record[key]?.[0];
    delete record[key];
    if (value) documents[key] = value;
  }

  const batch = db().batch();
  batch.set(ref, record, { merge: true });
  for (const [key, value] of Object.entries(documents)) {
    batch.set(ref.collection("documents").doc(key), { value });
  }
  await batch.commit();
  return { action: existing ? "updated" : "inserted", status };
}

// Firestore-only booking fields (no Supabase column), editable through PATCH.
// TIMELINE is deliberately absent: only the server appends to it.
const LIFECYCLE_FIELDS = ["UNIT_SERIAL", "RETURN_CONDITION", "RETURN_NOTES"];

/**
 * A release (out for delivery / handed to the renter) must be for an
 * approved booking and name a physical unit that isn't already out — that
 * is what lets a damaged unit be traced to whoever had it last.
 */
async function validateRelease(id, after) {
  const status = String(after.status || "").toLowerCase();
  if (status !== "approved") {
    throw new LifecycleError("Approve the booking before releasing the unit.");
  }
  const camera = findCamera(await listCameras(), after.PREFERRED_CAMERA);
  const serials = activeSerials(camera);
  if (serials.length === 0) return after.UNIT_SERIAL || null;

  const wanted = String(after.UNIT_SERIAL || "").trim().toUpperCase();
  const serial = serials.find((s) => s.toUpperCase() === wanted);
  if (!serial) {
    throw new LifecycleError(
      `Pick which ${after.PREFERRED_CAMERA} unit is being released (serial number).`,
    );
  }
  const holder = (await allBookings()).find(
    ({ ref, data }) =>
      ref.id !== id &&
      isReleased(data.FULFILLMENT_STATUS ?? null) &&
      String(data.UNIT_SERIAL || "").toUpperCase() === wanted,
  );
  if (holder) {
    throw new LifecycleError(
      `Unit ${serial} is still out with ${holder.data.FULL_NAME || "another renter"} ` +
        `(${holder.data.responseId}). Mark that rental returned first.`,
    );
  }
  return serial;
}

/** Checks that a status / unit-status change is a step the rental can take. */
async function applyLifecycle(id, before, updates) {
  if ("FULFILLMENT_STATUS" in updates) {
    updates.FULFILLMENT_STATUS = normalizeFulfillment(updates.FULFILLMENT_STATUS);
  }
  if ("UNIT_SERIAL" in updates) {
    updates.UNIT_SERIAL = String(updates.UNIT_SERIAL ?? "").trim() || null;
  }
  if ("RETURN_NOTES" in updates) {
    updates.RETURN_NOTES = String(updates.RETURN_NOTES ?? "").trim().slice(0, 500);
  }
  if ("RETURN_CONDITION" in updates && updates.RETURN_CONDITION != null) {
    updates.RETURN_CONDITION = String(updates.RETURN_CONDITION).toLowerCase();
    if (!RETURN_CONDITIONS.includes(updates.RETURN_CONDITION)) {
      throw new LifecycleError("Return condition must be good or damaged.");
    }
  }

  const after = { ...before, ...updates };
  const from = before.FULFILLMENT_STATUS ?? null;
  const to = after.FULFILLMENT_STATUS ?? null;
  const status = String(after.status || "").toLowerCase();

  const serialChanged =
    "UNIT_SERIAL" in updates && updates.UNIT_SERIAL !== (before.UNIT_SERIAL ?? null);
  if (isReleased(to) && (!isReleased(from) || serialChanged)) {
    updates.UNIT_SERIAL = await validateRelease(id, after);
    after.UNIT_SERIAL = updates.UNIT_SERIAL;
  }
  if (to === "returned" && from !== "returned") {
    if (!isReleased(from)) throw new LifecycleError("Release the unit before marking it returned.");
    if (!after.RETURN_CONDITION) updates.RETURN_CONDITION = after.RETURN_CONDITION = "good";
  }
  if (isReleased(to) && ["cancelled", "rejected", "pending"].includes(status)) {
    throw new LifecycleError("This unit is still out — mark it returned before changing the booking status.");
  }
  if (status === "completed" && String(before.status || "").toLowerCase() !== "completed" && to !== "returned") {
    throw new LifecycleError("Mark the unit returned before completing the rental.");
  }

  const events = timelineEvents(
    { status: before.status, FULFILLMENT_STATUS: from },
    { ...after, FULFILLMENT_STATUS: to },
    new Date().toISOString(),
  );
  if (events.length) updates.TIMELINE = [...(before.TIMELINE || []), ...events];
}

async function updateBookingByResponseId(responseId, fields) {
  const id = bookingDocId(decodeId(responseId));
  if (!id) return null;
  const ref = bookingsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const { "Please_choose_your_add-ons": addons, ...rest } = fields || {};
  const clean = sanitizeBookingUpdateFields(snap.get("status"), rest);

  // Same whitelist the Supabase layer used, plus the lifecycle fields:
  // documents, identifiers and the timeline are never editable through PATCH.
  const updates = {};
  for (const [key, value] of Object.entries(clean)) {
    const allowed = (FIELD_MAP[key] !== undefined && key !== "STATUS") || LIFECYCLE_FIELDS.includes(key);
    if (allowed) updates[key] = value;
  }
  if (Array.isArray(addons)) {
    updates["Please_choose_your_add-ons"] = addons.map((a) => String(a).trim()).filter(Boolean);
  }
  await applyLifecycle(id, snap.data(), updates);
  updates._lastUpdatedAt = new Date().toISOString();

  await ref.set(updates, { merge: true });
  return findBookingByResponseId(responseId);
}

async function deleteBookingByResponseId(responseId) {
  const id = bookingDocId(decodeId(responseId));
  if (!id) return false;
  const ref = bookingsCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  // Firestore does not cascade — take the documents subcollection with it.
  await db().recursiveDelete(ref);
  return true;
}

// ── Expenses ─────────────────────────────────────────────────────────────────

function expenseOut(doc) {
  return { id: doc.id, ...doc.data() };
}

async function listExpenses() {
  const snap = await db().collection("expenses").get();
  return snap.docs.map(expenseOut).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

async function createExpense({ amount, description, date }) {
  const ref = await db().collection("expenses").add({
    amount: Number(amount),
    description: String(description).trim(),
    date,
    created_at: new Date().toISOString(),
  });
  return expenseOut(await ref.get());
}

async function updateExpense(id, updates) {
  const ref = db().collection("expenses").doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (Object.keys(updates).length) await ref.update(updates);
  return expenseOut(await ref.get());
}

async function deleteExpense(id) {
  await db().collection("expenses").doc(String(id)).delete();
}

// ── Date notes ───────────────────────────────────────────────────────────────

async function getDateNote(date) {
  const snap = await db().collection("date_notes").doc(date).get();
  return snap.exists ? snap.data() : null;
}

async function upsertDateNote(date, note) {
  const data = { date, note: String(note).trim(), updated_at: new Date().toISOString() };
  await db().collection("date_notes").doc(date).set(data);
  return data;
}

async function deleteDateNote(date) {
  await db().collection("date_notes").doc(date).delete();
}

// ── Camera catalogue ─────────────────────────────────────────────────────────

function camerasCol() {
  return db().collection("cameras");
}

function cameraOut(doc) {
  return { id: doc.id, ...doc.data() };
}

function bySortOrder(a, b) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name));
}

async function listCameras() {
  const snap = await camerasCol().get();
  return snap.docs.map(cameraOut).sort(bySortOrder);
}

/** A serial number identifies one physical unit across the whole catalogue. */
function assertSerialsUnique(camera, others) {
  for (const { serial } of camera.serials || []) {
    const owner = others.find((c) =>
      (c.serials || []).some((u) => u.serial.toUpperCase() === serial.toUpperCase()),
    );
    if (owner) throw new CatalogValidationError(`Serial "${serial}" is already used by ${owner.name}.`);
  }
}

async function createCamera(input) {
  const camera = sanitizeCamera(input);
  const existing = await listCameras();
  assertSerialsUnique(camera, existing);
  if (existing.some((c) => sameName(c.name, camera.name))) {
    throw new CatalogValidationError(`There is already a camera named "${camera.name}".`);
  }
  const id = slugify(camera.name);
  if (!id) throw new CatalogValidationError("Camera name needs at least one letter or number.");
  if (input.sortOrder === undefined) {
    camera.sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1) + 1;
  }
  camera.priceHistory = [];
  camera.unitHistory = [];
  camera.updated_at = new Date().toISOString();
  const ref = camerasCol().doc(id);
  // create() fails if the id is taken (e.g. two names that slug the same).
  try {
    await ref.create(camera);
  } catch (err) {
    if (err && err.code === 6) {
      throw new CatalogValidationError(`A camera with a similar name already exists (${id}).`);
    }
    throw err;
  }
  return cameraOut(await ref.get());
}

async function updateCamera(id, input, effectiveDate) {
  const ref = camerasCol().doc(String(id));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const next = applyCameraUpdate(snap.data(), input, effectiveDate);
    const others = (await tx.get(camerasCol())).docs.filter((d) => d.id !== snap.id).map((d) => d.data());
    assertSerialsUnique(next, others);
    // A serial that was handed out must stay listed (retire it instead), or
    // its rental history would point at a unit that no longer exists.
    const kept = new Set(next.serials.map((u) => u.serial.toUpperCase()));
    const dropped = (snap.get("serials") || []).filter((u) => !kept.has(u.serial.toUpperCase()));
    if (dropped.length) {
      const used = (await tx.get(bookingsCol())).docs.find((d) =>
        dropped.some((u) => String(d.get("UNIT_SERIAL") || "").toUpperCase() === u.serial.toUpperCase()),
      );
      if (used) {
        throw new CatalogValidationError(
          `Serial "${used.get("UNIT_SERIAL")}" has rental history — untick "In service" to retire it instead of deleting it.`,
        );
      }
    }
    next.updated_at = new Date().toISOString();
    tx.set(ref, next);
    return { id: snap.id, ...next };
  });
}

async function deleteCamera(id) {
  const ref = camerasCol().doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

/** Load the default catalogue — only into an empty collection. */
async function seedCameras(defaults) {
  const existing = await camerasCol().limit(1).get();
  if (!existing.empty) {
    throw new CatalogValidationError("The catalogue already has cameras; defaults are only loaded into an empty one.");
  }
  const batch = db().batch();
  const now = new Date().toISOString();
  defaults.forEach((input, i) => {
    const camera = sanitizeCamera({ sortOrder: i, ...input }, { allowHistory: true });
    camera.priceHistory = camera.priceHistory || [];
    camera.unitHistory = camera.unitHistory || [];
    camera.updated_at = now;
    batch.set(camerasCol().doc(input.id || slugify(camera.name)), camera);
  });
  await batch.commit();
  return listCameras();
}

module.exports = {
  addDaysIso,
  DOCUMENT_FIELDS,
  bookingDocId,
  // bookings — same interface as supabaseQueries / bookingQueries
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
  upsertSubmittedBooking,
  // expenses + notes
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getDateNote,
  upsertDateNote,
  deleteDateNote,
  // catalogue
  listCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  seedCameras,
};
