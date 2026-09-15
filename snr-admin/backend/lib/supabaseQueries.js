const { getSupabaseClient } = require("./supabase");
const { sanitizeBookingUpdateFields } = require("./statusRules");

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDaysIso(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** Convert a Supabase row + addon rows → MongoDB-shaped object the frontend expects */
function toMongoFormat(row, addons = []) {
  if (!row) return null;
  return {
    responseId: row.response_id,
    Timestamp: row.submitted_at,
    FULL_NAME: row.full_name,
    FACEBOOK_PROFILE_LINK: row.facebook_profile_link,
    FACEBOOK_ACCOUNT_NAME: row.facebook_account_name,
    CONTACT_NUMBER: row.contact_number,
    COMPLETE_ADDRESS: row.complete_address,
    TYPE_OF_TRIP: row.type_of_trip,
    SPECIFIC_DESTINATION: row.specific_destination,
    PICK_UP_DATE: row.pick_up_date,
    PICK_UP_TIME: row.pick_up_time,
    RETURN_DATE: row.return_date,
    RETURN_TIME: row.return_time,
    PREFERRED_MODE: row.preferred_mode,
    PREFERRED_CAMERA: row.preferred_camera,
    RENTAL_FEE: row.rental_fee,
    SECURITY_DEPOSIT: row.security_deposit ?? null,
    TOTAL_PAYABLE_BEFORE_RELEASE: row.total_payable_before_release ?? null,
    HALF_DAY_LATE: row.half_day_late ?? false,
    HALF_DAY_EARLY: row.half_day_early ?? false,
    NOTES: row.notes ?? null,
    DOWNPAYMENT_PAID: row.downpayment_paid ?? null,
    FULFILLMENT_STATUS: row.fulfillment_status ?? null,
    REPEAT_RENTER: row.repeat_renter ?? false,
    REPEAT_REF: row.repeat_ref ?? null,
    status: row.status,
    CONTRACT_CAMERA: row.contract_camera ?? null,
    CONTRACT_TERMS_AND_CONDITIONS: row.contract_terms ?? [],
    RENTER_E_SIGNATURE: row.renter_e_signature ? [row.renter_e_signature] : [],
    E_SIGNATURE_DATE: row.e_signature_date ?? null,
    "Please_choose_your_add-ons": addons.map((a) =>
      typeof a === "string" ? a : a.addon_name,
    ),
    "1st_ID": row.gov_id_1 ? [row.gov_id_1] : [],
    "2nd_ID": row.gov_id_2 ? [row.gov_id_2] : [],
    PROOF_OF_BILLING: row.proof_of_billing ? [row.proof_of_billing] : [],
    "SELFIE_HOLDING_YOUR_ID's": row.selfie_with_id ? [row.selfie_with_id] : [],
    PROOF_OF_DOWNPAYMENT: row.proof_of_downpayment
      ? [row.proof_of_downpayment]
      : [],
    Data_Privacy_Act_of_2012: row.data_privacy_consent
      ? ["YES, I understand that my data will be used to process my booking"]
      : [],
    "Terms_&_Conditions": row.terms_consent
      ? ["I have read and understood the terms and conditions of S&R Rentals."]
      : [],
    _source: row.source,
    _createdAt: row.created_at,
    _lastUpdatedAt: row.updated_at,
  };
}

/** Extract booking_addons from a joined row and return a clean MongoDB-shaped object */
function fmt(rowWithAddons) {
  if (!rowWithAddons) return null;
  const { booking_addons, ...row } = rowWithAddons;
  return toMongoFormat(row, booking_addons || []);
}

// ── List projection ───────────────────────────────────────────────────────────
//
// The uploaded documents (IDs, selfie, billing, downpayment proof, signature)
// are stored inline as base64 data URLs, so `select("*")` over the whole table
// returns tens of MB — ~98% of it images that no list view renders. Every
// list-shaped query therefore selects columns explicitly and omits them.
//
// Rows from these queries carry `_partial: true`. Anything that needs the
// documents for one booking must fetch that booking on its own via
// findBookingByResponseId (GET /api/bookings/:responseId), which selects "*".
//
// Keep this list in sync with toMongoFormat above when adding a column. Note
// that toMongoFormat also reads repeat_renter/repeat_ref, which are not in the
// bookings table — `select("*")` tolerated that silently, an explicit list does
// not, so they are omitted here rather than causing every list query to fail.
const LIST_COLUMNS = [
  "response_id",
  "submitted_at",
  "full_name",
  "facebook_profile_link",
  "facebook_account_name",
  "contact_number",
  "complete_address",
  "type_of_trip",
  "specific_destination",
  "pick_up_date",
  "pick_up_time",
  "return_date",
  "return_time",
  "preferred_mode",
  "preferred_camera",
  "rental_fee",
  "security_deposit",
  "total_payable_before_release",
  "half_day_late",
  "half_day_early",
  "notes",
  "downpayment_paid",
  "fulfillment_status",
  "status",
  "contract_camera",
  "contract_terms",
  "e_signature_date",
  "data_privacy_consent",
  "terms_consent",
  "source",
  "created_at",
  "updated_at",
].join(",");

const LIST_SELECT = `${LIST_COLUMNS},booking_addons(addon_name)`;

/** Like fmt(), but flags the row as missing its document columns. */
function fmtPartial(rowWithAddons) {
  const booking = fmt(rowWithAddons);
  if (booking) booking._partial = true;
  return booking;
}

/** Convert MongoDB-style field names to Supabase column names for PATCH operations */
const FIELD_MAP = {
  FULL_NAME: "full_name",
  FACEBOOK_PROFILE_LINK: "facebook_profile_link",
  FACEBOOK_ACCOUNT_NAME: "facebook_account_name",
  CONTACT_NUMBER: "contact_number",
  COMPLETE_ADDRESS: "complete_address",
  TYPE_OF_TRIP: "type_of_trip",
  SPECIFIC_DESTINATION: "specific_destination",
  PICK_UP_DATE: "pick_up_date",
  PICK_UP_TIME: "pick_up_time",
  RETURN_DATE: "return_date",
  RETURN_TIME: "return_time",
  PREFERRED_MODE: "preferred_mode",
  PREFERRED_CAMERA: "preferred_camera",
  RENTAL_FEE: "rental_fee",
  SECURITY_DEPOSIT: "security_deposit",
  TOTAL_PAYABLE_BEFORE_RELEASE: "total_payable_before_release",
  HALF_DAY_LATE: "half_day_late",
  HALF_DAY_EARLY: "half_day_early",
  NOTES: "notes",
  DOWNPAYMENT_PAID: "downpayment_paid",
  FULFILLMENT_STATUS: "fulfillment_status",
  status: "status",
  STATUS: "status",
  CONTRACT_CAMERA: "contract_camera",
  CONTRACT_TERMS_AND_CONDITIONS: "contract_terms",
  E_SIGNATURE_DATE: "e_signature_date",
  // RENTER_E_SIGNATURE intentionally omitted: the frontend sends it as
  // [dataUrl] (matching the other doc-upload fields), but this column is
  // plain TEXT, not an array — same reason gov_id_1 etc. aren't here either.
  // It's set once at submission via transformBooking()'s firstOrNull().
};

function fromMongoFields(fields) {
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    if (FIELD_MAP[key] !== undefined) result[FIELD_MAP[key]] = val;
  }
  return result;
}

// ── Excluded statuses (mirrors MongoDB APPROVED_FILTER) ───────────────────────
function approvedFilter(query) {
  return query
    .neq("status", "pending")
    .neq("status", "rejected")
    .neq("status", "cancelled");
}

// ── Query functions ───────────────────────────────────────────────────────────

async function findAllBookingsSorted() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("bookings")
    .select(LIST_SELECT)
    .order("pick_up_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(fmtPartial);
}

async function findAvailabilityBookings() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("bookings")
    .select(
      "preferred_camera,pick_up_date,pick_up_time,return_date,return_time,status",
    )
    .order("pick_up_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    PREFERRED_CAMERA: row.preferred_camera,
    PICK_UP_DATE: row.pick_up_date,
    PICK_UP_TIME: row.pick_up_time,
    RETURN_DATE: row.return_date,
    RETURN_TIME: row.return_time,
    status: row.status,
  }));
}

async function findPendingBookings() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("bookings")
    .select("*, booking_addons(addon_name)")
    .eq("status", "pending")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(fmt);
}

async function findBookingsInWeek(startIso) {
  const endIso = addDaysIso(startIso, 6);
  const sb = getSupabaseClient();
  const { data, error } = await approvedFilter(
    sb
      .from("bookings")
      .select("*, booking_addons(addon_name)")
      .or(
        `and(pick_up_date.gte.${startIso},pick_up_date.lte.${endIso}),` +
          `and(return_date.gte.${startIso},return_date.lte.${endIso})`,
      )
      .order("pick_up_date", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return (data || []).map(fmt);
}

async function findBookingsOnDate(dateIso) {
  const sb = getSupabaseClient();
  const { data, error } = await approvedFilter(
    sb
      .from("bookings")
      .select("*, booking_addons(addon_name)")
      .lte("pick_up_date", dateIso)
      .gte("return_date", dateIso)
      .order("pick_up_date", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return (data || []).map(fmt);
}

async function findBookingsByCamera(cameraNameFromUrl) {
  const decoded = decodeURIComponent(cameraNameFromUrl || "").trim();
  if (!decoded) return [];
  const sb = getSupabaseClient();
  const { data, error } = await approvedFilter(
    sb
      .from("bookings")
      .select(LIST_SELECT)
      .ilike("preferred_camera", decoded)
      .order("pick_up_date", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return (data || []).map(fmtPartial);
}

async function findBookingsByAddon(addonNameFromUrl) {
  const decoded = decodeURIComponent(addonNameFromUrl || "").trim();
  if (!decoded) return [];
  const sb = getSupabaseClient();

  // Get booking IDs that have this add-on
  const { data: addonRows, error: addonErr } = await sb
    .from("booking_addons")
    .select("booking_id")
    .ilike("addon_name", decoded);
  if (addonErr) throw new Error(addonErr.message);
  if (!addonRows || addonRows.length === 0) return [];

  const ids = addonRows.map((r) => r.booking_id);
  const { data, error } = await approvedFilter(
    sb
      .from("bookings")
      .select(LIST_SELECT)
      .in("id", ids)
      .order("pick_up_date", { ascending: true }),
  );
  if (error) throw new Error(error.message);
  return (data || []).map(fmtPartial);
}

async function findBookingByResponseId(responseId) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return null;
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("bookings")
    .select("*, booking_addons(addon_name)")
    .eq("response_id", decoded)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return fmt(data);
}

async function updateBookingByResponseId(responseId, fields) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return null;
  const sb = getSupabaseClient();

  // Find booking id
  const { data: existing, error: findErr } = await sb
    .from("bookings")
    .select("id, status")
    .eq("response_id", decoded)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!existing) return null;

  // Strip non-updatable fields
  const {
    _id,
    responseId: _rid,
    _source,
    _lastUpdatedAt,
    "Please_choose_your_add-ons": addons,
    ...rest
  } = fields;
  const supabaseFields = fromMongoFields(
    sanitizeBookingUpdateFields(existing.status, rest),
  );

  if (Object.keys(supabaseFields).length > 0) {
    const { error: updateErr } = await sb
      .from("bookings")
      .update(supabaseFields)
      .eq("id", existing.id);
    if (updateErr) throw new Error(updateErr.message);
  }

  // Sync add-ons if provided
  if (Array.isArray(addons)) {
    await sb.from("booking_addons").delete().eq("booking_id", existing.id);
    if (addons.length > 0) {
      await sb
        .from("booking_addons")
        .insert(
          addons.map((addon_name) => ({ booking_id: existing.id, addon_name })),
        );
    }
  }

  return findBookingByResponseId(responseId);
}

async function deleteBookingByResponseId(responseId) {
  const decoded = decodeURIComponent(responseId || "").trim();
  if (!decoded) return false;
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("bookings")
    .delete()
    .eq("response_id", decoded);
  return !error;
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
