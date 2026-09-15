/**
 * One-time migration script: MongoDB form_submissions → Supabase bookings
 *
 * Usage:
 *   node backend/scripts/migrate-to-supabase.js
 *
 * Required env vars (add to backend/.env before running):
 *   MONGODB_URI         — your existing MongoDB connection string
 *   SUPABASE_URL        — from Supabase Dashboard > Settings > API
 *   SUPABASE_SERVICE_KEY — "service_role" secret key (NOT the anon key)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { MongoClient } = require("mongodb");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase client (service role bypasses RLS) ──────────────────────────────
const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const supabaseKey = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "5/20/2026 12:54:54" → ISO string, or null if unparseable */
function parseTimestamp(raw) {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/** ["some value"] → true | [] or null → null */
function arrayToBoolean(arr) {
  if (!Array.isArray(arr)) return null;
  if (arr.length === 0) return null;
  return true;
}

/** ["fileId"] → "fileId" | [] or null → null */
function firstOrNull(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0] ?? null;
}

/** Normalize status to lowercase. Outdated docs used uppercase "COMPLETED". */
function normalizeStatus(raw) {
  if (!raw) return "pending";
  return String(raw).toLowerCase();
}

/**
 * Parse add-ons. Two form layouts exist:
 *   legacy → single "Please choose your add-ons" column (array or CSV string)
 *   current → one column per camera, e.g. "Need any add-ons? (CANON G7X MARK III)"
 * On the current form, switching cameras leaves the old camera's column filled,
 * so only the column matching the selected camera is authoritative. "None" =
 * no add-ons.
 */
const ADDON_CAMERA_NAMES = [
  "DJI Osmo 360", "DJI OSMO POCKET 3", "DJI Osmo Nano",
  "INSTA360 ACE PRO 2", "CANON G7X MARK III", "FUJIFILM X-T100",
];

function normalizeForMatch(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function coerceAddonList(raw) {
  let items = [];
  if (Array.isArray(raw)) items = raw.map((a) => String(a).trim());
  else if (typeof raw === "string") items = raw.split(",").map((a) => a.trim());
  return items.filter((a) => a && a.toLowerCase() !== "none");
}

function parseAddons(doc) {
  if (!doc || typeof doc !== "object") return [];

  const addonKeys = Object.keys(doc).filter((k) => /add[-_ ]?ons/i.test(k));
  const camKey = normalizeForMatch(doc.PREFERRED_CAMERA);

  if (camKey) {
    const match = addonKeys.find((k) => normalizeForMatch(k).includes(camKey));
    if (match) return coerceAddonList(doc[match]);
  }
  const looksPerCamera = addonKeys.some((k) => {
    const nk = normalizeForMatch(k);
    return ADDON_CAMERA_NAMES.some((c) => nk.includes(normalizeForMatch(c)));
  });
  if (looksPerCamera) return [];

  const explicit = [
    doc["Please_choose_your_add-ons"],
    doc["Please_choose_your_add_ons"],
    doc["ADDONS"],
    doc["ADD_ONS"],
  ];
  for (const raw of explicit) {
    const parsed = coerceAddonList(raw);
    if (parsed.length) return parsed;
  }
  for (const k of addonKeys) {
    const parsed = coerceAddonList(doc[k]);
    if (parsed.length) return parsed;
  }
  return [];
}

/** Transform one MongoDB document into the Supabase row shape */
function transform(doc) {
  const booking = {
    response_id:           doc.responseId,
    submitted_at:          parseTimestamp(doc.Timestamp),

    full_name:             (doc.FULL_NAME || "").trim() || "N/A",
    facebook_profile_link: doc.FACEBOOK_PROFILE_LINK   ?? null,
    facebook_account_name: doc.FACEBOOK_ACCOUNT_NAME   ?? null,
    contact_number:        doc.CONTACT_NUMBER           ?? null,
    complete_address:      doc.COMPLETE_ADDRESS         ?? null,

    type_of_trip:          doc.TYPE_OF_TRIP             ?? null,
    specific_destination:  doc.SPECIFIC_DESTINATION     ?? null,
    pick_up_date:          doc.PICK_UP_DATE,
    pick_up_time:          doc.PICK_UP_TIME || null,
    return_date:           doc.RETURN_DATE,
    return_time:           doc.RETURN_TIME || null,
    preferred_mode:        doc.PREFERRED_MODE           ?? null,
    preferred_camera:      doc.PREFERRED_CAMERA,

    rental_fee:            doc.RENTAL_FEE               ?? null,
    status:                normalizeStatus(doc.status ?? doc.STATUS),

    data_privacy_consent:  arrayToBoolean(doc.Data_Privacy_Act_of_2012),
    terms_consent:         arrayToBoolean(doc["Terms_&_Conditions"]),

    gov_id_1:              firstOrNull(doc["1st_ID"]),
    gov_id_2:              firstOrNull(doc["2nd_ID"]),
    proof_of_billing:      firstOrNull(doc.PROOF_OF_BILLING),
    selfie_with_id:        firstOrNull(doc["SELFIE_HOLDING_YOUR_ID's"]),
    proof_of_downpayment:  firstOrNull(doc.PROOF_OF_DOWNPAYMENT),

    source:                doc._source ?? "unknown",
    updated_at:            doc._lastUpdatedAt
                             ? new Date(doc._lastUpdatedAt).toISOString()
                             : new Date().toISOString(),
  };

  const addons = parseAddons(doc);

  return { booking, addons };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const missing = ["MONGODB_URI", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    process.exit(1);
  }

  // Diagnose Supabase connection before touching MongoDB
  console.log("Testing Supabase connection...");
  console.log("  URL:", supabaseUrl);
  console.log("  Key starts with:", supabaseKey.slice(0, 20) + "...");
  const { error: pingError } = await supabase.from("bookings").select("id").limit(1);
  if (pingError) {
    console.error("Supabase connection failed:", pingError.message);
    console.error("Full error:", JSON.stringify(pingError, null, 2));
    process.exit(1);
  }
  console.log("Supabase connection OK.\n");

  // Connect to MongoDB
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "snr_rentals");
  const collection = db.collection(process.env.MONGODB_COLLECTION || "form_submissions");

  const docs = await collection.find({}).toArray();
  console.log(`Found ${docs.length} documents in MongoDB.`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    if (!doc.responseId || !doc.PICK_UP_DATE || !doc.RETURN_DATE || !doc.PREFERRED_CAMERA) {
      console.warn(`  SKIP (missing required fields): ${doc.responseId ?? doc._id}`);
      skipped++;
      continue;
    }

    const { booking, addons } = transform(doc);

    // Upsert booking row (safe to re-run)
    const { data, error } = await supabase
      .from("bookings")
      .upsert(booking, { onConflict: "response_id" })
      .select("id")
      .single();

    if (error) {
      console.error(`  ERROR inserting ${booking.response_id}:`, error.message);
      errors++;
      continue;
    }

    // Insert add-ons (delete first so re-runs stay idempotent)
    if (addons.length > 0) {
      await supabase.from("booking_addons").delete().eq("booking_id", data.id);
      await supabase.from("booking_addons").insert(
        addons.map((addon_name) => ({ booking_id: data.id, addon_name }))
      );
    }

    console.log(`  OK  ${booking.response_id} (${booking.full_name})`);
    inserted++;
  }

  await client.close();

  console.log("\n── Migration complete ──────────────────────");
  console.log(`  Inserted/updated : ${inserted}`);
  console.log(`  Skipped          : ${skipped}`);
  console.log(`  Errors           : ${errors}`);
}

// Guard: this file only runs when invoked directly (node scripts/…).
// Without it, anything that require()s this module — a linter, a test
// harness, an editor's analysis — would execute it against the live
// database.
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
