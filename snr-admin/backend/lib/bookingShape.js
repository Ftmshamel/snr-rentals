// The booking shape the admin frontend works with (SCREAMING_SNAKE_CASE, as
// the original Google Form / MongoDB documents were), and the mapping from it
// to the Supabase columns. Pure functions — no database client is loaded here,
// so both supabaseQueries and firestoreQueries can share them.

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

module.exports = { toMongoFormat, FIELD_MAP };
