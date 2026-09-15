/**
 * Restores bookings that exist in MongoDB but never reached Supabase.
 *
 * /api/submit writes MongoDB first and then mirrors to Supabase "best-effort":
 * if the mirror throws, it is only console.error'd and the submission still
 * succeeds. The renter gets a confirmation, the booking is real, but the admin
 * panel — which reads Supabase (DATASOURCE=supabase) — never sees it. The
 * booking is invisible: no Approvals entry, no schedule slot, no revenue.
 *
 * This replays that failed mirror. It runs the same transformBooking() the
 * submit route uses, so each row lands exactly as it would have originally,
 * including add-ons and the fee the rate card gives for its pick-up date.
 *
 * By default it only considers documents created in the last N days
 * (--days=N, default 30) so the historical test/dummy rows that were
 * deliberately deleted from Supabase are not resurrected. Pass explicit
 * --ref=<responseId> arguments to restore specific bookings instead.
 *
 * Usage:
 *   node scripts/restore-unmirrored-bookings.js                    # dry run
 *   node scripts/restore-unmirrored-bookings.js --commit
 *   node scripts/restore-unmirrored-bookings.js --ref=A --ref=B --commit
 *
 * Safe to re-run: upserts on response_id, so an already-restored booking is
 * simply rewritten with the same values.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");
const { MongoClient } = require("mongodb");
const { transformBooking } = require("../lib/transformBooking");

const peso = (n) => (n == null ? "null" : "PHP " + Number(n).toLocaleString());

async function main() {
  const commit = process.argv.includes("--commit");
  const refs = process.argv.filter((a) => a.startsWith("--ref=")).map((a) => a.slice(6));
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.slice(7)) : 30;

  const supabase = createClient(
    (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
    (process.env.SUPABASE_SERVICE_KEY || "").trim(),
  );

  const { data: sbRows, error } = await supabase.from("bookings").select("response_id");
  if (error) { console.error("Supabase read failed:", error.message); process.exit(1); }
  const sbIds = new Set(sbRows.map((r) => r.response_id));

  const client = new MongoClient(process.env.MONGODB_URI.trim(), { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB.trim()).collection(process.env.MONGODB_COLLECTION.trim());
  const all = await col.find({}).toArray();
  await client.close();

  const cutoff = new Date(Date.now() - days * 864e5);
  const orphans = all
    .filter((d) => !sbIds.has(d.responseId))
    .map((d) => ({ d, born: d._id.getTimestamp() }))
    .filter(({ d, born }) => (refs.length ? refs.includes(d.responseId) : born > cutoff))
    .sort((a, b) => a.born - b.born);

  console.log("── Restore un-mirrored bookings ─────────────────────────");
  console.log("  scope        :", refs.length ? `${refs.length} explicit ref(s)` : `created in the last ${days} days`);
  console.log("  Supabase rows:", sbRows.length, "| Mongo docs:", all.length);
  console.log("  to restore   :", orphans.length);
  console.log();

  if (!orphans.length) { console.log("Nothing to restore."); return; }

  const prepared = [];
  for (const { d, born } of orphans) {
    // Replay exactly what submit.js would have mirrored.
    const { booking, addons } = await transformBooking({ ...d, _source: d._source, status: d.status });
    prepared.push({ d, born, booking, addons });
    console.log("  ", born.toISOString().slice(0, 19), "|", d.responseId);
    console.log("     ", String(d.FACEBOOK_ACCOUNT_NAME || d.FULL_NAME || "—").slice(0, 28),
      "|", d.PREFERRED_CAMERA, "|", d.PICK_UP_DATE, "->", d.RETURN_DATE);
    console.log("      status", booking.status, "| fee in Mongo", peso(d.RENTAL_FEE),
      "-> will store", peso(booking.rental_fee),
      d.RENTAL_FEE == null && booking.rental_fee != null ? "  (derived from the rate card)" : "");
    if (addons.length) console.log("      add-ons:", addons.join(", "));
    console.log();
  }

  if (!commit) {
    console.log("DRY RUN — nothing written. Re-run with --commit to apply.");
    return;
  }

  const runId = new Date().toISOString();
  const backupDir = path.join(__dirname, "../../database-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const applied = [];

  for (const { d, booking, addons } of prepared) {
    const { data: up, error: upErr } = await supabase
      .from("bookings")
      .upsert(booking, { onConflict: "response_id" })
      .select("id")
      .single();
    if (upErr) { console.error("  FAILED", d.responseId, upErr.message); continue; }

    if (addons.length) {
      await supabase.from("booking_addons").delete().eq("booking_id", up.id);
      const { error: aErr } = await supabase
        .from("booking_addons")
        .insert(addons.map((addon_name) => ({ booking_id: up.id, addon_name })));
      if (aErr) console.error("  add-on insert failed for", d.responseId, aErr.message);
    }
    applied.push({
      response_id: d.responseId, supabase_id: up.id,
      name: d.FACEBOOK_ACCOUNT_NAME || d.FULL_NAME || null,
      camera: d.PREFERRED_CAMERA, pick_up_date: d.PICK_UP_DATE, return_date: d.RETURN_DATE,
      status: booking.status, rental_fee: booking.rental_fee, addons,
    });
    console.log("  restored:", d.responseId);
  }

  fs.writeFileSync(
    path.join(backupDir, `restore-unmirrored-${runId.replace(/[:.]/g, "-")}.json`),
    JSON.stringify({ run_id: runId, script: "restore-unmirrored-bookings.js", count: applied.length, applied }, null, 2),
  );
  console.log();
  console.log("Restored", applied.length, "of", prepared.length);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
