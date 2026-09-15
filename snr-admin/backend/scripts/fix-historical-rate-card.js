/**
 * Corrects rental_fee for bookings that were priced with the CURRENT 3-tier
 * rate card when the OLD 2-tier card was actually in force.
 *
 *   OLD card (in force 2026-05-30 .. 2026-08-19) — 2 bands, 1-3 / 4+ days
 *     DJI Osmo 360        550 / 500      INSTA360 Ace Pro 2   550 / 500
 *     DJI Osmo Pocket 3   550 / 500      FUJIFILM X-T100      600 / 550
 *     DJI Osmo Nano       500 / 450      CANON G7X Mark III   700 / 650
 *
 *   NEW card (2026-08-20 onward) — 3 bands, 1-2 / 3-4 / 5+ days
 *
 * How a booking's fee was composed is NOT consistent across this window: the
 * May–June bookings bill the camera only (add-ons were not charged), while the
 * July–August ones include add-ons, and some carry the PHP 300 same-day rush
 * fee. So this script does not rebuild the fee from scratch — that would
 * silently add or drop add-on charges. Instead it identifies which formula a
 * stored fee already matches under the NEW card and re-evaluates that same
 * formula with the OLD rate, changing only the camera day-rate component.
 *
 * Anything that matches no known formula is left untouched and reported, so
 * manual prices and discounts survive.
 *
 * Writes to Supabase and the MongoDB mirror, and saves a before/after record
 * under database-backups/ for rollback.
 *
 * Usage:
 *   node scripts/fix-historical-rate-card.js            # dry run
 *   node scripts/fix-historical-rate-card.js --commit   # writes
 *
 * Safe to re-run: a row is only touched while its stored fee still equals the
 * NEW-card value, so a second run is a no-op.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createClient } = require("@supabase/supabase-js");
const { MongoClient, ObjectId } = require("mongodb");

const WINDOW_START = "2026-05-30";
const WINDOW_END = "2026-08-19"; // inclusive, by pick-up date
const EXCLUDED_STATUSES = ["pending", "rejected", "cancelled"];
const RUSH_FEE = 300;

const OLD_CARD = {
  "DJI OSMO 360":       [[3, 550], [null, 500]],
  "DJI OSMO POCKET 3":  [[3, 550], [null, 500]],
  "DJI OSMO NANO":      [[3, 500], [null, 450]],
  "INSTA360 ACE PRO 2": [[3, 550], [null, 500]],
  "FUJIFILM X-T100":    [[3, 600], [null, 550]],
  "CANON G7X MARK III": [[3, 700], [null, 650]],
};
const NEW_CARD = {
  "DJI OSMO 360":       [[2, 550], [4, 500], [null, 450]],
  "DJI OSMO POCKET 3":  [[2, 550], [4, 500], [null, 450]],
  "DJI OSMO NANO":      [[2, 500], [4, 450], [null, 400]],
  "INSTA360 ACE PRO 2": [[2, 550], [4, 500], [null, 450]],
  "FUJIFILM X-T100":    [[2, 550], [4, 500], [null, 450]],
  "CANON G7X MARK III": [[2, 600], [4, 550], [null, 500]],
};
const ADDON_RATES = {
  "DJI OSMO 360": { "DOUBLE CRAB CLAMP":40,"LONG INVISIBLE STICK (3 METERS)":50,"BULLET TIME TRIPOD":40,"QUADPOD STAND":40,"256GB SD CARD":60,"512GB SD CARD":80,"EXTRA 2 BATTERIES":80 },
  "DJI OSMO POCKET 3": { "512GB SD CARD":80,"EXTENDED BATTERY HANDLE":50,"MINI MIC":50,"MAGNETIC MOUNT":50,"QUADPOD STAND":40,"256GB SD CARD":60 },
  "DJI OSMO NANO": {},
  "INSTA360 ACE PRO 2": { "DOUBLE CRAB CLAMP":40,"DIVE CASE":80,"MAGNETIC NECK MOUNT":40,"QUADPOD STAND":40,"256GB SD CARD":60,"512GB SD CARD":80,"EXTRA ACEPRO BATTERY":80 },
  "FUJIFILM X-T100": { "EXTRA X-T100 BATTERY":50,"CAMERA TRIPOD":50,"MINI TRIPOD":40,"128GB SD CARD":50,"25MM F1.8 PRIME LENS":150,"85MM F1.8 PRIME LENS":200 },
  "CANON G7X MARK III": { "EXTRA G7X BATTERY":50,"CAMERA TRIPOD":50,"MINI TRIPOD":40,"128GB SD CARD":50 },
};

const norm = (s) => (s || "").toUpperCase().trim();
const peso = (n) => "PHP " + Number(n).toLocaleString();

function rateFor(card, camera, days) {
  const tiers = card[norm(camera)];
  if (!tiers) return null;
  for (const [max, price] of tiers) if (max === null || days <= max) return price;
  return null;
}

function rentalDays(b) {
  if (!b.pick_up_date || !b.return_date) return null;
  const start = new Date(b.pick_up_date + "T00:00:00");
  const end = new Date(b.return_date + "T00:00:00");
  if (isNaN(start) || isNaN(end)) return null;
  return Math.max(Math.round((end - start) / 86400000), 1);
}

/**
 * The four shapes a stored fee takes in this window. Each is evaluated under a
 * given day-rate so the same shape can be re-costed on the other card.
 */
function shapes(rate, effDays, addonPerDay) {
  return [
    { id: "camera-only",             value: Math.round(rate * effDays) },
    { id: "camera-only +rush",       value: Math.round(rate * effDays) + RUSH_FEE },
    { id: "camera + add-ons",        value: Math.round(rate * effDays + addonPerDay * effDays) },
    { id: "camera + add-ons +rush",  value: Math.round(rate * effDays + addonPerDay * effDays) + RUSH_FEE },
  ];
}

async function main() {
  const commit = process.argv.includes("--commit");

  const supabase = createClient(
    (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
    (process.env.SUPABASE_SERVICE_KEY || "").trim(),
  );

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id,response_id,full_name,facebook_account_name,preferred_camera,pick_up_date,return_date,rental_fee,status,half_day_late,half_day_early,updated_at");
  if (error) { console.error("Fetch failed:", error.message); process.exit(1); }

  const { data: addonRows } = await supabase.from("booking_addons").select("booking_id,addon_name");
  const addonsBy = {};
  for (const a of addonRows || []) (addonsBy[a.booking_id] ||= []).push(a.addon_name);

  const inWindow = bookings.filter(
    (b) =>
      b.pick_up_date >= WINDOW_START &&
      b.pick_up_date <= WINDOW_END &&
      !EXCLUDED_STATUSES.includes((b.status || "").toLowerCase()) &&
      b.rental_fee != null,
  );

  const toFix = [];
  const alreadyOld = [];
  const unmatched = [];

  for (const b of inWindow) {
    const days = rentalDays(b);
    if (!days) continue;
    const oldRate = rateFor(OLD_CARD, b.preferred_camera, days);
    const newRate = rateFor(NEW_CARD, b.preferred_camera, days);
    if (oldRate == null || newRate == null) { unmatched.push({ b, why: "unknown camera" }); continue; }

    const table = ADDON_RATES[norm(b.preferred_camera)] || {};
    const addonPerDay = (addonsBy[b.id] || []).reduce((s, n) => s + (table[norm(n)] || 0), 0);
    const effDays = days + (b.half_day_late ? 0.5 : 0) - (b.half_day_early ? 0.5 : 0);
    const stored = Number(b.rental_fee);

    const oldShapes = shapes(oldRate, effDays, addonPerDay);
    const newShapes = shapes(newRate, effDays, addonPerDay);

    // Correct already? (checked first — when both cards agree, nothing to do)
    const onOld = oldShapes.find((s) => s.value === stored);
    if (onOld) { alreadyOld.push({ b, shape: onOld.id }); continue; }

    const onNew = newShapes.find((s) => s.value === stored);
    if (onNew) {
      const target = oldShapes.find((s) => s.id === onNew.id).value;
      toFix.push({ b, days, effDays, addonPerDay, oldRate, newRate, shape: onNew.id, before: stored, after: target });
      continue;
    }
    unmatched.push({ b, why: `no formula matches (stored ${stored})` });
  }

  const delta = toFix.reduce((s, r) => s + (r.after - r.before), 0);
  const nameOf = (b) => (b.facebook_account_name || b.full_name || "—").slice(0, 24);

  console.log("── Historical rate-card correction ──────────────────────");
  console.log("  window (pick-up) :", WINDOW_START, "..", WINDOW_END);
  console.log("  active bookings  :", inWindow.length);
  console.log("  already on OLD   :", alreadyOld.length);
  console.log("  TO CORRECT       :", toFix.length);
  console.log("  left untouched   :", unmatched.length);
  console.log("  revenue delta    : +" + peso(delta));
  console.log();
  console.log("date        days cam                  shape                   before ->  after");
  for (const r of toFix.sort((a, b) => a.b.pick_up_date.localeCompare(b.b.pick_up_date))) {
    console.log(
      r.b.pick_up_date, String(r.days).padStart(4), norm(r.b.preferred_camera).padEnd(20),
      r.shape.padEnd(23), String(r.before).padStart(6), "->", String(r.after).padStart(6),
      " ", nameOf(r.b),
    );
  }
  if (unmatched.length) {
    console.log();
    console.log("── left untouched (manual prices / discounts) ───────────");
    for (const u of unmatched.sort((a, b) => a.b.pick_up_date.localeCompare(b.b.pick_up_date)))
      console.log("  ", u.b.pick_up_date, norm(u.b.preferred_camera).padEnd(20), String(u.b.rental_fee).padStart(6), " ", u.why);
  }

  if (!toFix.length) { console.log("\nNothing to correct — already consistent with the old card."); return; }
  if (!commit) { console.log("\nDRY RUN — nothing written. Re-run with --commit to apply."); return; }

  // ── backup ────────────────────────────────────────────────────────────────
  const runId = new Date().toISOString();
  const backupDir = path.join(__dirname, "../../database-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `rate-card-fix-${runId.replace(/[:.]/g, "-")}.json`);

  // ── Mongo mirror ──────────────────────────────────────────────────────────
  let mongo = null, mongoCol = null;
  if ((process.env.MONGODB_URI || "").trim()) {
    mongo = new MongoClient(process.env.MONGODB_URI.trim());
    await mongo.connect();
    mongoCol = mongo.db(process.env.MONGODB_DB.trim()).collection(process.env.MONGODB_COLLECTION.trim());
  }

  const applied = [];
  for (const r of toFix) {
    // Re-check under the current value so a re-run can't double-apply.
    const { data: fresh } = await supabase
      .from("bookings").select("rental_fee").eq("id", r.b.id).maybeSingle();
    if (!fresh || Number(fresh.rental_fee) !== r.before) {
      console.log("  skip (changed since scan):", r.b.response_id);
      continue;
    }
    const { error: upErr } = await supabase
      .from("bookings").update({ rental_fee: r.after }).eq("id", r.b.id);
    if (upErr) { console.error("  supabase update failed:", r.b.response_id, upErr.message); continue; }

    let mongoOk = null;
    if (mongoCol) {
      const res = await mongoCol.updateOne(
        { responseId: r.b.response_id },
        { $set: { RENTAL_FEE: r.after } },
      );
      mongoOk = res.matchedCount > 0;
    }
    applied.push({
      supabase_id: r.b.id, response_id: r.b.response_id, camera: r.b.preferred_camera,
      pick_up_date: r.b.pick_up_date, return_date: r.b.return_date,
      rental_days: r.days, effective_days: r.effDays, addon_per_day: r.addonPerDay,
      fee_shape: r.shape, old_rate: r.oldRate, new_rate: r.newRate,
      rental_fee_before: r.before, rental_fee_after: r.after,
      supabase_updated_at_before: r.b.updated_at, mongo_matched: mongoOk,
    });
  }

  fs.writeFileSync(backupPath, JSON.stringify({
    run_id: runId,
    script: "fix-historical-rate-card.js",
    scope: { field: "pick_up_date", start_inclusive: WINDOW_START, end_inclusive: WINDOW_END },
    rule: "Re-cost the fee shape the stored value already matched, swapping the NEW-card day-rate for the OLD-card one. Add-ons and rush fees preserved as charged.",
    totals: {
      count: applied.length,
      before: applied.reduce((s, a) => s + a.rental_fee_before, 0),
      after: applied.reduce((s, a) => s + a.rental_fee_after, 0),
      delta: applied.reduce((s, a) => s + (a.rental_fee_after - a.rental_fee_before), 0),
    },
    applied,
  }, null, 2));

  if (mongo) await mongo.close();

  console.log();
  console.log("Updated", applied.length, "bookings. Delta +" +
    peso(applied.reduce((s, a) => s + (a.rental_fee_after - a.rental_fee_before), 0)));
  console.log("Mongo mirror matched:", applied.filter((a) => a.mongo_matched).length, "/", applied.length);
  console.log("Backup:", backupPath);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
