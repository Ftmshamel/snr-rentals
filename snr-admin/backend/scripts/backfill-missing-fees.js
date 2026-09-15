/**
 * Fills rental_fee for bookings that have none.
 *
 * These are real bookings — Google Form submissions and a few manual entries —
 * whose fee was wiped by a bulk run on 2026-09-01. Analytics counts a null fee
 * as PHP 0, so they drag revenue down without appearing anywhere as missing.
 *
 * IMPORTANT — these figures are RECONSTRUCTED, not recovered. The original
 * amounts are gone. This computes what the rate card in force on each
 * booking's pick-up date says the rental should have cost. Any booking that
 * was discounted or custom-priced will come back at list price.
 *
 * Billing shape: the historical data is not consistent about whether add-ons
 * were charged (May-June bookings are camera-only; July-August mostly include
 * them), so the rule is chosen explicitly rather than guessed per booking:
 *
 *   --camera-only   (default) camera day-rate x days. Under-states rather
 *                   than over-states, and matches the dominant pattern in
 *                   June, which is where most of these sit.
 *   --with-addons   camera + add-ons x days.
 *
 * The rate itself is always the one in force on that booking's pick-up date
 * (see priceHistory in frontend/src/data/cameras.js), never today's.
 *
 * Usage:
 *   node scripts/backfill-missing-fees.js                  # dry run
 *   node scripts/backfill-missing-fees.js --commit         # writes
 *   node scripts/backfill-missing-fees.js --with-addons --commit
 *
 * Safe to re-run: only touches rows whose rental_fee is still NULL.
 * Writes Supabase + the MongoDB mirror, and saves a backup for rollback.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");
const { MongoClient } = require("mongodb");

const RATE_CARD_CHANGE_DATE = "2026-08-20";
const EXCLUDED_STATUSES = ["rejected", "cancelled"];

const CURRENT = {
  "DJI OSMO 360":       [[2,550],[4,500],[null,450]],
  "DJI OSMO POCKET 3":  [[2,550],[4,500],[null,450]],
  "DJI OSMO NANO":      [[2,500],[4,450],[null,400]],
  "INSTA360 ACE PRO 2": [[2,550],[4,500],[null,450]],
  "FUJIFILM X-T100":    [[2,550],[4,500],[null,450]],
  "CANON G7X MARK III": [[2,600],[4,550],[null,500]],
  "CANON EOS R50":      [[2,600],[4,550],[null,500]],
};
// Rates before RATE_CARD_CHANGE_DATE — 2 bands. The R50 has no entry: it
// joined the lineup after the change, so CURRENT always applies to it.
const HISTORIC = {
  "DJI OSMO 360":       [[3,550],[null,500]],
  "DJI OSMO POCKET 3":  [[3,550],[null,500]],
  "DJI OSMO NANO":      [[3,500],[null,450]],
  "INSTA360 ACE PRO 2": [[3,550],[null,500]],
  "FUJIFILM X-T100":    [[3,600],[null,550]],
  "CANON G7X MARK III": [[3,700],[null,650]],
};
const ADDON_RATES = {
  "DJI OSMO 360": { "DOUBLE CRAB CLAMP":40,"LONG INVISIBLE STICK (3 METERS)":50,"BULLET TIME TRIPOD":40,"QUADPOD STAND":40,"256GB SD CARD":60,"512GB SD CARD":80,"EXTRA 2 BATTERIES":80 },
  "DJI OSMO POCKET 3": { "512GB SD CARD":80,"EXTENDED BATTERY HANDLE":50,"MINI MIC":50,"MAGNETIC MOUNT":50,"QUADPOD STAND":40,"256GB SD CARD":60 },
  "DJI OSMO NANO": {},
  "INSTA360 ACE PRO 2": { "DOUBLE CRAB CLAMP":40,"DIVE CASE":80,"MAGNETIC NECK MOUNT":40,"QUADPOD STAND":40,"256GB SD CARD":60,"512GB SD CARD":80,"EXTRA ACEPRO BATTERY":80 },
  "FUJIFILM X-T100": { "EXTRA X-T100 BATTERY":50,"EXTRA BATTERY":50,"CAMERA TRIPOD":50,"MINI TRIPOD":40,"128GB SD CARD":50,"25MM F1.8 PRIME LENS":150,"85MM F1.8 PRIME LENS":200 },
  "CANON G7X MARK III": { "EXTRA G7X BATTERY":50,"EXTRA BATTERY":50,"CAMERA TRIPOD":50,"MINI TRIPOD":40,"128GB SD CARD":50 },
  "CANON EOS R50": { "EXTRA R50 BATTERY":50,"EXTRA BATTERY":50,"CAMERA TRIPOD":50,"MINI TRIPOD":40,"128GB SD CARD":50 },
};

const norm = (s) => (s || "").toUpperCase().trim();
const peso = (n) => "PHP " + Number(n).toLocaleString();

function rateFor(camera, days, pickUpDate) {
  const key = norm(camera);
  const card = pickUpDate < RATE_CARD_CHANGE_DATE && HISTORIC[key] ? HISTORIC[key] : CURRENT[key];
  if (!card) return null;
  for (const [max, price] of card) if (max === null || days <= max) return price;
  return null;
}

function rentalDays(b) {
  if (!b.pick_up_date || !b.return_date) return null;
  const s = new Date(b.pick_up_date + "T00:00:00");
  const e = new Date(b.return_date + "T00:00:00");
  if (isNaN(s) || isNaN(e)) return null;
  return Math.max(Math.round((e - s) / 86400000), 1);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const withAddons = process.argv.includes("--with-addons");
  const rule = withAddons ? "camera + add-ons" : "camera-only";

  const supabase = createClient(
    (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
    (process.env.SUPABASE_SERVICE_KEY || "").trim(),
  );

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id,response_id,full_name,facebook_account_name,preferred_camera,pick_up_date,return_date,rental_fee,status,source,half_day_late,half_day_early");
  if (error) { console.error("Fetch failed:", error.message); process.exit(1); }

  const { data: addonRows } = await supabase.from("booking_addons").select("booking_id,addon_name");
  const addonsBy = {};
  for (const a of addonRows || []) (addonsBy[a.booking_id] ||= []).push(a.addon_name);

  const candidates = [];
  const skipped = [];
  for (const b of bookings) {
    if (b.rental_fee != null) continue;
    if (EXCLUDED_STATUSES.includes((b.status || "").toLowerCase())) continue;
    const days = rentalDays(b);
    if (!days) { skipped.push({ b, why: "missing/invalid dates" }); continue; }
    const rate = rateFor(b.preferred_camera, days, b.pick_up_date);
    if (rate == null) { skipped.push({ b, why: `unknown camera "${b.preferred_camera}"` }); continue; }

    const table = ADDON_RATES[norm(b.preferred_camera)] || {};
    const names = addonsBy[b.id] || [];
    const unknownAddons = names.filter((n) => table[norm(n)] === undefined);
    const addonPerDay = names.reduce((s, n) => s + (table[norm(n)] || 0), 0);
    const effDays = days + (b.half_day_late ? 0.5 : 0) - (b.half_day_early ? 0.5 : 0);
    const fee = Math.round(rate * effDays + (withAddons ? addonPerDay * effDays : 0));

    candidates.push({ b, days, effDays, rate, addonPerDay, addonNames: names, unknownAddons, fee });
  }

  const total = candidates.reduce((s, c) => s + c.fee, 0);
  const counted = bookings.filter((b) => b.rental_fee != null && !["pending", "rejected", "cancelled"].includes((b.status || "").toLowerCase()));
  const recorded = counted.reduce((s, b) => s + Number(b.rental_fee), 0);
  const nameOf = (b) => (b.facebook_account_name || b.full_name || "—").slice(0, 24);

  console.log("── Backfill missing rental fees ─────────────────────────");
  console.log("  rule              :", rule);
  console.log("  bookings to fill  :", candidates.length);
  console.log("  skipped           :", skipped.length);
  console.log("  value to add      :", peso(total));
  console.log("  revenue now       :", peso(recorded));
  console.log("  revenue after     :", peso(recorded + total));
  console.log();

  const byMonth = {};
  for (const c of candidates) {
    const m = c.b.pick_up_date.slice(0, 7);
    (byMonth[m] ||= { n: 0, v: 0 });
    byMonth[m].n++; byMonth[m].v += c.fee;
  }
  console.log("  month     count      value");
  for (const [m, v] of Object.entries(byMonth).sort())
    console.log("   ", m, String(v.n).padStart(5), peso(v.v).padStart(14));

  console.log();
  console.log("date        days cam                   rate  addons  ->    fee   renter");
  for (const c of candidates.sort((a, b) => a.b.pick_up_date.localeCompare(b.b.pick_up_date))) {
    console.log(
      c.b.pick_up_date, String(c.days).padStart(4), norm(c.b.preferred_camera).padEnd(20),
      String(c.rate).padStart(5), String(c.addonPerDay ? "+" + c.addonPerDay + "/d" : "-").padStart(7),
      "->", String(c.fee).padStart(6), " ", nameOf(c.b),
      c.unknownAddons.length ? "  [unpriced add-on: " + c.unknownAddons.join(", ") + "]" : "",
    );
  }

  if (skipped.length) {
    console.log();
    console.log("── skipped ─────────────────────────────────────────────");
    for (const s of skipped)
      console.log("  ", s.b.response_id.slice(0, 30), "|", s.why);
  }

  if (!candidates.length) { console.log("\nNothing to fill."); return; }
  if (!commit) {
    console.log();
    console.log("DRY RUN — nothing written.");
    console.log("Apply with:  node scripts/backfill-missing-fees.js" + (withAddons ? " --with-addons" : "") + " --commit");
    return;
  }

  const runId = new Date().toISOString();
  const backupDir = path.join(__dirname, "../../database-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `backfill-fees-${runId.replace(/[:.]/g, "-")}.json`);

  let mongo = null, col = null;
  if ((process.env.MONGODB_URI || "").trim()) {
    mongo = new MongoClient(process.env.MONGODB_URI.trim());
    await mongo.connect();
    col = mongo.db(process.env.MONGODB_DB.trim()).collection(process.env.MONGODB_COLLECTION.trim());
  }

  const applied = [];
  for (const c of candidates) {
    // Only fill if it is STILL null — never overwrite a real value.
    const { data: fresh } = await supabase
      .from("bookings").select("rental_fee").eq("id", c.b.id).maybeSingle();
    if (!fresh || fresh.rental_fee != null) {
      console.log("  skip (now has a fee):", c.b.response_id.slice(0, 30));
      continue;
    }
    const { error: upErr } = await supabase
      .from("bookings").update({ rental_fee: c.fee }).eq("id", c.b.id);
    if (upErr) { console.error("  supabase failed:", c.b.response_id, upErr.message); continue; }

    let mongoOk = null;
    if (col) {
      const r = await col.updateOne({ responseId: c.b.response_id }, { $set: { RENTAL_FEE: c.fee } });
      mongoOk = r.matchedCount > 0;
    }
    applied.push({
      supabase_id: c.b.id, response_id: c.b.response_id, camera: c.b.preferred_camera,
      pick_up_date: c.b.pick_up_date, return_date: c.b.return_date,
      rental_days: c.days, effective_days: c.effDays, day_rate: c.rate,
      addon_per_day: c.addonPerDay, addons: c.addonNames,
      rule, rental_fee_before: null, rental_fee_after: c.fee, mongo_matched: mongoOk,
    });
  }

  fs.writeFileSync(backupPath, JSON.stringify({
    run_id: runId, script: "backfill-missing-fees.js", rule,
    note: "Reconstructed from the rate card in force on each booking's pick-up date. Not recovered originals.",
    totals: { count: applied.length, added: applied.reduce((s, a) => s + a.rental_fee_after, 0) },
    applied,
  }, null, 2));

  if (mongo) await mongo.close();
  console.log();
  console.log("Filled", applied.length, "bookings, adding", peso(applied.reduce((s, a) => s + a.rental_fee_after, 0)));
  console.log("Mongo mirror matched:", applied.filter((a) => a.mongo_matched).length, "/", applied.length);
  console.log("Backup:", backupPath);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
