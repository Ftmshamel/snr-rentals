const { isFirebase } = require("../lib/sourceName");
const { verifyRepeatRenter } = require("../lib/verifyRepeatRenter");
const {
  isCancelledStatus,
  normalizeBookingStatus,
  resolveBookingStatus,
} = require("../lib/statusRules");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return source === "manual" ? "manual" : "google_form";
}

const PUBLIC_REQUIRED_FIELDS = [
  ["FULL_NAME", "Full name"],
  ["FACEBOOK_ACCOUNT_NAME", "Facebook name"],
  ["FACEBOOK_PROFILE_LINK", "Facebook link"],
  ["CONTACT_NUMBER", "Contact number"],
  ["COMPLETE_ADDRESS", "Complete address"],
  ["TYPE_OF_TRIP", "Type of trip"],
  ["SPECIFIC_DESTINATION", "Destination"],
  ["PREFERRED_MODE", "Preferred option"],
  ["PREFERRED_CAMERA", "Preferred unit"],
  ["PICK_UP_DATE", "Pickup / delivery date"],
  ["PICK_UP_TIME", "Pickup / delivery time"],
  ["RETURN_DATE", "Return date"],
  ["RETURN_TIME", "Return time"],
];

const PUBLIC_REQUIRED_DOCS = [
  ["1st_ID", "1st valid ID"],
  ["2nd_ID", "2nd valid ID"],
  ["PROOF_OF_BILLING", "Proof of billing"],
  ["SELFIE_HOLDING_YOUR_ID's", "Selfie holding ID"],
  ["PROOF_OF_DOWNPAYMENT", "Proof of downpayment"],
];

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function hasUploadedImage(value) {
  const imageValue = Array.isArray(value) ? value[0] : value;
  return String(imageValue || "").startsWith("data:image/");
}

function isRepeatRenter(payload) {
  const value = payload.REPEAT_RENTER;
  return (
    value === true ||
    ["true", "yes"].includes(String(value || "").trim().toLowerCase())
  );
}

function validatePublicBooking(payload) {
  if (!payload.PUBLIC_BOOKING) return null;

  // Repeat renters' personal details are backfilled from their record before
  // validation; legacy records may have no Facebook fields, so those two are
  // not required of them.
  const requiredFields = isRepeatRenter(payload)
    ? PUBLIC_REQUIRED_FIELDS.filter(([key]) => !key.startsWith("FACEBOOK_"))
    : PUBLIC_REQUIRED_FIELDS;
  for (const [key, label] of requiredFields) {
    if (!hasText(payload[key])) return `${label} is required.`;
  }
  // Verified repeat renters reuse the ID documents already on record —
  // only the per-booking proof of downpayment is required from them.
  // (The repeat claim itself is re-verified against the DB in the handler.)
  const requiredDocs = isRepeatRenter(payload)
    ? PUBLIC_REQUIRED_DOCS.filter(([key]) => key === "PROOF_OF_DOWNPAYMENT")
    : PUBLIC_REQUIRED_DOCS;
  for (const [key, label] of requiredDocs) {
    if (!hasUploadedImage(payload[key])) return `${label} upload is required.`;
  }
  if (!Array.isArray(payload.Data_Privacy_Act_of_2012) || payload.Data_Privacy_Act_of_2012.length === 0) {
    return "Data privacy consent is required.";
  }
  if (!Array.isArray(payload["Terms_&_Conditions"]) || payload["Terms_&_Conditions"].length === 0) {
    return "Terms and conditions must be accepted.";
  }

  return null;
}

// Firebase mode: one write, to Firestore. The booking is priced against the
// live catalogue (the cameras the owner edits on the Catalog page).
async function submitToFirestore(payload, source) {
  const { listCameras, upsertSubmittedBooking } = require("../lib/firestoreQueries");
  const catalog = await listCameras();
  const { action } = await upsertSubmittedBooking(payload, { source, catalog });
  return { ok: true, action };
}

async function findSupabaseStatus(responseId) {
  if (!responseId) return null;
  try {
    const { getSupabaseClient } = require("../lib/supabase");
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("status")
      .eq("response_id", responseId)
      .maybeSingle();
    if (error) {
      console.error("[api/submit] Supabase status check failed:", error.message);
      return null;
    }
    return data?.status || null;
  } catch (err) {
    console.error("[api/submit] Supabase status check skipped:", err.message);
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(res);
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const payload = parseBody(req);
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  // Never trust the client's repeat-renter claim: re-check the reference
  // code against the database before waiving requirements, then backfill the
  // renter's personal details from their record so the form doesn't have to
  // re-collect them. Runs BEFORE validation so backfilled fields count.
  if (payload.PUBLIC_BOOKING && isRepeatRenter(payload)) {
    try {
      const repeatCheck = await verifyRepeatRenter(payload.REPEAT_REF);
      if (!repeatCheck.verified) {
        return res.status(400).json({
          ok: false,
          error:
            "Repeat renter verification failed. Please re-verify or upload the full requirements.",
        });
      }
      payload.REPEAT_RENTER = true;
      payload.REPEAT_REF = repeatCheck.responseId;
      if (!hasText(payload.FULL_NAME)) payload.FULL_NAME = repeatCheck.fullName;
      if (!hasText(payload.FACEBOOK_ACCOUNT_NAME)) {
        payload.FACEBOOK_ACCOUNT_NAME = repeatCheck.facebookName;
      }
      if (!hasText(payload.FACEBOOK_PROFILE_LINK)) {
        payload.FACEBOOK_PROFILE_LINK = repeatCheck.facebookLink;
      }
      if (!hasText(payload.CONTACT_NUMBER)) {
        payload.CONTACT_NUMBER = repeatCheck.contactNumber;
      }
      if (!hasText(payload.COMPLETE_ADDRESS)) {
        payload.COMPLETE_ADDRESS = repeatCheck.address;
      }
    } catch (err) {
      console.error("[api/submit] repeat renter check failed:", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  const publicValidationError = validatePublicBooking(payload);
  if (publicValidationError) {
    return res.status(400).json({ ok: false, error: publicValidationError });
  }

  if (isFirebase()) {
    if (!String(payload.responseId || "").trim()) {
      return res.status(400).json({ ok: false, error: "responseId is required" });
    }
    try {
      const result = await submitToFirestore(payload, normalizeSource(payload._source));
      return res.status(200).json(result);
    } catch (err) {
      console.error("[api/submit firebase]", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  // ── Legacy: DATASOURCE=supabase / mongodb ──────────────────────────────────
  // Loaded here, not at the top, so firebase mode never touches these stores.
  const { getDb } = require("../lib/mongo");
  const { mirrorBookingToSupabase } = require("../lib/mirrorToSupabase");

  try {
    const normalizedStatus = normalizeBookingStatus(payload.status);
    const source = normalizeSource(payload._source);

    const db = await getDb();
    const collectionName = process.env.MONGODB_COLLECTION || "form_submissions";
    const collection = db.collection(collectionName);

    const existing = await collection.findOne(
      { responseId: payload.responseId },
      { projection: { status: 1 } },
    );
    const supabaseStatus = await findSupabaseStatus(payload.responseId);
    const wasCancelled =
      isCancelledStatus(existing?.status) || isCancelledStatus(supabaseStatus);
    const effectiveStatus = wasCancelled
      ? "cancelled"
      : resolveBookingStatus(
          existing?.status || supabaseStatus,
          normalizedStatus,
        );

    // CHANGE THIS: Use responseId as the unique filter
    const filter = { responseId: payload.responseId };
    const setPayload = {
      ...payload,
      status: effectiveStatus,
      _lastUpdatedAt: new Date(),
      _source: source,
    };

    const result = await collection.updateOne(
      filter,
      { $set: setPayload },
      { upsert: true },
    );

    const action = result.upsertedCount > 0 ? "inserted" : "updated";

    // Mirror to Supabase. MongoDB is the write target, but the admin panel
    // reads Supabase — so a booking that fails to mirror is invisible there
    // even though the renter got a confirmation. Retries handle the transient
    // failures that caused three bookings to go missing in Sept 2026; if it
    // still fails the booking is FLAGGED on the Mongo doc so the admin can
    // surface it, rather than the error disappearing into a function log.
    const mirror = await mirrorBookingToSupabase({
      ...payload,
      _source: source,
      status: effectiveStatus,
    });

    if (mirror.ok) {
      // Clear any flag from an earlier failed attempt at this booking.
      await collection.updateOne(filter, {
        $unset: { _mirrorFailed: "", _mirrorError: "", _mirrorFailedAt: "" },
      });
    } else {
      console.error(
        `[api/submit] Supabase mirror failed after ${mirror.attempts} attempts ` +
          `for ${payload.responseId}: ${mirror.error}`,
      );
      await collection.updateOne(filter, {
        $set: {
          _mirrorFailed: true,
          _mirrorError: mirror.error,
          _mirrorFailedAt: new Date(),
        },
      });
    }

    // The booking is saved either way — never reject a real booking because
    // the mirror is down. `mirrored` lets the caller know it needs attention.
    return res.status(200).json({ ok: true, action, mirrored: mirror.ok });
  } catch (err) {
    console.error("[api/submit]", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
